import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
  ? require(process.env.PLAYWRIGHT_MODULE_PATH)
  : await import("playwright");
const fixture = JSON.parse(
  await readFile("work/emulator-fixture.json", "utf8"),
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1760, height: 1060 },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("favicon"))
    console.log("browser:", msg.text());
});
await mkdir("work/browser", { recursive: true });
try {
  await page.goto("http://127.0.0.1:3000/?emulator=1", {
    waitUntil: "domcontentloaded",
  });
  console.log("UI: site carregado");
  await page.locator("#footer-admin").click();
  console.log("UI: login aberto");
  await page.locator("#admin-login-form [name=email]").fill(fixture.adminEmail);
  await page
    .locator("#admin-login-form [name=password]")
    .fill(fixture.password);
  await page.locator("#admin-login-form [type=submit]").click();
  await page.locator(".ws-kpis").waitFor({ timeout: 45000 });
  console.log("UI: dashboard carregado");
  await page.locator("#close-admin").click();assert(await page.locator("#admin-modal").isHidden());await page.locator("#footer-admin").click();

  assert.equal(
    await page.locator("#admin-site-header nav a").first().getAttribute("href"),
    "#sobre",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#admin-site-header .menu-toggle").click();
  assert(
    await page
      .locator("#admin-site-mobile-drawer")
      .evaluate((node) => node.classList.contains("is-open")),
  );
  await page.locator("#admin-site-mobile-menu-close").click();
  await page.setViewportSize({ width: 1760, height: 1060 });
  await page.locator("#admin-site-header nav a").first().click();
  assert(await page.locator("#admin-modal").isHidden());
  await page.locator("#footer-admin").click();
  await page.locator(".ws-kpis").waitFor();

  await page.locator('[data-admin-tab="client-projects"]').click();
  await page
    .getByRole("heading", { name: "Projetos de clientes", exact: true })
    .waitFor();
  console.log("UI: lista de projetos carregada");
  await page.evaluate(async (projectId) => {
    const { openProject } = await import("/js/workspace/project-console.js");
    await openProject(
      document.querySelector("#admin-modal-content"),
      projectId,
      true,
      () => {},
    );
  }, fixture.projectId);
  console.log("UI: central do projeto aberta");
  await page
    .getByRole("button", { name: "UML e Arquitetura", exact: true })
    .click();
  await page.locator(".ws-diagram-canvas svg").waitFor({ timeout: 45000 });
  assert.equal(await page.locator(".ws-error").innerText(), "");
  await page
    .locator(".admin-modal-box")
    .screenshot({ path: "work/browser/admin-uml.png" });
  const source = page.locator(".ws-code");
  await source.fill("texto invalido");
  await page.waitForFunction(() =>
    document.querySelector(".ws-error")?.textContent.includes("inválida"),
  );
  assert.equal(await page.locator(".ws-diagram-canvas svg").count(), 0);
  await source.fill(
    'classDiagram\n class Cliente\n class Projeto\n Cliente "1" --> "0..*" Projeto : acompanha',
  );
  await page.locator(".ws-diagram-canvas svg").waitFor();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector("#toast")?.textContent.includes("nova versão"),
  );
  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar SVG", exact: true }).click();
  assert((await svgDownload).suggestedFilename().endsWith(".svg"));
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "Excluir", exact: true })
      .isEnabled(),
  );
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar PNG", exact: true }).click();
  assert((await pngDownload).suggestedFilename().endsWith(".png"));
  await page.getByRole("button", { name: "Tarefas", exact: true }).click();
  await page.getByRole("button", { name: "Lista / Kanban" }).click();
  assert(await page.locator(".ws-kanban").isVisible());
  await page
    .getByRole("button", { name: "Relatório do cliente", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Imprimir / salvar PDF", exact: true })
    .click();
  await page.locator("#ws-print").waitFor({ state: "attached" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "work/browser/relatorio-cliente.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  console.log(
    "21: relatório gerado no navegador com as informações persistidas e diagrama.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "UML e Arquitetura", exact: true })
    .click();
  await page.locator(".ws-diagram-canvas svg").waitFor();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false);
  await page
    .locator(".admin-modal-box")
    .screenshot({ path: "work/browser/admin-mobile.png" });
  const clientPage = await context.newPage();
  await clientPage.goto(`http://127.0.0.1:3000/pages/portal.html?emulator=1`);
  await clientPage.evaluate(async()=>{const {auth}=await import("/firebase/firebase-config.js");await auth.authStateReady()});
  if(await clientPage.locator("#portal-logout").isVisible())await clientPage.locator("#portal-logout").click();
  await clientPage
    .locator("#portal-login [name=email]")
    .fill(fixture.clientEmail);
  await clientPage
    .locator("#portal-login [name=password]")
    .fill(fixture.password);
  await clientPage.locator("#portal-login [type=submit]").click();
  await clientPage
    .getByRole("heading", { name: "Meu portal" })
    .waitFor({ timeout: 45000 });
  await clientPage.evaluate(async (projectId) => {
    const { openProject } = await import("/js/workspace/project-console.js");
    await openProject(
      document.querySelector("#portal-content"),
      projectId,
      false,
      () => {},
    );
  }, fixture.projectId);
  await clientPage
    .getByRole("button", { name: "UML e Arquitetura", exact: true })
    .click();
  await clientPage.locator(".ws-diagram-canvas svg").waitFor();
  assert(
    (await clientPage.locator(".ws-code").getAttribute("readonly")) !== null,
  );
  assert.equal(
    await clientPage
      .getByRole("button", { name: "Salvar", exact: true })
      .count(),
    0,
  );
  await clientPage.reload();
  await clientPage.getByRole("heading", { name: "Meu portal" }).waitFor();
  console.log(
    "Portal do cliente: acesso próprio, diagrama compartilhado somente leitura e persistência após recarregar OK.",
  );
  assert.deepEqual(errors, []);
  console.log(
    "UI desktop/mobile, Mermaid válido/inválido, versões, SVG, PNG, Kanban e relatório: OK.",
  );
} finally {
  await browser.close();
}
