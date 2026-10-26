import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { getAdminAuth, getAdminDb } from "../api/_firebase-admin.js";
import workspace from "../api/workspace.js";
import quotes from "../api/quotes.js";
assert.equal(
  process.env.FIREBASE_PROJECT_ID,
  "demo-devxis",
  "Use exclusivamente o projeto demo-devxis.",
);
assert.match(
  process.env.FIRESTORE_EMULATOR_HOST || "",
  /^(127\.0\.0\.1|localhost):\d+$/,
);
assert.match(
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
  /^(127\.0\.0\.1|localhost):\d+$/,
);
process.env.RATE_LIMIT_SECRET = "devxis-emulator-tests-only";
const db = getAdminDb(),
  auth = getAdminAuth(),
  password = "DevxisTeste2026!",
  created = Date.now();
for (const [uid, email] of [
  ["e2e-admin", "admin@devxis.test"],
  ["e2e-client", "cliente@devxis.test"],
  ["e2e-other", "outro@devxis.test"],
]) {
  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, { password, emailVerified: true });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    await auth.createUser({ uid, email, password, emailVerified: true });
  }
}
await db.collection("users").doc("e2e-admin").set({ isAdmin: true });
async function login(email) {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const data = await response.json();
  assert(response.ok, JSON.stringify(data));
  return data.idToken;
}
const admin = await login("admin@devxis.test"),
  client = await login("cliente@devxis.test"),
  other = await login("outro@devxis.test");
