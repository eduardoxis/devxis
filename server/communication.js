import {
  check,
  id,
  str,
  fields,
  bool,
  todayDate,
} from "../shared/workspace-domain.js";
import {
  page,
  mustGet,
  projectAccess,
  audit,
  notify,
  stamp,
  requireAdmin,
  row,
} from "./core.js";
export async function messages(ctx, action, body, params) {
  const projectId = id(body.projectId || params.projectId);
  const project = await projectAccess(ctx, projectId);
  const coll = ctx.db
    .collection("client_projects")
    .doc(projectId)
    .collection("messages");
  if (action === "list") {
    const visible = ctx.admin ? coll : coll.where("visible", "==", true);
    return page(
      params.taskId
        ? visible.where("taskId", "==", id(params.taskId))
        : visible,
      params,
      "createdAt",
      "desc",
    );
  }
  if (action === "read") {
    const ref = coll.doc(id(body.id));
    await ctx.db.runTransaction(async (tx) => {
      const msg = await mustGet(ref, tx);
      check(ctx.admin || msg.visible === true, "Mensagem privada.", 403);
      if (msg.authorUid !== ctx.uid)
        tx.update(ref, { readAt: stamp(), readBy: ctx.uid });
    });
    return { ok: true };
  }
  check(action === "send", "Ação inválida.");
  const content = str(body.content, 5000, true);
  const taskId = body.taskId ? id(body.taskId) : "";
  let visible = true;
  if (taskId) {
    const task = await mustGet(
      ctx.db
        .collection("client_projects")
        .doc(projectId)
        .collection("tasks")
        .doc(taskId),
    );
    check(ctx.admin || task.visible, "Esta tarefa é privada.");
    visible = task.visible === true;
  }
  const ref = coll.doc();
  const data = {
    content,
    taskId,
    visible,
    authorUid: ctx.uid,
    authorName: ctx.name || ctx.email,
    authorRole: ctx.admin ? "Administrador" : "Cliente",
    createdAt: stamp(),
    readAt: null,
  };
  await ctx.db.runTransaction(async (tx) => {
    await projectAccess(ctx, projectId, tx);
    tx.create(ref, data);
    if (visible)
      notify(ctx, tx, {
        recipient: ctx.admin ? project.clientUid : "admin",
        projectId,
        title: "Nova mensagem no projeto",
        kind: "message",
        relatedId: ref.id,
      });
    audit(ctx, tx, { projectId, action: "Mensagem enviada", shared: visible });
  });
  return { id: ref.id, ...data };
}
export async function notifications(ctx, action, body, params) {
  const recipient = ctx.admin ? "admin" : ctx.uid;
  const coll = ctx.db.collection("notifications");
  if (action === "list")
    return page(
      coll.where("recipient", "==", recipient),
      params,
      "createdAt",
      "desc",
    );
  check(action === "read", "Ação inválida.");
  const ref = coll.doc(id(body.id));
  await ctx.db.runTransaction(async (tx) => {
    const value = await mustGet(ref, tx);
    check(value.recipient === recipient, "Acesso negado.", 403);
    tx.update(ref, { readAt: stamp() });
  });
  return { ok: true };
}
export async function settings(ctx, action, body) {
  const ref = ctx.db.collection("settings").doc("workspace");
  if (action === "get") {
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};
    return {
      businessName: data.businessName || "DEVXIS",
      contactEmail: data.contactEmail || "",
      reportFooter: data.reportFooter || "",
    };
  }
  requireAdmin(ctx);
  check(action === "save", "Ação inválida.");
  const data = fields(body.data, {
    businessName: (v) => str(v, 120, true),
    contactEmail: (v) => str(v, 160),
    reportFooter: (v) => str(v, 1000),
  });
  await ref.set(data, { merge: true });
  return data;
}
export async function dashboard(ctx) {
  requireAdmin(ctx);
  const db = ctx.db;
  const today = todayDate();
  const count = async (q) => (await q.count().get()).data().count;
  const jobs = {
    clients: db.collection("clients"),
    newQuotes: db.collection("quotes").where("status", "==", "novo"),
    waitingQuotes: db
      .collection("quotes")
      .where("status", "==", "aguardando aprovação"),
    activeProjects: db
      .collection("client_projects")
      .where("status", "in", [
        "Aguardando início",
        "Em planejamento",
        "Em desenvolvimento",
        "Aguardando cliente",
        "Em revisão",
      ]),
    completedProjects: db
      .collection("client_projects")
      .where("status", "==", "Concluído"),
    lateProjects: db
      .collection("client_projects")
      .where("deadline", ">", "")
      .where("deadline", "<", today)
      .where("status", "in", [
        "Aguardando início",
        "Em planejamento",
        "Em desenvolvimento",
        "Aguardando cliente",
        "Em revisão",
      ]),
    waitingApprovals: db
      .collectionGroup("approvals")
      .where("status", "==", "pendente"),
    pendingTasks: db
      .collectionGroup("tasks")
      .where("status", "in", [
        "Não iniciada",
        "Em andamento",
        "Bloqueada",
        "Aguardando cliente",
        "Em revisão",
      ]),
    lateTasks: db
      .collectionGroup("tasks")
      .where("deadline", ">", "")
      .where("deadline", "<", today)
      .where("status", "in", [
        "Não iniciada",
        "Em andamento",
        "Bloqueada",
        "Aguardando cliente",
        "Em revisão",
      ]),
  };
  const totals = Object.fromEntries(
    await Promise.all(
      Object.entries(jobs).map(async ([key, q]) => [key, await count(q)]),
    ),
  );
  const [recent, deliveries] = await Promise.all([
    db.collection("activity_logs").orderBy("createdAt", "desc").limit(12).get(),
    db
      .collection("client_projects")
      .where("deadline", ">=", today)
      .where("status", "in", [
        "Aguardando início",
        "Em planejamento",
        "Em desenvolvimento",
        "Aguardando cliente",
        "Em revisão",
      ])
      .orderBy("deadline")
      .limit(8)
      .get(),
  ]);
  return {
    totals,
    recent: recent.docs.map(row),
    deliveries: deliveries.docs.map(row),
  };
}
