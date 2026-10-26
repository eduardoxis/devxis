import {
  check,
  id,
  str,
  fields,
  integer,
  date,
  bool,
  textList,
  taskBlocked,
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
const schema = {
  title: (v) => str(v, 160, true),
  type: (v) => str(v, 80, true),
  description: (v) => str(v, 8000, true),
  reason: (v) => str(v, 4000),
  deadline: date,
  costCents: (v) => integer(v, 0, 100000000),
  impactDays: (v) => integer(v, 0, 3650),
  taskId: (v) => (v === "" ? "" : id(v)),
  attachments: (v) => textList(v, 10),
  scopeChange: (v) => str(v, 12000),
};
export async function approvals(ctx, action, body, params) {
  const projectId = id(body.projectId || params.projectId);
  const project = await projectAccess(ctx, projectId);
  const parent = ctx.db.collection("client_projects").doc(projectId);
  const coll = parent.collection("approvals");
  if (action === "list") return page(coll, params);
  if (action === "versions") {
    await mustGet(coll.doc(id(params.id)));
    return page(coll.doc(params.id).collection("versions"), params);
  }
  check(["save", "respond", "cancel"].includes(action), "Ação inválida.");
  return ctx.db.runTransaction(async (tx) => {
    const currentProject = await projectAccess(ctx, projectId, tx);
    const ref = body.id ? coll.doc(id(body.id)) : coll.doc();
    const snap = await tx.get(ref);
    const previous = snap.exists ? row(snap) : null;
    if (previous) expectRevision(body, previous);
    else
      check(action === "save" && !body.id, "Solicitação não encontrada.", 404);
    let value,
      task = null,
      tasks = [],
      otherApprovals = [];
    if (action === "save") {
      requireAdmin(ctx);
      check(
        !previous || previous.status !== "aprovado",
        "Uma autorização aprovada é imutável. Crie uma nova solicitação.",
        409,
      );
      const data = fields(body.data, schema);
      value = {
        reason: "",
        deadline: "",
        costCents: 0,
        impactDays: 0,
        taskId: "",
        attachments: [],
        scopeChange: "",
        ...previous,
        ...data,
        projectId,
        version: (previous?.version || 0) + 1,
        status: "pendente",
        blocking: true,
        clientUid: project.clientUid,
        createdAt: previous?.createdAt || stamp(),
        ...updated(ctx, previous),
      };
      check(
        value.title && value.description,
        "Preencha o título e a descrição.",
      );
      check(
        !previous || previous.taskId === value.taskId,
        "Crie outra solicitação para vincular uma tarefa diferente.",
      );
      if (value.attachments?.length) {
        const files = await Promise.all(
          value.attachments.map((fileId) =>
            tx.get(parent.collection("files").doc(fileId)),
          ),
        );
        check(
          files.every((s) => s.exists && s.data().visible),
          "Os anexos devem pertencer ao projeto e estar compartilhados.",
        );
      }
      if (value.taskId) {
        task = await mustGet(parent.collection("tasks").doc(value.taskId), tx);
        check(
          task.visible && task.status !== "Concluída",
          "Use uma tarefa visível ainda não concluída.",
        );
      }
    } else {
      check(
        previous.status === "pendente" ||
          (action === "cancel" &&
            ["alterações solicitadas", "recusado"].includes(previous.status)),
        "Esta solicitação já foi respondida.",
        409,
      );
      if (action === "respond") {
        check(
          !ctx.admin && currentProject.clientUid === ctx.uid,
          "Apenas o cliente do projeto pode responder.",
          403,
        );
        check(
          body.version === previous.version,
          "Leia a versão atual da solicitação.",
          409,
        );
        check(
          ["aprovado", "alterações solicitadas", "recusado"].includes(
            body.decision,
          ),
          "Decisão inválida.",
        );
        const comment = str(body.comment || "", 3000);
        check(
          body.decision !== "alterações solicitadas" || comment,
          "Descreva as alterações.",
        );
        if (
          body.decision === "aprovado" &&
          (previous.costCents > 0 || previous.impactDays > 0)
        )
          check(
            body.confirmImpact === true,
            "Confirme expressamente o custo adicional e o impacto no prazo.",
          );
        value = {
          ...previous,
          status: body.decision,
          blocking: body.decision !== "aprovado",
          response: {
            decision: body.decision,
            comment,
            actorUid: ctx.uid,
            version: previous.version,
            acceptedCostCents: previous.costCents || 0,
            acceptedImpactDays: previous.impactDays || 0,
            createdAt: stamp(),
          },
          ...updated(ctx, previous),
        };
      } else {
        requireAdmin(ctx);
        value = {
          ...previous,
          status: "cancelado",
          blocking: false,
          ...updated(ctx, previous),
        };
      }
      if (previous.taskId) {
        task = await mustGet(
          parent.collection("tasks").doc(previous.taskId),
          tx,
        );
        const [a, t] = await Promise.all([
          tx.get(coll.where("blocking", "==", true).limit(121)),
          tx.get(parent.collection("tasks").limit(121)),
        ]);
        otherApprovals = a.docs.map(row).filter((a) => a.id !== ref.id);
        tasks = t.docs.map(row);
      }
    }
    const { id: ignored, ...stored } = value;
    if (action === "save")
      tx.create(
        ref.collection("versions").doc(String(value.version).padStart(6, "0")),
        stored,
      );
    if (action === "respond")
      tx.create(
        ref.collection("responses").doc(String(value.version).padStart(6, "0")),
        value.response,
      );
    tx.set(ref, stored);
    if (task) {
      const blocked =
        action === "save" ||
        taskBlocked(
          task,
          tasks,
          otherApprovals.concat({ ...value, id: ref.id }),
        );
      tx.update(parent.collection("tasks").doc(task.id), {
        blocked,
        ...(action === "save"
          ? { status: "Aguardando cliente" }
          : {
              status:
                task.status === "Aguardando cliente" && !blocked
                  ? "Não iniciada"
                  : task.status,
            }),
        ...updated(ctx, task),
      });
    }
    const projectUpdate = { ...updated(ctx, currentProject) };
    if (action === "respond" && value.status === "aprovado") {
      projectUpdate.valueCents =
        (currentProject.valueCents || 0) + (value.costCents || 0);
      check(
        projectUpdate.valueCents <= 100000000,
        "Valor contratado excede o limite.",
      );
      if (value.impactDays) {
        check(
          currentProject.deadline,
          "O projeto precisa de prazo antes de aceitar impacto em dias.",
        );
        const deadline = new Date(`${currentProject.deadline}T12:00:00Z`);
        deadline.setUTCDate(deadline.getUTCDate() + value.impactDays);
        projectUpdate.deadline = deadline.toISOString().slice(0, 10);
      }
      if (value.scopeChange) projectUpdate.scope = value.scopeChange;
      tx.create(parent.collection("contract_versions").doc(), {
        valueCents: projectUpdate.valueCents,
        deadline: projectUpdate.deadline || currentProject.deadline,
        scope: projectUpdate.scope || currentProject.scope,
        approvalId: ref.id,
        approvalVersion: value.version,
        acceptedBy: ctx.uid,
        createdAt: stamp(),
      });
    }
    tx.update(parent, projectUpdate);
    audit(ctx, tx, {
      projectId,
      action: `Aprovação: ${action === "save" ? "solicitada" : value.status}`,
      details: value.title,
      shared: true,
    });
    notify(ctx, tx, {
      recipient: ctx.admin ? project.clientUid : "admin",
      projectId,
      title: `${value.title}: ${value.status}`,
      kind: "approval",
      relatedId: ref.id,
    });
    return { id: ref.id, ...stored };
  });
}
