import { parseDiagram } from "./diagram-parser.js";
import {
  check,
  id,
  str,
  fields,
  bool,
  choice,
  UML_TYPES,
  validateDiagram,
} from "../shared/workspace-domain.js";
import {
  requireAdmin,
  page,
  mustGet,
  projectAccess,
  audit,
  stamp,
  updated,
  expectRevision,
} from "./core.js";
export async function uml(ctx, action, body, params) {
  const projectId = id(body.projectId || params.projectId);
  await projectAccess(ctx, projectId);
  const parent = ctx.db.collection("client_projects").doc(projectId);
  const coll = parent.collection("uml");
  if (action === "list")
    return page(ctx.admin ? coll : coll.where("visible", "==", true), params);
  if (action === "versions") {
    requireAdmin(ctx);
    await mustGet(coll.doc(id(params.id)));
    return page(coll.doc(params.id).collection("versions"), params);
  }
  requireAdmin(ctx);
  check(["save", "duplicate", "delete"].includes(action), "Ação inválida.");
  let data;
  if (action === "save") {
    data = fields(body.data, {
      title: (v) => str(v, 160, true),
      description: (v) => str(v, 4000),
      type: (v) => choice(v, UML_TYPES),
      source: validateDiagram,
      notes: (v) => str(v, 6000),
      visible: bool,
      stageId: (v) => (v === "" ? "" : id(v)),
      taskId: (v) => (v === "" ? "" : id(v)),
    });
    check(
      data.title && data.source && data.type,
      "Preencha título, tipo e definição.",
    );
    try {
      await parseDiagram(data.source);
    } catch {
      check(
        false,
        "A sintaxe Mermaid é inválida. Corrija a definição antes de salvar.",
      );
    }
  }
  return ctx.db.runTransaction(async (tx) => {
    await projectAccess(ctx, projectId, tx);
    const ref = body.id ? coll.doc(id(body.id)) : coll.doc();
    const snap = await tx.get(ref);
    const previous = snap.exists ? snap.data() : null;
    if (previous) expectRevision(body, previous);
    else check(!body.id, "Diagrama não encontrado.", 404);
    if (action === "delete") {
      check(previous, "Diagrama não encontrado.", 404);
      tx.delete(ref);
      audit(ctx, tx, {
        projectId,
        action: "Diagrama excluído",
        details: previous.title,
        shared: previous.visible,
      });
      return { ok: true };
    }
    if (action === "duplicate") {
      check(previous, "Diagrama não encontrado.", 404);
      data = {
        ...previous,
        title: `${previous.title} — cópia`,
        visible: false,
      };
      delete data.revision;
      delete data.version;
      delete data.createdAt;
    }
    if (data.stageId)
      await mustGet(parent.collection("stages").doc(data.stageId), tx);
    if (data.taskId) {
      const task = await mustGet(
        parent.collection("tasks").doc(data.taskId),
        tx,
      );
      check(
        !data.visible || task.visible,
        "A tarefa vinculada precisa estar visível para compartilhar o diagrama.",
      );
    }
    const destination = action === "duplicate" ? coll.doc() : ref;
    const version = action === "duplicate" ? 1 : (previous?.version || 0) + 1;
    const value = {
      ...data,
      version,
      authorUid: ctx.uid,
      authorName: ctx.name || ctx.email,
      createdAt:
        action === "duplicate" ? stamp() : previous?.createdAt || stamp(),
      ...updated(ctx, action === "duplicate" ? null : previous),
    };
    tx.set(destination, value);
    tx.create(
      destination.collection("versions").doc(String(version).padStart(6, "0")),
      value,
    );
    audit(ctx, tx, {
      projectId,
      action: `Diagrama ${action === "duplicate" ? "duplicado" : "salvo"} — v${version}`,
      details: value.title,
      shared: value.visible,
    });
    return { id: destination.id, ...value };
  });
}
