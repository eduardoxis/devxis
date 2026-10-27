import test from "node:test";
import assert from "node:assert/strict";
import { FakeDb } from "./fake-firestore.js";
import { dispatch } from "../api/workspace.js";
import { validateQuotePayload } from "../api/quotes.js";
import {
  progress,
  validateDiagram,
  quoteForClient,
  projectForClient,
} from "../shared/workspace-domain.js";
import { validateFile } from "../server/files.js";
import { parseDiagram } from "../server/diagram-parser.js";
import { diagramTemplates } from "../shared/diagram-templates.js";
test("os nove modelos Mermaid possuem sintaxe válida", async () => {
  for (const source of Object.values(diagramTemplates))
    await parseDiagram(validateDiagram(source));
});
function setup() {
  const db = new FakeDb();
  const auth = {
    getUser: async (uid) => ({
      uid,
      email: `${uid}@example.com`,
      emailVerified: uid !== "unverified",
      disabled: false,
    }),
  };
  const admin = {
    db,
    auth,
    uid: "admin",
    name: "Administrador",
    email: "admin@example.com",
    admin: true,
  };
  const client = {
    ...admin,
    uid: "client",
    email: "client@example.com",
    admin: false,
  };
  const other = { ...client, uid: "other" };
  return { db, admin, client, other };
}
test("indicadores do portal contam somente os registros do cliente e atualizam leitura", async () => {
  const { db, admin, client, other } = setup();
  db.seed("client_projects/own", {
    clientUid: client.uid,
    status: "Em desenvolvimento",
  });
  db.seed("client_projects/done", {
    clientUid: client.uid,
    status: "Concluído",
  });
  db.seed("client_projects/foreign", {
    clientUid: other.uid,
    status: "Em desenvolvimento",
  });
  db.seed("quotes/own", { clientUid: client.uid, status: "novo" });
  db.seed("quotes/foreign", { clientUid: other.uid, status: "novo" });
  db.seed("client_projects/own/approvals/a", {
    clientUid: client.uid,
    status: "pendente",
  });
  db.seed("client_projects/foreign/approvals/a", {
    clientUid: other.uid,
    status: "pendente",
  });
  db.seed("client_projects/own/messages/visible", {
    visible: true,
    authorRole: "Administrador",
    authorUid: admin.uid,
    readAt: null,
    createdAt: "2026-10-27T10:00:00Z",
  });
  db.seed("client_projects/own/messages/private", {
    visible: false,
    authorRole: "Administrador",
    readAt: null,
  });
  db.seed("client_projects/own/messages/fromClient", {
    visible: true,
    authorRole: "Cliente",
    readAt: null,
  });
  db.seed("client_projects/foreign/messages/a", {
    visible: true,
    authorRole: "Administrador",
    readAt: null,
  });
  db.seed("notifications/own", { recipient: client.uid, readAt: null });
  db.seed("notifications/foreign", { recipient: other.uid, readAt: null });
  const values = await dispatch(client, "client-dashboard", "get");
  assert.equal(values.activeProjects, 1);
  assert.equal(values.quotes, 1);
  assert.equal(values.pendingApprovals, 1);
  assert.equal(values.unreadMessages, 1);
  assert.equal(values.unreadNotifications, 1);
  await dispatch(client, "messages", "read", {
    projectId: "own",
    id: "visible",
  });
  assert.equal(
    (await dispatch(client, "client-dashboard", "get")).unreadMessages,
    0,
  );
  await assert.rejects(
    () => dispatch(admin, "client-dashboard", "get"),
    /cliente/,
  );
});
test("portal funciona com índices ausentes, mantém paginação e isola as contas", async () => {
  const { db, client, other } = setup();
  db.seed("client_projects/own", {
    clientUid: client.uid,
    status: "Em desenvolvimento",
  });
  db.seed("client_projects/foreign", {
    clientUid: other.uid,
    status: "Em desenvolvimento",
  });
  db.seed("quotes/own", { clientUid: client.uid });
  for (const [project, uid] of [
    ["own", client.uid],
    ["foreign", other.uid],
  ]) {
    db.seed(`client_projects/${project}/approvals/a`, {
      clientUid: uid,
      status: "pendente",
    });
    db.seed(`client_projects/${project}/messages/a`, {
      visible: true,
      authorRole: "Administrador",
      readAt: null,
    });
  }
  db.seed("client_projects/own/messages/private", {
    visible: false,
    authorRole: "Administrador",
    readAt: null,
  });
  for (let i = 0; i < 4; i++)
    db.seed(`notifications/n${i}`, {
      recipient: client.uid,
      createdAt: `2026-10-27T10:00:0${i}Z`,
      readAt: null,
    });
  db.seed("notifications/foreign", {
    recipient: other.uid,
    createdAt: "2026-10-27T11:00:00Z",
    readAt: null,
  });
  const expected = await dispatch(client, "client-dashboard", "get");
  const indexed = await dispatch(
    client,
    "notifications",
    "list",
    {},
    { limit: 2 },
  );
  db.missingIndexes = true;
  const actual = await dispatch(client, "client-dashboard", "get");
  for (const key of [
    "activeProjects",
    "quotes",
    "pendingApprovals",
    "unreadMessages",
    "unreadNotifications",
  ])
    assert.equal(actual[key], expected[key]);
  const first = await dispatch(
    client,
    "notifications",
    "list",
    {},
    { limit: 2 },
  );
  assert.deepEqual(first, indexed);
  const second = await dispatch(
    client,
    "notifications",
    "list",
    {},
    { limit: 2, cursor: first.nextCursor },
  );
  assert.deepEqual(
    [...first.items, ...second.items].map((item) => item.id),
    ["n3", "n2", "n1", "n0"],
  );
  assert.equal(second.nextCursor, null);
  await dispatch(client, "notifications", "read", { id: "n3" });
  assert.equal(
    (await dispatch(client, "client-dashboard", "get")).unreadNotifications,
    3,
  );
  await assert.rejects(
    () => dispatch(client, "notifications", "list", {}, { cursor: "invalid" }),
    /Página inválida/,
  );
  // A ready index can resume a page created by the fallback.
  db.missingIndexes = false;
  const resumed = await dispatch(
    client,
    "notifications",
    "list",
    {},
    { limit: 2, cursor: first.nextCursor },
  );
  assert.deepEqual(
    resumed.items.map((item) => item.id),
    ["n1", "n0"],
  );
});
test("falhas de conexão ou permissão não são tratadas como índices ausentes", async () => {
  const { db, client } = setup();
  for (const code of [7, 8, 14]) {
    db.queryError = Object.assign(new Error("Falha real"), { code });
    await assert.rejects(
      () => dispatch(client, "notifications", "list"),
      /Falha real/,
    );
    await assert.rejects(
      () => dispatch(client, "client-dashboard", "get"),
      /Falha real/,
    );
  }
});
test("alternativa sem índice recusa resultados parciais e suporta conta vazia", async () => {
  const { db, client } = setup();
  db.missingIndexes = true;
  assert.equal(
    (await dispatch(client, "client-dashboard", "get")).activeProjects,
    0,
  );
  assert.deepEqual(await dispatch(client, "notifications", "list"), {
    items: [],
    nextCursor: null,
  });
  for (let i = 0; i < 1001; i++)
    db.seed(`notifications/n${i}`, {
      recipient: client.uid,
      createdAt: "2026-10-27T10:00:00Z",
      readAt: null,
    });
  await assert.rejects(
    () => dispatch(client, "notifications", "list"),
    /1.000 registros/,
  );
  await assert.rejects(
    () => dispatch(client, "client-dashboard", "get"),
    /1.000 registros/,
  );
});
test("busca de projetos é paginada, ignora acentos e não pesquisa dados privados ou de terceiros", async () => {
  const { db, client, other } = setup();
  for (let index = 0; index < 30; index++)
    db.seed(`client_projects/p${String(index).padStart(3, "0")}`, {
      name: index < 20 ? "Oficina de veículos" : "Loja virtual",
      clientUid: client.uid,
      clientName: "Empresa",
      scope: "Atendimento",
      internalNotes: "segredo",
    });
  db.seed("client_projects/foreign", {
    name: "Oficina de veículos",
    clientUid: other.uid,
    scope: "Atendimento",
  });
  const first = await dispatch(
    client,
    "projects",
    "search",
    {},
    { search: "veiculos", limit: 12 },
  );
  assert.equal(first.items.length, 12);
  assert(first.nextCursor);
  assert(
    first.items.every(
      (project) =>
        project.clientUid === client.uid && project.internalNotes === undefined,
    ),
  );
  const second = await dispatch(
    client,
    "projects",
    "search",
    {},
    { search: "veiculos", limit: 12, cursor: first.nextCursor },
  );
  assert.equal(second.items.length, 8);
  assert.equal(second.nextCursor, null);
  assert(
    !second.items.some((project) =>
      first.items.some((item) => item.id === project.id),
    ),
  );
  const empty = await dispatch(
    client,
    "projects",
    "search",
    {},
    { search: "segredo" },
  );
  assert.equal(empty.items.length, 0);
  assert.equal(empty.nextCursor, null);
});
test("cadastro salva contato e interesse sem permitir privilégios ou dados de terceiros", async () => {
  const { admin, client, other } = setup();
  const profile = await dispatch(client, "profile", "save", {
    data: {
      name: "Cliente",
      phone: "(61) 99999-9999",
      company: "Empresa",
      service: "Sistema web",
      budget: "R$ 2.000 a R$ 5.000",
      description: "Projeto solicitado",
    },
  });
  assert.equal(profile.email, client.email);
  assert.equal(profile.uid, client.uid);
  assert.equal((await dispatch(client, "profile", "get")).name, "Cliente");
  assert.equal(await dispatch(other, "profile", "get"), null);
  await assert.rejects(
    () => dispatch(other, "profile", "get", {}, { uid: client.uid }),
    /administrador/,
  );
  await assert.rejects(
    () => dispatch(client, "profile", "list"),
    /administrador/,
  );
  await assert.rejects(
    () =>
      dispatch(client, "profile", "save", {
        data: { name: "Cliente", phone: "123", isAdmin: true },
      }),
    /permitido/,
  );
  assert.equal((await dispatch(admin, "profile", "list")).items.length, 1);
});
const quoteData = {
  nome: "Cliente real de teste",
  email: "client@example.com",
  whatsapp: "(61) 99999-9999",
  tipoSistema: "Sistema web",
  faixaOrcamento: "R$ 2.000 a R$ 5.000",
  descricao: "Sistema de gestão da empresa",
};
const proposal = {
  title: "Sistema contratado",
  scope: "Escopo acordado",
  services: "Desenvolvimento",
  deliverables: "Sistema e documentação",
  terms: "Condições comerciais",
  valueCents: 200000,
  deadline: "2027-03-10",
  estimatedDays: 30,
};
test("fluxo comercial, aprovação atômica, edição e acesso do cliente", async () => {
  const { db, admin, client, other } = setup();
  db.seed("quotes/q1", { ...quoteData, status: "novo" });
  assert.equal(validateQuotePayload(quoteData).error, undefined);
  assert(validateQuotePayload({ ...quoteData, isAdmin: true }).error);
  await assert.rejects(
    () =>
      dispatch(admin, "clients", "save", {
        id: "unverified",
        data: { name: "Pessoa" },
      }),
    /confirmar/,
  );
  await dispatch(admin, "clients", "save", {
    id: "client",
    data: { name: "Cliente", company: "Empresa", phone: "", notes: "" },
  });
  let quote = await dispatch(admin, "quotes", "save", {
    id: "q1",
    revision: 0,
    data: { clientUid: "client", status: "em análise" },
  });
  assert.equal((await dispatch(client, "quotes", "list")).items.length, 1);
  assert.equal((await dispatch(other, "quotes", "list")).items.length, 0);
  quote = await dispatch(admin, "quotes", "proposal", {
    id: "q1",
    revision: quote.revision,
    data: proposal,
  });
  assert.equal(
    (await dispatch(client, "quotes", "get", {}, { id: "q1" })).draftProposal,
    undefined,
  );
  quote = await dispatch(admin, "quotes", "send", {
    id: "q1",
    revision: quote.revision,
  });
  await assert.rejects(
    () =>
      dispatch(other, "quotes", "respond", { id: "q1", decision: "aprovar" }),
    /negado/,
  );
  await assert.rejects(
    () =>
      dispatch(client, "quotes", "respond", {
        id: "q1",
        revision: quote.revision,
        proposalVersion: 1,
        decision: "aprovar",
        confirmTerms: false,
      }),
    /Confirme/,
  );
  const response = {
    id: "q1",
    revision: quote.revision,
    proposalVersion: 1,
    decision: "aprovar",
    confirmTerms: true,
  };
  db.failCommit = true;
  await assert.rejects(
    () => dispatch(client, "quotes", "respond", response),
    /Falha/,
  );
  assert.equal(db.data.has("client_projects/quote_q1"), false);
  assert.equal(db.data.get("quotes/q1").status, "aguardando aprovação");
  const approved = await Promise.all([
    dispatch(client, "quotes", "respond", response),
    dispatch(client, "quotes", "respond", response),
  ]);
  assert(approved.some((r) => r.duplicate));
  assert.equal((await dispatch(admin, "projects", "list")).items.length, 1);
  const project = await dispatch(
    client,
    "projects",
    "get",
    {},
    { id: "quote_q1" },
  );
  assert.equal(project.status, "Aguardando início");
  assert.equal(project.scope, proposal.scope);
  await assert.rejects(
    () => dispatch(other, "projects", "get", {}, { id: project.id }),
    /negado/,
  );
  await assert.rejects(
    () =>
      dispatch(client, "projects", "save", {
        projectId: project.id,
        revision: project.revision,
        data: { name: "Ataque" },
      }),
    /administrador/,
  );
  await assert.rejects(
    () =>
      dispatch(admin, "quotes", "proposal", {
        id: "q1",
        revision: quote.revision + 1,
        data: proposal,
      }),
    /reescrito/,
  );
});
async function projectFixture() {
  const ctx = setup();
  ctx.db.seed("clients/client", {
    uid: "client",
    name: "Cliente",
    email: "client@example.com",
  });
  ctx.project = await dispatch(ctx.admin, "projects", "create", {
    clientUid: "client",
    data: {
      name: "Projeto",
      service: "Sistema",
      scope: "Inicial",
      deadline: "2027-03-10",
    },
  });
  ctx.projectId = ctx.project.id;
  return ctx;
}
test("etapas, tarefas, UML persistente, revisões, aprovação, bloqueios e contrato", async () => {
  const { db, admin, client, other, projectId } = await projectFixture();
  const stage = await dispatch(admin, "stages", "save", {
    projectId,
    data: {
      title: "Planejamento",
      status: "Não iniciada",
      deadline: "2027-03-01",
      weight: 2,
      order: 1,
    },
  });
  const task = await dispatch(admin, "tasks", "save", {
    projectId,
    data: {
      title: "Modelar sistema",
      stageId: stage.id,
      status: "Não iniciada",
      priority: "Normal",
      visible: true,
      manualBlocked: false,
      dependencies: [],
      weight: 1,
      order: 1,
    },
  });
  const task2 = await dispatch(admin, "tasks", "save", {
    projectId,
    data: {
      title: "Implementar",
      stageId: stage.id,
      status: "Não iniciada",
      priority: "Alta",
      visible: false,
      manualBlocked: false,
      dependencies: [task.id],
      weight: 1,
      order: 2,
    },
  });
  assert.equal(
    (await dispatch(client, "tasks", "list", {}, { projectId })).items.length,
    1,
  );
  let diagram = await dispatch(admin, "uml", "save", {
    projectId,
    data: {
      title: "Classes",
      type: "Diagrama de classes",
      source: "classDiagram\n class Cliente",
      visible: false,
      description: "Modelo",
      notes: "Privado",
      stageId: stage.id,
      taskId: task.id,
    },
  });
  assert.equal(
    (await dispatch(client, "uml", "list", {}, { projectId })).items.length,
    0,
  );
  diagram = await dispatch(admin, "uml", "save", {
    projectId,
    id: diagram.id,
    revision: diagram.revision,
    data: {
      title: "Classes",
      type: "Diagrama de classes",
      source:
        "classDiagram\n class Cliente\n class Projeto\n Cliente --> Projeto",
      visible: true,
      description: "Modelo",
      notes: "Compartilhado",
      stageId: stage.id,
      taskId: task.id,
    },
  });
  assert.equal(diagram.version, 2);
  assert.equal(
    (
      await dispatch(
        admin,
        "uml",
        "versions",
        {},
        { projectId, id: diagram.id },
      )
    ).items.length,
    2,
  );
  await assert.rejects(
    () =>
      dispatch(admin, "uml", "save", {
        projectId,
        data: {
          title: "Inválido",
          type: "Diagrama de classes",
          source: "isto nao e mermaid",
          visible: false,
        },
      }),
    /sintaxe/,
  );
  await assert.rejects(
    () =>
      dispatch(client, "uml", "delete", {
        projectId,
        id: diagram.id,
        revision: diagram.revision,
      }),
    /administrador/,
  );
  let approval = await dispatch(admin, "approvals", "save", {
    projectId,
    data: {
      title: "Autorizar modelagem",
      type: "Escopo",
      description: "Posso prosseguir?",
      reason: "Planejamento",
      costCents: 10000,
      impactDays: 2,
      taskId: task.id,
      attachments: [],
      deadline: "2027-02-01",
      scopeChange: "Escopo revisado",
    },
  });
  let item = (
    await dispatch(admin, "tasks", "list", {}, { projectId })
  ).items.find((t) => t.id === task.id);
  assert.equal(item.blocked, true);
  await assert.rejects(
    () =>
      dispatch(admin, "tasks", "save", {
        projectId,
        id: task.id,
        revision: item.revision,
        data: { status: "Concluída" },
      }),
    /depende/,
  );
  await assert.rejects(
    () =>
      dispatch(other, "approvals", "respond", {
        projectId,
        id: approval.id,
        revision: approval.revision,
        version: approval.version,
        decision: "aprovado",
        confirmImpact: true,
      }),
    /negado/,
  );
  approval = await dispatch(client, "approvals", "respond", {
    projectId,
    id: approval.id,
    revision: approval.revision,
    version: approval.version,
    decision: "alterações solicitadas",
    comment: "Ajustar escopo",
  });
  approval = await dispatch(admin, "approvals", "save", {
    projectId,
    id: approval.id,
    revision: approval.revision,
    data: { description: "Escopo ajustado" },
  });
  assert.equal(approval.version, 2);
  await assert.rejects(
    () =>
      dispatch(client, "approvals", "respond", {
        projectId,
        id: approval.id,
        revision: approval.revision,
        version: approval.version,
        decision: "aprovado",
      }),
    /Confirme/,
  );
  await dispatch(client, "approvals", "respond", {
    projectId,
    id: approval.id,
    revision: approval.revision,
    version: approval.version,
    decision: "aprovado",
    confirmImpact: true,
  });
  await assert.rejects(
    () =>
      dispatch(client, "approvals", "respond", {
        projectId,
        id: approval.id,
        revision: approval.revision,
        version: approval.version,
        decision: "aprovado",
        confirmImpact: true,
      }),
    /mudou/,
  );
  const project = await dispatch(
    client,
    "projects",
    "get",
    {},
    { id: projectId },
  );
  assert.equal(project.valueCents, 10000);
  assert.equal(project.deadline, "2027-03-12");
  assert.equal(project.scope, "Escopo revisado");
  item = (await dispatch(admin, "tasks", "list", {}, { projectId })).items.find(
    (t) => t.id === task.id,
  );
  assert.equal(item.blocked, false);
  await dispatch(admin, "tasks", "save", {
    projectId,
    id: task.id,
    revision: item.revision,
    data: { status: "Concluída" },
  });
  const privateTask = (
    await dispatch(admin, "tasks", "list", {}, { projectId })
  ).items.find((t) => t.id === task2.id);
  assert.equal(privateTask.blocked, false);
  assert.equal(
    (await dispatch(client, "projects", "get", {}, { id: projectId })).progress,
    50,
  );
  await dispatch(admin, "tasks", "save", {
    projectId,
    id: task2.id,
    revision: privateTask.revision,
    data: { status: "Concluída" },
  });
  const currentStage = (
    await dispatch(admin, "stages", "list", {}, { projectId })
  ).items[0];
  await dispatch(admin, "stages", "save", {
    projectId,
    id: stage.id,
    revision: currentStage.revision,
    data: { status: "Concluída" },
  });
  assert.equal(
    (await dispatch(client, "projects", "get", {}, { id: projectId })).progress,
    100,
  );
  assert(
    (
      await dispatch(client, "projects", "history", {}, { projectId })
    ).items.some((e) => e.action === "Etapa salva"),
  );
  assert.equal(
    db.data.get(`client_projects/${projectId}/uml/${diagram.id}`).version,
    2,
  );
});
test("arquivos privados, mensagens, notificações e paginação", async () => {
  const { admin, client, other, projectId } = await projectFixture();
  const privateFile = await dispatch(admin, "files", "upload", {
    projectId,
    name: "nota.txt",
    type: "text/plain",
    base64: Buffer.from("Material privado").toString("base64"),
    visible: false,
  });
  const shared = await dispatch(admin, "files", "upload", {
    projectId,
    name: "entrega.txt",
    type: "text/plain",
    base64: Buffer.from("Entrega compartilhada").toString("base64"),
    visible: true,
  });
  assert.equal(
    (await dispatch(client, "files", "list", {}, { projectId })).items.length,
    1,
  );
  await assert.rejects(
    () =>
      dispatch(client, "files", "download", { projectId, id: privateFile.id }),
    /privado/,
  );
  await assert.rejects(
    () => dispatch(other, "files", "download", { projectId, id: shared.id }),
    /negado/,
  );
  assert.equal(
    Buffer.from(
      (
        await dispatch(client, "files", "download", {
          projectId,
          id: shared.id,
        })
      ).base64,
      "base64",
    ).toString(),
    "Entrega compartilhada",
  );
  assert.throws(
    () =>
      validateFile({
        name: "arquivo.pdf",
        type: "application/pdf",
        base64: Buffer.from("arquivo incorreto").toString("base64"),
      }),
    /inválido/,
  );
  assert.throws(
    () =>
      validateFile({
        name: "grande.txt",
        type: "text/plain",
        base64: "a".repeat(400000),
      }),
    /excede/,
  );
  const msg = await dispatch(client, "messages", "send", {
    projectId,
    content: "Preciso revisar a entrega.",
  });
  await dispatch(admin, "messages", "read", { projectId, id: msg.id });
  assert(
    (await dispatch(client, "messages", "list", {}, { projectId })).items[0]
      .readAt,
  );
  const first = await dispatch(
    admin,
    "notifications",
    "list",
    {},
    { limit: 1 },
  );
  assert(first.items.length === 1);
  if (first.nextCursor) {
    const second = await dispatch(
      admin,
      "notifications",
      "list",
      {},
      { limit: 1, cursor: first.nextCursor },
    );
    assert.notEqual(first.items[0].id, second.items[0].id);
  }
  const clientNotifications = await dispatch(client, "notifications", "list");
  assert(clientNotifications.items.every((n) => n.recipient === "client"));
  await assert.rejects(
    () =>
      dispatch(other, "notifications", "read", {
        id: clientNotifications.items[0].id,
      }),
    /negado/,
  );
  await dispatch(admin, "files", "delete", { projectId, id: privateFile.id });
  assert.equal(
    (await dispatch(admin, "files", "list", {}, { projectId })).items.length,
    1,
  );
});
test("peso real, fontes UML restritas e projeções sem dados internos", () => {
  assert.equal(
    progress(
      [{ id: "s", weight: 2 }],
      [
        { stageId: "s", weight: 1, status: "Concluída" },
        { stageId: "s", weight: 3, status: "Não iniciada" },
      ],
    ),
    25,
  );
  assert.equal(progress([], []), 0);
  assert.throws(
    () => validateDiagram('flowchart TD\nclick A "javascript:alert(1)"'),
    /sem diretivas/,
  );
  assert.equal(
    quoteForClient({ id: "q", draftProposal: "segredo" }).draftProposal,
    undefined,
  );
  assert.equal(
    projectForClient({ id: "p", internalNotes: "segredo" }).internalNotes,
    undefined,
  );
});
