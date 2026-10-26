import { check, id, HttpError } from "../shared/workspace-domain.js";
export const requireAdmin = (ctx) =>
  check(ctx.admin, "Acesso exclusivo do administrador.", 403);
export const stamp = () => new Date().toISOString();
export const row = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
export async function mustGet(ref, transaction) {
  const snap = await (transaction ? transaction.get(ref) : ref.get());
  check(snap.exists, "Registro não encontrado.", 404);
  return row(snap);
}
export async function projectAccess(ctx, projectId, transaction) {
  const project = await mustGet(
    ctx.db.collection("client_projects").doc(id(projectId)),
    transaction,
  );
  check(ctx.admin || project.clientUid === ctx.uid, "Acesso negado.", 403);
  return project;
}
export async function page(
  query,
  params = {},
  sortField = "__name__",
  direction = "asc",
) {
  const size = Math.floor(
    Math.min(Math.max(Number(params.limit) || 20, 1), 50),
  );
  let result = query.orderBy(sortField, direction);
  if (sortField !== "__name__") result = result.orderBy("__name__", direction);
  if (params.cursor) {
    if (sortField === "__name__") result = result.startAfter(id(params.cursor));
    else {
      id(params.cursor);
      let values;
      try {
        values = JSON.parse(Buffer.from(params.cursor, "base64url").toString());
      } catch {
        check(false, "Página inválida.");
      }
      check(
        Array.isArray(values) &&
          values.length === 2 &&
          (typeof values[0] === "string" || typeof values[0] === "number"),
        "Página inválida.",
      );
      id(values[1]);
      result = result.startAfter(...values);
    }
  }
  const snapshot = await result.limit(size + 1).get();
  const items = snapshot.docs.slice(0, size).map(row);
  return {
    items,
    nextCursor:
      snapshot.docs.length > size
        ? sortField === "__name__"
          ? items.at(-1).id
          : Buffer.from(
              JSON.stringify([items.at(-1)[sortField], items.at(-1).id]),
            ).toString("base64url")
        : null,
  };
}
export function audit(
  ctx,
  tx,
  { projectId = "", action, shared = false, details = "" },
) {
  tx.create(ctx.db.collection("activity_logs").doc(), {
    projectId,
    action,
    details,
    shared,
    actorUid: ctx.uid,
    actorName: ctx.name || ctx.email,
    createdAt: stamp(),
  });
}
export function notify(
  ctx,
  tx,
  { recipient = "admin", projectId = "", title, kind, relatedId = "" },
) {
  tx.create(ctx.db.collection("notifications").doc(), {
    recipient,
    projectId,
    title,
    kind,
    relatedId,
    readAt: null,
    createdAt: stamp(),
  });
}
export function updated(ctx, previous) {
  return {
    revision: (previous?.revision || 0) + 1,
    updatedAt: stamp(),
    updatedBy: ctx.uid,
  };
}
export function expectRevision(body, previous) {
  check(
    body.revision === previous.revision ||
      (!previous.revision && body.revision === 0),
    "Este registro mudou. Atualize a tela antes de salvar.",
    409,
  );
}
export async function transaction(ctx, work) {
  return ctx.db.runTransaction((tx) => work(tx));
}
export function errorResponse(error, response) {
  const exhausted = error.code === 8 || error.code === "resource-exhausted";
  const status = error.status || (exhausted ? 429 : 500);
  if (status >= 500)
    console.error("workspace_failed", {
      code: error.code || "",
      message: error.message,
    });
  return response.status(status).json({
    error: exhausted
      ? "A cota disponível foi atingida. Aguarde a renovação da cota; nenhuma cobrança será ativada pelo sistema."
      : status < 500
        ? error.message
        : "Não foi possível concluir. Verifique a conexão e a configuração do servidor.",
  });
}
export { HttpError };
