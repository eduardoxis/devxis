import {
  check,
  id,
  str,
  fields,
  integer,
  date,
  choice,
  QUOTE_STATUSES,
  quoteForClient,
} from "../shared/workspace-domain.js";
import {
  requireAdmin,
  page,
  mustGet,
  audit,
  notify,
  stamp,
  updated,
  expectRevision,
} from "./core.js";
const proposalSchema = {
  title: (v) => str(v, 160, true),
  scope: (v) => str(v, 12000, true),
  services: (v) => str(v, 6000, true),
  deliverables: (v) => str(v, 6000, true),
  terms: (v) => str(v, 6000, true),
  valueCents: (v) => integer(v, 0, 100000000),
  deadline: date,
  estimatedDays: (v) => integer(v, 1, 3650),
};
export async function commercial(ctx, action, body, params) {
  const collection = ctx.db.collection("quotes");
  if (action === "list") {
    const result = await page(
      ctx.admin ? collection : collection.where("clientUid", "==", ctx.uid),
      params,
    );
    if (!ctx.admin) result.items = result.items.map(quoteForClient);
    return result;
  }
  const ref = collection.doc(id(body.id || params.id));
  if (action === "get") {
    const quote = await mustGet(ref);
    check(ctx.admin || quote.clientUid === ctx.uid, "Acesso negado.", 403);
    return ctx.admin ? quote : quoteForClient(quote);
  }
  if (action === "history") {
    requireAdmin(ctx);
    return page(ref.collection("history"), params, "createdAt", "desc");
  }
  if (action === "respond")
    return ctx.db.runTransaction(async (tx) => {
      check(
        !ctx.admin,
        "A decisão deve ser registrada pela conta do cliente.",
        403,
      );
      const q = await mustGet(ref, tx);
      check(q.clientUid === ctx.uid, "Acesso negado.", 403);
      check(
        ["aprovar", "alterar", "recusar"].includes(body.decision),
        "Decisão inválida.",
      );
      if (q.status === "aprovado" && body.decision === "aprovar")
        return { projectId: q.projectId, duplicate: true };
      expectRevision(body, q);
      check(
        ["proposta enviada", "aguardando aprovação"].includes(q.status) &&
          q.sentProposal,
        "Não há proposta vigente para responder.",
        409,
      );
      check(
        body.proposalVersion === q.proposalVersion,
        "A proposta foi atualizada. Leia a nova versão.",
        409,
      );
      const comment = str(body.comment || "", 3000);
      check(
        body.decision !== "alterar" || comment.length > 0,
        "Descreva as alterações solicitadas.",
      );
      const approved = body.decision === "aprovar";
      check(
        !approved || body.confirmTerms === true,
        "Confirme expressamente o valor e o prazo.",
      );
      const projectRef = ctx.db
        .collection("client_projects")
        .doc(`quote_${q.id}`);
      const existing = approved ? await tx.get(projectRef) : null;
      const decision = {
        decision: body.decision,
        comment,
        actorUid: ctx.uid,
        proposalVersion: q.proposalVersion,
        acceptedValueCents: approved ? q.sentProposal.valueCents : null,
        acceptedDeadline: approved ? q.sentProposal.deadline : null,
        createdAt: stamp(),
      };
      const status = approved
        ? "aprovado"
        : body.decision === "alterar"
          ? "alterações solicitadas"
          : "recusado";
      const update = {
        status,
        ...updated(ctx, q),
        ...(approved ? { projectId: projectRef.id } : {}),
        lastDecision: decision,
      };
      if (approved) {
        check(
          !existing.exists || existing.data().sourceQuoteId === q.id,
          "Conflito de projeto.",
          409,
        );
        if (!existing.exists) {
          tx.create(projectRef, {
            name: q.sentProposal.title,
            clientUid: q.clientUid,
            clientName: q.nome,
            service: q.tipoSistema,
            sourceQuoteId: q.id,
            proposalVersion: q.proposalVersion,
            scope: q.sentProposal.scope,
            contract: q.sentProposal,
            status: "Aguardando início",
            startDate: "",
            deadline: q.sentProposal.deadline,
            valueCents: q.sentProposal.valueCents,
            progress: 0,
            fileBytes: 0,
            fileCount: 0,
            taskCount: 0,
            stageCount: 0,
            createdAt: stamp(),
            ...updated(ctx),
          });
          audit(ctx, tx, {
            projectId: projectRef.id,
            action: "Projeto criado a partir da proposta aprovada",
            shared: true,
          });
          notify(ctx, tx, {
            recipient: ctx.uid,
            projectId: projectRef.id,
            title: "Seu projeto foi criado",
            kind: "project",
          });
        }
      }
      tx.update(ref, update);
      tx.create(ref.collection("decisions").doc(), decision);
      tx.create(ref.collection("history").doc(), {
        action: `Cliente: ${status}`,
        authorUid: ctx.uid,
        createdAt: stamp(),
        decision,
      });
      audit(ctx, tx, {
        projectId: approved ? projectRef.id : "",
        action: `Proposta: ${status}`,
        shared: approved,
        details: q.id,
      });
      notify(ctx, tx, {
        title: `Proposta ${status}: ${q.nome}`,
        kind: "proposal",
        relatedId: q.id,
      });
      return { id: q.id, ...update };
    });
  requireAdmin(ctx);
  return ctx.db.runTransaction(async (tx) => {
    const q = await mustGet(ref, tx);
    expectRevision(body, q);
    let update = {};
    if (action === "save") {
      check(
        q.status !== "aprovado",
        "A proposta aprovada é imutável; solicite alteração contratual no projeto.",
        409,
      );
      update = fields(body.data, {
        nome: (v) => str(v, 100, true),
        empresa: (v) => str(v, 120),
        whatsapp: (v) => str(v, 25),
        descricao: (v) => str(v, 6000, true),
        responsible: (v) => str(v, 100),
        status: (v) =>
          choice(
            v,
            QUOTE_STATUSES.filter(
              (s) =>
                ![
                  "aprovado",
                  "proposta enviada",
                  "aguardando aprovação",
                ].includes(s),
            ),
          ),
        clientUid: id,
      });
      if (update.clientUid) {
        const client = await mustGet(
          ctx.db.collection("clients").doc(update.clientUid),
          tx,
        );
        check(
          !q.clientUid || q.clientUid === client.uid,
          "O destinatário já vinculado não pode ser substituído.",
        );
        update.email = client.email;
      }
      if (["proposta enviada", "aguardando aprovação"].includes(q.status))
        check(
          !update.status ||
            update.status === "cancelado" ||
            update.status === "em elaboração",
          "Retorne à elaboração antes de editar uma proposta enviada.",
        );
    } else if (action === "proposal") {
      check(
        q.status !== "aprovado",
        "Contrato aprovado não pode ser reescrito.",
        409,
      );
      const proposal = fields(body.data, proposalSchema);
      check(
        Object.keys(proposalSchema).every((key) =>
          Object.hasOwn(proposal, key),
        ),
        "Preencha todos os dados da proposta.",
      );
      update = { draftProposal: proposal, status: "em elaboração" };
    } else if (action === "send") {
      check(
        q.clientUid && q.draftProposal,
        "Vincule um cliente verificado e elabore a proposta.",
      );
      check(
        [
          "em elaboração",
          "alterações solicitadas",
          "em análise",
          "recusado",
        ].includes(q.status),
        "Retorne à elaboração antes de reenviar.",
        409,
      );
      await mustGet(ctx.db.collection("clients").doc(q.clientUid), tx);
      const version = (q.proposalVersion || 0) + 1;
      update = {
        status: "aguardando aprovação",
        proposalVersion: version,
        sentProposal: q.draftProposal,
      };
      tx.create(
        ref.collection("versions").doc(String(version).padStart(6, "0")),
        { ...q.draftProposal, version, authorUid: ctx.uid, createdAt: stamp() },
      );
      notify(ctx, tx, {
        recipient: q.clientUid,
        title: "Uma proposta aguarda sua decisão",
        kind: "proposal",
        relatedId: q.id,
      });
    } else if (action === "archive") {
      update = { archived: body.archived === true };
    } else check(false, "Ação inválida.");
    update = { ...update, ...updated(ctx, q) };
    tx.update(ref, update);
    tx.create(ref.collection("history").doc(), {
      action,
      previous: q,
      changes: update,
      authorUid: ctx.uid,
      createdAt: stamp(),
    });
    audit(ctx, tx, { action: `Orçamento: ${action}`, details: q.id });
    return { ...q, ...update };
  });
}
