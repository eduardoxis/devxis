import {
  check,
  id,
  str,
  fields,
  number,
  date,
  bool,
  choice,
  textList,
  PROJECT_STATUSES,
  TASK_STATUSES,
  progress,
  taskBlocked,
  projectForClient,
} from "../shared/workspace-domain.js";
import {
  requireAdmin,
  page,
  mustGet,
  projectAccess,
  audit,
  notify,
  stamp,
  updated,
  expectRevision,
  row,
} from "./core.js";
import { matchesProject } from "../shared/project-search.js";
const projectSchema = {
  name: (v) => str(v, 160, true),
  service: (v) => str(v, 100, true),
  scope: (v) => str(v, 12000),
  startDate: date,
  deadline: date,
  status: (v) => choice(v, PROJECT_STATUSES),
  internalNotes: (v) => str(v, 6000),
};
const stageSchema = {
  title: (v) => str(v, 160, true),
  description: (v) => str(v, 4000),
  deadline: date,
  weight: (v) => number(v, 0.1, 100),
  order: (v) => number(v, 0, 10000),
  status: (v) => choice(v, ["Não iniciada", "Em andamento", "Concluída"]),
};
const taskSchema = {
  title: (v) => str(v, 160, true),
  description: (v) => str(v, 6000),
  stageId: id,
  priority: (v) => choice(v, ["Baixa", "Normal", "Alta", "Urgente"]),
  status: (v) => choice(v, TASK_STATUSES),
  deadline: date,
  weight: (v) => number(v, 0.1, 100),
  order: (v) => number(v, 0, 10000),
  dependencies: (v) => textList(v, 12),
  manualBlocked: bool,
  visible: bool,
  attachments: (v) => textList(v, 10),
};
export async function projects(ctx, action, body, params) {
  const coll = ctx.db.collection("client_projects");
  if (action === "search") {
    const search = str(params.search || "", 100);
    const size = Math.floor(
      Math.min(Math.max(Number(params.limit) || 12, 1), 50),
    );
    const allowed = ctx.admin ? coll : coll.where("clientUid", "==", ctx.uid);
    let cursor = params.cursor ? id(params.cursor) : null,
      items = [],
      scanned = 0;
    while (items.length <= size) {
      let query = allowed.orderBy("__name__").limit(50);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.get();
      scanned += snapshot.size;
      check(
        scanned <= 1000,
        "A busca excede 1.000 projetos por consulta. Use a navegação por páginas.",
        422,
      );
      for (const doc of snapshot.docs) {
        const project = row(doc);
        if (matchesProject(project, search))
          items.push(ctx.admin ? project : projectForClient(project));
        if (items.length > size) break;
      }
      if (items.length > size || snapshot.size < 50) break;
      cursor = snapshot.docs.at(-1).id;
    }
    return {
      items: items.slice(0, size),
      nextCursor: items.length > size ? items[size - 1].id : null,
    };
  }
  if (action === "list")
    return page(
      ctx.admin ? coll : coll.where("clientUid", "==", ctx.uid),
      params,
    ).then((result) => ({
      ...result,
      items: ctx.admin ? result.items : result.items.map(projectForClient),
    }));
  if (action === "create") {
    requireAdmin(ctx);
    const data = fields(body.data, projectSchema);
    check(data.name && data.service, "Informe nome e serviço.");
    const client = await mustGet(
      ctx.db.collection("clients").doc(id(body.clientUid)),
    );
    const ref = coll.doc();
    const value = {
      ...data,
      clientUid: client.id,
      clientName: client.name,
      valueCents: 0,
      contract: null,
      status: "Aguardando início",
      progress: 0,
      fileBytes: 0,
      fileCount: 0,
      taskCount: 0,
      stageCount: 0,
      createdAt: stamp(),
      ...updated(ctx),
    };
    await ctx.db.runTransaction(async (tx) => {
      tx.create(ref, value);
      audit(ctx, tx, {
        projectId: ref.id,
        action: "Projeto criado",
        shared: true,
      });
      notify(ctx, tx, {
        recipient: client.id,
        projectId: ref.id,
        title: "Novo projeto disponível",
        kind: "project",
      });
    });
    return { id: ref.id, ...value };
  }
  const projectId = id(
    body.projectId || params.projectId || body.id || params.id,
  );
  const ref = coll.doc(projectId);
  if (action === "get") {
    const project = await projectAccess(ctx, projectId);
    return ctx.admin ? project : projectForClient(project);
  }
  if (action === "history") {
    await projectAccess(ctx, projectId);
    let q = ctx.db
      .collection("activity_logs")
      .where("projectId", "==", projectId);
    if (!ctx.admin) q = q.where("shared", "==", true);
    return page(q, params, "createdAt", "desc");
  }
  requireAdmin(ctx);
  return ctx.db.runTransaction(async (tx) => {
    const project = await projectAccess(ctx, projectId, tx);
    expectRevision(body, project);
    let data;
    if (action === "save") {
      data = fields(body.data, projectSchema);
      check(
        !project.contract ||
          !Object.hasOwn(data, "deadline") ||
          data.deadline === project.deadline,
        "Alterações de prazo contratado exigem aprovação do cliente.",
      );
      check(
        !project.contract ||
          !Object.hasOwn(data, "scope") ||
          data.scope === project.scope,
        "Alterações de escopo contratado exigem aprovação do cliente.",
      );
      if (data.status === "Concluído") {
        check(
          project.progress === 100,
          "Conclua as tarefas antes de encerrar o projeto.",
        );
        const pending = await tx.get(
          ref.collection("approvals").where("blocking", "==", true).limit(1),
        );
        check(
          pending.empty,
          "Resolva as aprovações pendentes antes de concluir o projeto.",
        );
      }
    } else if (action === "update") {
      data = {};
      const message = str(body.message, 6000, true);
      audit(ctx, tx, {
        projectId,
        action: "Atualização do projeto",
        details: message,
        shared: true,
      });
      notify(ctx, tx, {
        recipient: project.clientUid,
        projectId,
        title: "Nova atualização do projeto",
        kind: "update",
      });
    } else check(false, "Ação inválida.");
    data = { ...data, ...updated(ctx, project) };
    tx.update(ref, data);
    if (action !== "update")
      audit(ctx, tx, { projectId, action: "Projeto atualizado", shared: true });
    if (data.status === "Concluído" && project.status !== "Concluído")
      notify(ctx, tx, {
        recipient: project.clientUid,
        projectId,
        title: "Projeto concluído",
        kind: "completed",
      });
    return { ...project, ...data };
  });
}
export async function workItems(ctx, resource, action, body, params) {
  const projectId = id(body.projectId || params.projectId);
  const projectRef = ctx.db.collection("client_projects").doc(projectId);
  const coll = projectRef.collection(resource);
  if (action === "list") {
    await projectAccess(ctx, projectId);
    let q = coll;
    if (!ctx.admin && resource === "tasks") q = q.where("visible", "==", true);
    return page(q, params);
  }
  requireAdmin(ctx);
  check(["save", "delete"].includes(action), "Ação inválida.");
  return ctx.db.runTransaction(async (tx) => {
    const project = await projectAccess(ctx, projectId, tx);
    const ref = body.id ? coll.doc(id(body.id)) : coll.doc();
    const previousSnap = await tx.get(ref);
    const previous = previousSnap.exists ? row(previousSnap) : null;
    if (previous) expectRevision(body, previous);
    else check(!body.id, "Registro excluído. Atualize a tela.", 409);
    const [stageSnap, taskSnap, approvalSnap] = await Promise.all([
      tx.get(projectRef.collection("stages").limit(31)),
      tx.get(projectRef.collection("tasks").limit(121)),
      tx.get(
        projectRef
          .collection("approvals")
          .where("blocking", "==", true)
          .limit(121),
      ),
    ]);
    let stages = stageSnap.docs.map(row),
      tasks = taskSnap.docs.map(row);
    const approvals = approvalSnap.docs.map(row);
    check(
      stages.length <= 30 && tasks.length <= 120 && approvals.length <= 120,
      "Limite de itens do projeto atingido.",
    );
    if (action === "delete") {
      check(previous, "Registro não encontrado.", 404);
      check(
        resource !== "stages" || !tasks.some((t) => t.stageId === ref.id),
        "Transfira as tarefas antes de excluir a etapa.",
      );
      check(
        resource !== "tasks" ||
          (!tasks.some((t) => (t.dependencies || []).includes(ref.id)) &&
            !approvals.some((a) => a.taskId === ref.id)),
        "A tarefa possui dependências ou aprovações pendentes.",
      );
      tx.delete(ref);
      if (resource === "stages") stages = stages.filter((s) => s.id !== ref.id);
      else tasks = tasks.filter((t) => t.id !== ref.id);
    } else {
      const data = fields(
        body.data,
        resource === "stages" ? stageSchema : taskSchema,
      );
      const defaults =
        resource === "stages"
          ? {
              description: "",
              deadline: "",
              status: "Não iniciada",
              weight: 1,
              order: 0,
            }
          : {
              description: "",
              priority: "Normal",
              status: "Não iniciada",
              deadline: "",
              weight: 1,
              order: 0,
              dependencies: [],
              manualBlocked: false,
              visible: false,
              attachments: [],
            };
      const value = {
        ...defaults,
        ...previous,
        ...data,
        projectId,
        ...updated(ctx, previous),
        id: ref.id,
        ...(previous ? {} : { createdAt: stamp() }),
      };
      check(value.title, "Informe um título.");
      if (resource === "tasks") {
        check(
          stages.some((s) => s.id === value.stageId),
          "Selecione uma etapa do projeto.",
        );
        check(
          !value.dependencies?.includes(ref.id),
          "Uma tarefa não pode depender de si mesma.",
        );
        check(
          (value.dependencies || []).every((dependency) =>
            tasks.some((t) => t.id === dependency),
          ),
          "Dependência não pertence ao projeto.",
        );
        const pending = [...(value.dependencies || [])],
          visited = new Set();
        while (pending.length) {
          const next = pending.pop();
          check(next !== ref.id, "Dependências circulares não são permitidas.");
          if (!visited.has(next)) {
            visited.add(next);
            pending.push(
              ...(tasks.find((t) => t.id === next)?.dependencies || []),
            );
          }
        }
        if (value.attachments?.length) {
          const attached = await Promise.all(
            value.attachments.map((fileId) =>
              tx.get(projectRef.collection("files").doc(fileId)),
            ),
          );
          check(
            attached.every((s) => s.exists),
            "Anexo não pertence ao projeto.",
          );
          check(
            !value.visible || attached.every((s) => s.data().visible),
            "Uma tarefa visível só pode conter anexos compartilhados.",
          );
        }
        value.blocked = taskBlocked(value, tasks, approvals);
        check(
          !value.blocked ||
            !["Em andamento", "Concluída"].includes(value.status),
          "A tarefa depende de aprovação, outra tarefa ou liberação manual.",
        );
        value.completedAt =
          value.status === "Concluída"
            ? previous?.completedAt || stamp()
            : null;
        if (previous) tasks = tasks.map((t) => (t.id === ref.id ? value : t));
        else {
          check(tasks.length < 120, "Máximo de 120 tarefas por projeto.");
          tasks.push(value);
        }
      } else {
        if (previous) stages = stages.map((s) => (s.id === ref.id ? value : s));
        else {
          check(stages.length < 30, "Máximo de 30 etapas por projeto.");
          stages.push(value);
        }
        if (value.status === "Concluída")
          check(
            tasks
              .filter((t) => t.stageId === ref.id)
              .every((t) => ["Concluída", "Cancelada"].includes(t.status)),
            "Conclua as tarefas antes de concluir a etapa.",
          );
      }
      const { id: ignored, ...stored } = value;
      tx.set(ref, stored);
      if (
        resource === "stages" &&
        value.status === "Concluída" &&
        previous?.status !== "Concluída"
      )
        notify(ctx, tx, {
          recipient: project.clientUid,
          projectId,
          title: `Etapa concluída: ${value.title}`,
          kind: "stage",
        });
    }
    for (const task of tasks) {
      const blocked = taskBlocked(task, tasks, approvals);
      if (
        blocked !== task.blocked &&
        !(resource === "tasks" && task.id === ref.id && action === "delete")
      )
        tx.update(projectRef.collection("tasks").doc(task.id), { blocked });
    }
    if (resource === "tasks")
      for (const stage of stages)
        if (
          stage.status === "Concluída" &&
          tasks.some(
            (task) =>
              task.stageId === stage.id &&
              !["Concluída", "Cancelada"].includes(task.status),
          )
        ) {
          tx.update(projectRef.collection("stages").doc(stage.id), {
            status: "Em andamento",
            ...updated(ctx, stage),
          });
          audit(ctx, tx, {
            projectId,
            action: "Etapa reaberta",
            details: stage.title,
            shared: true,
          });
        }
    const update = {
      progress: progress(stages, tasks),
      taskCount: tasks.length,
      stageCount: stages.length,
      ...updated(ctx, project),
    };
    if (project.status === "Concluído" && update.progress < 100) {
      update.status = "Em desenvolvimento";
      audit(ctx, tx, {
        projectId,
        action: "Projeto reaberto por alteração nas tarefas",
        shared: true,
      });
    }
    tx.update(projectRef, update);
    audit(ctx, tx, {
      projectId,
      action: `${resource === "stages" ? "Etapa" : "Tarefa"} ${action === "delete" ? "excluída" : "salva"}`,
      details: `${body.data?.title || previous?.title || ref.id}${body.data?.status ? ` — ${body.data.status}` : ""}`,
      shared:
        resource === "stages" ||
        Boolean(body.data?.visible ?? previous?.visible),
    });
    return { id: ref.id, project: { ...project, ...update } };
  });
}
