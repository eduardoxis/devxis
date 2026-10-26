import { check, id, str, bool } from "../shared/workspace-domain.js";
import {
  requireAdmin,
  page,
  mustGet,
  projectAccess,
  audit,
  notify,
  stamp,
  updated,
} from "./core.js";
const MAX_SIZE = 200 * 1024,
  PROJECT_LIMIT = 2 * 1024 * 1024,
  CHUNK = 64 * 1024;
export function validateFile(body) {
  const name = str(body.name, 160, true).replace(/[\/\\]/g, "_");
  check(
    typeof body.base64 === "string" &&
      body.base64.length <= Math.ceil(MAX_SIZE / 3) * 4,
    "Arquivo excede 200 KB.",
  );
  check(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      body.base64,
    ),
    "Arquivo inválido.",
  );
  const bytes = Buffer.from(body.base64, "base64");
  check(
    bytes.length > 0 && bytes.length <= MAX_SIZE,
    "Arquivo vazio ou maior que 200 KB.",
  );
  const type = body.type;
  const signature = bytes.subarray(0, 12);
  const valid =
    type === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : type === "image/png"
        ? signature
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : type === "image/jpeg"
          ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255
          : type === "image/webp"
            ? signature.subarray(0, 4).toString() === "RIFF" &&
              signature.subarray(8, 12).toString() === "WEBP"
            : type === "text/plain"
              ? Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes) &&
                !bytes.includes(0)
              : false;
  check(valid, "Tipo ou conteúdo inválido. Use PDF, PNG, JPEG, WebP ou TXT.");
  return { name, type, bytes };
}
export async function files(ctx, action, body, params) {
  const projectId = id(body.projectId || params.projectId);
  await projectAccess(ctx, projectId);
  const parent = ctx.db.collection("client_projects").doc(projectId),
    coll = parent.collection("files");
  if (action === "list")
    return page(ctx.admin ? coll : coll.where("visible", "==", true), params);
  if (action === "download") {
    const file = await mustGet(coll.doc(id(body.id || params.id)));
    check(ctx.admin || file.visible, "Arquivo privado.", 403);
    const chunks = await coll
      .doc(file.id)
      .collection("chunks")
      .orderBy("__name__")
      .get();
    return {
      ...file,
      base64: Buffer.concat(
        chunks.docs.map((s) => Buffer.from(s.data().base64, "base64")),
      ).toString("base64"),
    };
  }
  requireAdmin(ctx);
  if (action === "upload") {
    const { name, type, bytes } = validateFile(body);
    const visible = bool(body.visible);
    const ref = coll.doc();
    const value = {
      name,
      type,
      size: bytes.length,
      visible,
      createdAt: stamp(),
      authorUid: ctx.uid,
    };
    await ctx.db.runTransaction(async (tx) => {
      const project = await projectAccess(ctx, projectId, tx);
      check(
        (project.fileCount || 0) < 20 &&
          (project.fileBytes || 0) + bytes.length <= PROJECT_LIMIT,
        "Limite gratuito: 20 arquivos e 2 MB por projeto. Exclua anexos antigos.",
      );
      tx.create(ref, value);
      for (
        let offset = 0, index = 0;
        offset < bytes.length;
        offset += CHUNK, index++
      )
        tx.create(ref.collection("chunks").doc(String(index)), {
          base64: bytes.subarray(offset, offset + CHUNK).toString("base64"),
        });
      tx.update(parent, {
        fileBytes: (project.fileBytes || 0) + bytes.length,
        fileCount: (project.fileCount || 0) + 1,
        ...updated(ctx, project),
      });
      audit(ctx, tx, {
        projectId,
        action: "Arquivo adicionado",
        details: name,
        shared: visible,
      });
      if (visible)
        notify(ctx, tx, {
          recipient: project.clientUid,
          projectId,
          title: `Arquivo disponibilizado: ${name}`,
          kind: "file",
          relatedId: ref.id,
        });
    });
    return { id: ref.id, ...value };
  }
  check(action === "delete", "Ação inválida.");
  const ref = coll.doc(id(body.id));
  await ctx.db.runTransaction(async (tx) => {
    const project = await projectAccess(ctx, projectId, tx);
    const file = await mustGet(ref, tx);
    const [chunks, tasks, approvals] = await Promise.all([
      tx.get(ref.collection("chunks")),
      tx.get(
        parent
          .collection("tasks")
          .where("attachments", "array-contains", ref.id)
          .limit(1),
      ),
      tx.get(
        parent
          .collection("approvals")
          .where("attachments", "array-contains", ref.id)
          .limit(1),
      ),
    ]);
    check(
      tasks.empty && approvals.empty,
      "O arquivo está vinculado a uma tarefa ou aprovação e não pode ser excluído.",
    );
    chunks.docs.forEach((s) => tx.delete(s.ref));
    tx.delete(ref);
    tx.update(parent, {
      fileCount: Math.max(0, (project.fileCount || 1) - 1),
      fileBytes: Math.max(0, (project.fileBytes || file.size) - file.size),
      ...updated(ctx, project),
    });
    audit(ctx, tx, {
      projectId,
      action: "Arquivo excluído",
      details: file.name,
      shared: file.visible,
    });
  });
  return { ok: true };
}
