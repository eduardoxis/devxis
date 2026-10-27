import { getAdminDb, getAdminAuth } from "./_firebase-admin.js";
import { rateLimit } from "./_rate-limit.js";
import { check, HttpError, id } from "../shared/workspace-domain.js";
import { errorResponse } from "../server/core.js";
import { clients } from "../server/clients.js";
import { commercial } from "../server/commercial.js";
import { projects, workItems } from "../server/projects.js";
import { approvals } from "../server/approvals.js";
import { uml } from "../server/uml.js";
import {
  messages,
  notifications,
  settings,
  dashboard,
} from "../server/communication.js";
import { files } from "../server/files.js";
import { clientProfile } from "../server/client-profile.js";
import { clientDashboard } from "../server/client-dashboard.js";
export const config = { api: { bodyParser: { sizeLimit: "320kb" } } };
const reads = {
  profile: ["get", "list"],
  session: ["get"],
  dashboard: ["get"],
  "client-dashboard": ["get"],
  clients: ["list"],
  quotes: ["list", "get", "history"],
  projects: ["list", "get", "history", "search"],
  stages: ["list"],
  tasks: ["list"],
  approvals: ["list", "versions"],
  uml: ["list", "versions"],
  messages: ["list"],
  notifications: ["list"],
  settings: ["get"],
  files: ["list"],
};
export async function dispatch(ctx, resource, action, body = {}, params = {}) {
  if (resource === "client-dashboard") {
    check(action === "get", "Ação inválida.");
    return clientDashboard(ctx);
  }
  if (resource === "profile") return clientProfile(ctx, action, body, params);
  if (resource === "session")
    return { uid: ctx.uid, email: ctx.email, name: ctx.name, admin: ctx.admin };
  if (resource === "dashboard") return dashboard(ctx);
  if (resource === "clients") return clients(ctx, action, body, params);
  if (resource === "quotes") return commercial(ctx, action, body, params);
  if (resource === "projects") return projects(ctx, action, body, params);
  if (resource === "stages" || resource === "tasks")
    return workItems(ctx, resource, action, body, params);
  if (resource === "approvals") return approvals(ctx, action, body, params);
  if (resource === "uml") return uml(ctx, action, body, params);
  if (resource === "messages") return messages(ctx, action, body, params);
  if (resource === "notifications")
    return notifications(ctx, action, body, params);
  if (resource === "files") return files(ctx, action, body, params);
  if (resource === "settings") return settings(ctx, action, body, params);
  throw new HttpError(404, "Recurso não encontrado.");
}
export default async function handler(request, response) {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  try {
    check(
      ["GET", "POST"].includes(request.method),
      "Método não permitido.",
      405,
    );
    const origin = request.headers.origin,
      host = request.headers.host;
    const allowed = (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((v) => v.trim());
    check(
      !origin ||
        origin === `https://${host}` ||
        (process.env.NODE_ENV !== "production" &&
          origin === `http://${host}`) ||
        allowed.includes(origin),
      "Origem não permitida.",
      403,
    );
    const token = String(request.headers.authorization || "").match(
      /^Bearer (.+)$/,
    )?.[1];
    check(token, "Entre na sua conta.", 401);
    const auth = getAdminAuth();
    let user;
    try {
      user = await auth.verifyIdToken(token, true);
    } catch {
      throw new HttpError(401, "Sua sessão expirou. Entre novamente.");
    }
    const db = getAdminDb(),
      record = await db.collection("users").doc(user.uid).get(),
      admin = record.exists && record.data().isAdmin === true;
    check(
      admin ||
        user.email_verified === true ||
        (request.query?.resource === "profile" &&
          ["save", "get"].includes(request.query?.action)),
      "Confirme seu e-mail antes de acessar o portal.",
      403,
    );
    const ctx = {
      db,
      auth,
      uid: user.uid,
      email: user.email || "",
      name: user.name || user.email || "",
      admin,
    };
    const params = request.query || {},
      resource = params.resource,
      action = params.action || (request.method === "GET" ? "list" : "save");
    check(
      typeof resource === "string" && typeof action === "string",
      "Rota inválida.",
    );
    if (request.method === "GET")
      check(
        reads[resource]?.includes(action),
        "Use POST para esta operação.",
        405,
      );
    else {
      check(
        String(request.headers["content-type"] || "").startsWith(
          "application/json",
        ),
        "Envie JSON.",
        415,
      );
      check(
        Number(request.headers["content-length"] || 0) <= 320 * 1024,
        "Dados muito grandes.",
        413,
      );
      check(
        await rateLimit(`workspace:${ctx.uid}`, 120, 60000),
        "Muitas operações. Aguarde um minuto.",
        429,
      );
    }
    if (params.previewProjectId) {
      check(admin, "Prévia restrita ao administrador.", 403);
      const projectId = id(params.previewProjectId);
      const project = await db
        .collection("client_projects")
        .doc(projectId)
        .get();
      check(project.exists, "Projeto não encontrado.", 404);
      check(
        request.method === "GET" ||
          (resource === "files" && action === "download"),
        "A prévia do portal é somente leitura.",
        403,
      );
      check(
        [
          "projects",
          "stages",
          "tasks",
          "approvals",
          "uml",
          "files",
          "messages",
          "settings",
        ].includes(resource),
        "Recurso indisponível na prévia.",
        403,
      );
      check(
        (params.projectId || params.id || request.body?.projectId) ===
          projectId,
        "A prévia é limitada ao projeto selecionado.",
        403,
      );
      if (resource === "projects")
        check(
          ["get", "history"].includes(action),
          "Recurso indisponível na prévia.",
          403,
        );
      ctx.admin = false;
      ctx.uid = project.data().clientUid;
    }
    return response
      .status(200)
      .json(await dispatch(ctx, resource, action, request.body || {}, params));
  } catch (error) {
    return errorResponse(error, response);
  }
}