async function call(token, resource, action, data = {}, method = "POST") {
  const request = {
    method,
    headers: {
      host: "localhost:3000",
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    query: { resource, action, ...(method === "GET" ? data : {}) },
    body: method === "POST" ? data : {},
  };
  let status = 200,
    result;
  const response = {
    setHeader() {},
    status(value) {
      status = value;
      return this;
    },
    json(value) {
      result = value;
      return this;
    },
  };
  await workspace(request, response);
  return { status, data: result };
}
async function ok(token, resource, action, data = {}, method = "POST") {
  const result = await call(token, resource, action, data, method);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
}
assert.equal((await call(null, "projects", "list", {}, "GET")).status, 401);
await ok(admin, "clients", "save", {
  id: "e2e-client",
  revision: (await db.collection("clients").doc("e2e-client").get()).data()
    ?.revision,
  data: {
    name: "Cliente de teste local",
    company: "Ambiente emulado",
    phone: "",
    notes: "Fixture restrita ao emulador",
  },
});
let publicStatus;
const request = {
  method: "POST",
  headers: {
    "content-type": "application/json",
    host: "localhost:3000",
    "x-forwarded-for": "127.0.0.1",
  },
  body: {
    nome: "Cliente de teste local",
    email: `cliente+${created}@devxis.test`,
    whatsapp: "(61) 99999-9999",
    tipoSistema: "Sistema web",
    faixaOrcamento: "R$ 2.000 a R$ 5.000",
    descricao: "Solicitação exclusiva de teste no emulador.",
  },
};
await quotes(request, {
  setHeader() {},
  status(value) {
    publicStatus = value;
    return this;
  },
  json(result) {
    assert(result.ok, JSON.stringify(result));
    return this;
  },
});
assert.equal(publicStatus, 201);
console.log(
  "01–02: visitante envia orçamento; orçamento persiste no Firestore.",
);
const snapshot = await db
  .collection("quotes")
  .where("email", "==", request.body.email)
  .get();
let q = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
q = await ok(admin, "quotes", "save", {
  id: q.id,
  revision: q.revision,
  data: {
    clientUid: "e2e-client",
    status: "em análise",
    responsible: "Administrador local",
  },
});
q = await ok(admin, "quotes", "proposal", {
  id: q.id,
  revision: q.revision,
  data: {
    title: "Projeto de teste no emulador",
    scope: "Gestão e documentação UML",
    services: "Desenvolvimento",
    deliverables: "Sistema e documentação",
    terms: "Termos de teste",
    valueCents: 250000,
    deadline: "2027-03-15",
    estimatedDays: 30,
  },
});
q = await ok(admin, "quotes", "send", { id: q.id, revision: q.revision });
const portal = await ok(client, "session", "get", {}, "GET");
assert(!portal.admin);
const list = await ok(client, "quotes", "list", {}, "GET");
assert(list.items.some((item) => item.id === q.id));
console.log(
  "03–05: administrador edita e envia proposta; cliente autenticado acessa o portal.",
);
const decision = {
  id: q.id,
  revision: q.revision,
  proposalVersion: q.proposalVersion,
  decision: "aprovar",
  confirmTerms: true,
};
const results = await Promise.all([
  ok(client, "quotes", "respond", decision),
  ok(client, "quotes", "respond", decision),
]);
const projectId = results[0].projectId;
assert.equal(
  (
    await db
      .collection("client_projects")
      .where("sourceQuoteId", "==", q.id)
      .get()
  ).size,
  1,
);
console.log("06–07: aprovação concorrente cria somente um projeto.");
assert.equal(
  (await call(other, "projects", "get", { id: projectId }, "GET")).status,
  403,
);
assert.equal(
  (
    await call(client, "projects", "save", {
      projectId,
      data: { name: "Ataque" },
    })
  ).status,
  403,
);
const stage = await ok(admin, "stages", "save", {
  projectId,
  data: {
    title: "Planejamento",
    description: "Etapa no emulador",
    deadline: "2027-03-01",
    status: "Não iniciada",
    weight: 1,
    order: 1,
  },
});
const task = await ok(admin, "tasks", "save", {
  projectId,
  data: {
    title: "Elaborar arquitetura",
    description: "Documentar as coleções e permissões.",
    stageId: stage.id,
    status: "Não iniciada",
    priority: "Alta",
    deadline: "2027-03-01",
    weight: 1,
    order: 1,
    visible: true,
    manualBlocked: false,
    dependencies: [],
    attachments: [],
  },
});
console.log("08–09: etapas e tarefas persistidas.");
let uml = await ok(admin, "uml", "save", {
  projectId,
  data: {
    title: "Classes do sistema",
    description: "Modelo técnico do projeto",
    type: "Diagrama de classes",
    source:
      'classDiagram\n class Cliente\n class Projeto\n Cliente "1" --> "0..*" Projeto : acompanha',
    visible: false,
    stageId: stage.id,
    taskId: task.id,
    notes: "Documento de teste",
  },
});
assert.equal(
  (await ok(client, "uml", "list", { projectId }, "GET")).items.length,
  0,
);
uml = await ok(admin, "uml", "save", {
  projectId,
  id: uml.id,
  revision: uml.revision,
  data: {
    title: uml.title,
    description: uml.description,
    type: uml.type,
    source: uml.source + "\n class Tarefa\n Projeto --> Tarefa",
    visible: true,
    stageId: stage.id,
    taskId: task.id,
    notes: "Compartilhado no teste",
  },
});
assert.equal(uml.version, 2);
assert.equal(
  (
    await db
      .collection("client_projects")
      .doc(projectId)
      .collection("uml")
      .doc(uml.id)
      .collection("versions")
      .get()
  ).size,
  2,
);
console.log("10–12: UML validada, salva, revisada e compartilhada.");
assert.equal(
  (
    await call(admin, "uml", "save", {
      projectId,
      data: {
        title: "Inválido",
        type: uml.type,
        source: "sintaxe incorreta",
        visible: false,
      },
    })
  ).status,
  400,
);
let approval = await ok(admin, "approvals", "save", {
  projectId,
  data: {
    title: "Aprovar arquitetura",
    type: "Escopo",
    description: "Autoriza esta definição?",
    reason: "Avançar para a implementação",
    taskId: task.id,
    costCents: 0,
    impactDays: 0,
    deadline: "2027-03-05",
    attachments: [],
    scopeChange: "",
  },
});
assert(
  (await ok(client, "approvals", "list", { projectId }, "GET")).items.some(
    (a) => a.id === approval.id,
  ),
);
approval = await ok(client, "approvals", "respond", {
  projectId,
  id: approval.id,
  revision: approval.revision,
  version: approval.version,
  decision: "alterações solicitadas",
  comment: "Detalhar as tarefas.",
});
approval = await ok(admin, "approvals", "save", {
  projectId,
  id: approval.id,
  revision: approval.revision,
  data: { description: "Definição revisada com tarefas detalhadas." },
});
await ok(client, "approvals", "respond", {
  projectId,
  id: approval.id,
  revision: approval.revision,
  version: approval.version,
  decision: "aprovado",
  confirmImpact: true,
});
console.log(
  "13–17: solicitação, pedido de alteração, revisão e aprovação do cliente registrados.",
);
let tasks = await ok(admin, "tasks", "list", { projectId }, "GET");
let item = tasks.items.find((t) => t.id === task.id);
assert.equal(item.blocked, false);
await ok(admin, "tasks", "save", {
  projectId,
  id: task.id,
  revision: item.revision,
  data: { status: "Concluída" },
});
const stages = await ok(admin, "stages", "list", { projectId }, "GET");
await ok(admin, "stages", "save", {
  projectId,
  id: stage.id,
  revision: stages.items[0].revision,
  data: { status: "Concluída" },
});
const project = await ok(client, "projects", "get", { id: projectId }, "GET");
assert.equal(project.progress, 100);
const reportData = await ok(
  client,
  "projects",
  "history",
  { projectId },
  "GET",
);
assert(reportData.items.length > 0);
console.log(
  "18–20: tarefa liberada, etapa concluída e progresso real de 100% consultado pelo cliente.",
);
const file = await ok(admin, "files", "upload", {
  projectId,
  name: "documentacao.txt",
  type: "text/plain",
  base64: Buffer.from("Documento de teste local.").toString("base64"),
  visible: true,
});
assert(
  (await ok(client, "files", "download", { projectId, id: file.id })).base64,
);
const msg = await ok(client, "messages", "send", {
  projectId,
  content: "Teste de mensagem real no emulador.",
});
await ok(admin, "messages", "read", { projectId, id: msg.id });
assert((await ok(client, "notifications", "list", {}, "GET")).items.length > 0);
// As regras negam acesso direto inclusive ao cliente correto; todo acesso privado
// deve passar pelo backend. O token usado abaixo é emitido pelo Auth Emulator.
const rest = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-devxis/databases/(default)/documents`;
const direct = await fetch(`${rest}/client_projects/${projectId}`, {
  headers: { Authorization: `Bearer ${client}` },
});
assert.equal(direct.status, 403);
const escalate = await fetch(`${rest}/users/e2e-client`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${client}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ fields: { isAdmin: { booleanValue: true } } }),
});
assert.equal(escalate.status, 403);
const quoteBypass = await fetch(`${rest}/quotes/${q.id}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${admin}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ fields: { status: { stringValue: "aprovado" } } }),
});
assert.equal(quoteBypass.status, 403);
console.log(
  "Extras: isolamento entre clientes, arquivos, mensagens, notificações, sintaxe inválida e regras contra escalada de privilégios passaram.",
);
await mkdir("work", { recursive: true });
await writeFile(
  "work/emulator-fixture.json",
  JSON.stringify(
    {
      projectId,
      quoteId: q.id,
      adminEmail: "admin@devxis.test",
      clientEmail: "cliente@devxis.test",
      password,
    },
    null,
    2,
  ),
);
console.log(
  "Fluxo Firebase emulado concluído. A impressão do relatório é validada na interface.",
);
await db.terminate();
