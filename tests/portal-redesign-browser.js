import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { getAdminAuth, getAdminDb } from "../api/_firebase-admin.js";
assert.equal(process.env.FIREBASE_PROJECT_ID, "demo-devxis");
assert.match(
  process.env.FIRESTORE_EMULATOR_HOST || "",
  /^(127\.0\.0\.1|localhost):\d+$/,
);
assert.match(
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
  /^(127\.0\.0\.1|localhost):\d+$/,
);
const require = createRequire(import.meta.url),
  { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
    ? require(process.env.PLAYWRIGHT_MODULE_PATH)
    : await import("playwright");
const db = getAdminDb(),
  auth = getAdminAuth(),
  suffix = Date.now(),
  password = "PortalTeste2026!";
const emptyUid = `portal_empty_${suffix}`,
  ownUid = `portal_own_${suffix}`,
  foreignUid = `portal_other_${suffix}`;
for (const [uid, name] of [
  [emptyUid, "garagemautocar"],
  [ownUid, "Cliente de projetos"],
  [foreignUid, "Outra conta"],
]) {
  await auth.createUser({
    uid,
    email: `${uid}@example.test`,
    password,
    emailVerified: true,
  });
  await db
    .collection("client_profiles")
    .doc(uid)
    .set({
      name,
      email: `${uid}@example.test`,
      uid,
      phone: "(61) 99999-9999",
      company: "Empresa de teste",
      service: "",
      budget: "",
      description: "",
    });
}
const firstProject = `portal_${suffix}_00`;
for (let i = 0; i < 21; i++)
  await db
    .collection("client_projects")
    .doc(`portal_${suffix}_${String(i).padStart(2, "0")}`)
    .set({
      clientUid: ownUid,
      clientName: "Cliente de projetos",
      name:
        i === 20
          ? "Projeto exclusivo"
          : "Projeto de teste " + String(i + 1).padStart(2, "0"),
      service: "Sistema web",
      scope: "Escopo do projeto",
      status: "Em desenvolvimento",
      progress: i,
      deadline: "2027-04-01",
      createdAt: new Date().toISOString(),
      revision: 1,
      internalNotes: "não compartilhar",
    });
await db.collection("client_projects").doc(`portal_foreign_${suffix}`).set({
  clientUid: foreignUid,
  name: "Projeto exclusivo externo",
  status: "Em desenvolvimento",
  scope: "Não pertence à conta",
});
for (let i = 0; i < 2; i++)
  await db.collection("quotes").doc(`portal_quote_${suffix}_${i}`).set({
    clientUid: ownUid,
    nome: "Cliente de projetos",
    tipoSistema: "Sistema web",
    status: "novo",
  });
await db
  .collection("client_projects")
  .doc(firstProject)
  .collection("approvals")
  .doc("pending")
  .set({
    clientUid: ownUid,
    projectId: firstProject,
    status: "pendente",
    title: "Aprovação de teste",
    description: "Avaliar escopo",
    version: 1,
    revision: 1,
  });
for (let i = 0; i < 2; i++)
  await db
    .collection("client_projects")
    .doc(firstProject)
    .collection("messages")
    .doc("message" + i)
    .set({
      visible: true,
      authorRole: "Administrador",
      authorUid: "admin-test",
      content: "Mensagem de teste",
      readAt: null,
      createdAt: new Date().toISOString(),
    });
await db.collection("notifications").doc(`portal_notification_${suffix}`).set({
  recipient: ownUid,
  projectId: firstProject,
  title: "Atualização de teste",
  readAt: null,
  createdAt: new Date().toISOString(),
});
await mkdir("work/browser", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
try {
  const context = await browser.newContext({
      viewport: { width: 1820, height: 960 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function login(uid) {
    await page.goto("http://127.0.0.1:3000/pages/portal.html?emulator=1", {
      waitUntil: "domcontentloaded",
    });
    await page
      .locator("#portal-login [name=email]")
      .fill(`${uid}@example.test`);
    await page.locator("#portal-login [name=password]").fill(password);
    await page.locator("#portal-login [type=submit]").click();
    await page.locator(".portal-welcome-copy h1").waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector("#portal-metrics")?.getAttribute("aria-busy") ===
        "false",
    );
  }
  await login(emptyUid);
  assert(await page.locator("header.panel-site-header").isVisible());
  assert(await page.locator("#portal-exit").isVisible());
  assert(await page.locator("#portal-logout").isVisible());
  assert(
    (await page.locator(".portal-welcome-copy h1").innerText()).includes(
      "garagemautocar",
    ),
  );
  for (const node of await page.locator("[data-metric]").all())
    assert.equal(await node.innerText(), "0");
  assert(
    await page
      .getByRole("heading", { name: "Nenhum projeto encontrado", exact: true })
      .isVisible(),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Carregar mais", exact: true })
      .count(),
    0,
  );
  assert(
    (await page.locator(".portal-date-card strong").innerText()).includes(
      String(new Date().getFullYear()),
    ),
  );
  await page.screenshot({
    path: "work/browser/portal-empty-desktop.png",
    fullPage: true,
  });
  for (let i = 0; i < 4; i++) {
    await page.getByRole("tab", { name: "Meu painel", exact: true }).click();
    await page
      .locator(".portal-metric")
      .nth(i)
      .getByRole("button", { name: "Ver todos" })
      .click();
    assert.equal(
      await page.getByRole("tab", { selected: true }).innerText(),
      ["Meus projetos", "Meus orçamentos", "Aprovações", "Mensagens"][i],
    );
  }
  await page.locator("#portal-notifications").click();
  assert.equal(
    await page.getByRole("tab", { selected: true }).innerText(),
    "Notificações",
  );
  await page.locator("#portal-exit").click();
  await page.waitForURL("**/index.html");
  await page.waitForFunction(
    () =>
      document.querySelector("#profile-menu")?.textContent === "Minha conta",
  );
  assert.equal(
    await page.locator("body > header.panel-site-header").count(),
    0,
  );
  assert(await page.locator("#header-logout").isVisible());
  await page.locator("#header-notifications").click();
  await page
    .getByRole("dialog", { name: "Notificações", exact: true })
    .waitFor();
  await page
    .getByRole("dialog", { name: "Notificações", exact: true })
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  await page.screenshot({ path: "work/browser/site-menu-authenticated.png" });
  await page.locator("#profile-menu").click();
  await page.waitForURL("**/pages/portal.html");
  await page.locator(".portal-welcome-copy h1").waitFor();
  await page.locator("#profile-menu").click();
  await page.getByRole("dialog", { name: "Minha conta" }).waitFor();
  assert.equal(
    await page.locator(".ws-dialog [name=name]").inputValue(),
    "garagemautocar",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.locator("#portal-logout").click();
  await page.waitForURL("**/index.html?login=1");
  await page.locator("#admin-modal:not([hidden])").waitFor();
  assert(
    await page.evaluate(async () => {
      const { auth } = await import("/firebase/firebase-config.js");
      await auth.authStateReady();
      return auth.currentUser === null;
    }),
  );
  await login(ownUid);
  await page.waitForFunction(
    () =>
      document.querySelector("[data-metric=activeProjects]")?.textContent ===
      "21",
  );
  assert.equal(await page.locator("[data-metric=quotes]").innerText(), "2");
  assert.equal(
    await page.locator("[data-metric=pendingApprovals]").innerText(),
    "1",
  );
  assert.equal(
    await page.locator("[data-metric=unreadMessages]").innerText(),
    "2",
  );
  assert.equal(await page.locator(".portal-project-card").count(), 12);
  await page
    .getByRole("button", { name: "Carregar mais", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".portal-project-card").length === 21,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Carregar mais", exact: true })
      .count(),
    0,
  );
  const search = page.getByRole("searchbox", {
    name: "Buscar projeto, cliente ou descrição",
  });
  await search.fill("exclusivo");
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".portal-project-card").length === 1 &&
      document.querySelector(".portal-project-card h3")?.textContent ===
        "Projeto exclusivo",
  );
  await search.fill("projeto inexistente");
  await page
    .getByRole("heading", { name: "Nenhum projeto encontrado", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Carregar mais", exact: true })
      .count(),
    0,
  );
  await search.fill("");
  await page.waitForFunction(
    () => document.querySelectorAll(".portal-project-card").length === 12,
  );
  await db.collection("client_projects").doc(`portal_extra_${suffix}`).set({
    clientUid: ownUid,
    name: "Entrega adicional",
    scope: "Outro escopo",
    status: "Em desenvolvimento",
    service: "Sistema",
    progress: 0,
  });
  await page.evaluate(async (projectId) => {
    const { write } = await import("/js/services/workspace-service.js");
    await write("messages", "read", { projectId, id: "message0" });
  }, firstProject);
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("[data-metric=activeProjects]")?.textContent ===
        "22" &&
      document.querySelector("[data-metric=unreadMessages]")?.textContent ===
        "1",
  );
  await page.screenshot({
    path: "work/browser/portal-projects-desktop.png",
    fullPage: true,
  });
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `Rolagem horizontal em ${width}px`,
    );
    for (const id of ["portal-exit", "portal-logout"]) {
      const box = await page.locator("#" + id).boundingBox();
      assert(
        box && box.x >= 0 && box.x + box.width <= width,
        `Saída inacessível em ${width}px`,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".menu-toggle").click();
  assert(
    await page
      .locator("#mobile-drawer")
      .evaluate((node) => node.classList.contains("is-open")),
  );
  await page.locator("#mobile-menu-close").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#mobile-drawer").getBoundingClientRect().left >=
      innerWidth,
  );
  await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await page.screenshot({
    path: "work/browser/portal-mobile.png",
    fullPage: false,
  });
  await page.locator("#portal-logout").click();
  await page.waitForURL("**/index.html?login=1");
  await page.goto("http://127.0.0.1:3000/pages/portal.html?emulator=1");
  await page.locator("#portal-login").waitFor();
  assert(await page.locator("#portal-view").isHidden());
  assert.deepEqual(errors, []);
  console.log(
    "OK: layout vazio e com projetos, saudação, relógio, quatro indicadores reais, navegação, busca, paginação, atualização, dois tipos de saída, proteção após logout e responsividade 1820/1280/768/390/320.",
  );
} finally {
  await browser.close();
  await db.terminate();
}
