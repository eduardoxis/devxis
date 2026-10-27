import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
  ? require(process.env.PLAYWRIGHT_MODULE_PATH)
  : await import("playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3000/?emulator=1", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => typeof document.querySelector("#profile-menu").onclick === "function",
  );
  await page.locator("#profile-menu").click();
  const login = page.locator("#admin-login-form [type=submit]"),
    register = page.locator("#client-register");
  const a = await login.boundingBox(),
    b = await register.boundingBox();
  assert(b.y >= a.y + a.height + 10, "Botões devem ter espaço entre eles.");
  await register.click();
  await page.locator("#client-registration-modal").waitFor();
  assert(await page.locator("#admin-modal").isHidden());
  const email = `cadastro-${Date.now()}@example.test`,
    password = "SenhaDeTeste2026!";
  await page
    .locator("#client-registration-form [name=name]")
    .fill("Cliente do cadastro");
  await page
    .locator("#client-registration-form [name=phone]")
    .fill("(61) 99999-9999");
  await page
    .locator("#client-registration-form [name=company]")
    .fill("Empresa de teste");
  await page
    .locator("#client-registration-form [name=service]")
    .selectOption("Sistema web");
  await page
    .locator("#client-registration-form [name=budget]")
    .selectOption("R$ 2.000 a R$ 5.000");
  await page
    .locator("#client-registration-form [name=description]")
    .fill("Quero um sistema para minha empresa.");
  await page.locator("#client-registration-form [name=email]").fill(email);
  await page
    .locator("#client-registration-form [name=password]")
    .fill(password);
  await page.locator("[data-eye=password]").click();
  assert.equal(
    await page
      .locator("#client-registration-form [name=password]")
      .getAttribute("type"),
    "text",
  );
  await page.locator("[data-eye=password]").click();
  await page.locator("[data-eye=confirmPassword]").click();
  assert.equal(
    await page
      .locator("#client-registration-form [name=confirmPassword]")
      .getAttribute("type"),
    "text",
  );
  await page.locator("[data-eye=confirmPassword]").click();
  await page
    .locator("#client-registration-form [name=confirmPassword]")
    .fill("OutraSenha2026!");
  await page.locator("#client-registration-form [type=submit]").click();
  assert(
    await page
      .locator("#client-registration-form [name=confirmPassword]")
      .evaluate((input) => !input.checkValidity()),
  );
  assert(await page.locator("#client-registration-modal").isVisible());
  await page
    .locator("#client-registration-form [name=confirmPassword]")
    .fill(password);
  await page.locator("#client-registration-form [type=submit]").click();
  await page
    .locator("#client-login-notice:not([hidden])")
    .waitFor({ timeout: 45000 });
  assert.equal(await page.locator("#client-registration-modal").count(), 0);
  assert(
    (await page.locator("#client-login-notice").innerText()).includes("spam"),
  );
  assert.equal(
    await page.locator("#admin-login-form [name=email]").inputValue(),
    email,
  );
  assert.equal(
    await page.locator("#admin-login-form [name=password]").inputValue(),
    "",
  );
  assert(
    await page.evaluate(async () => {
      const { auth } = await import("/firebase/firebase-config.js");
      return auth.currentUser === null;
    }),
  );
  assert(page.url().includes("/?emulator=1"));
  await page.locator("#admin-login-form [name=password]").fill(password);
  await login.click();
  await page.waitForURL("**/pages/portal.html", { timeout: 45000 });
  await page.locator("#portal-view").waitFor();
  const profile = await page.evaluate(async () => {
    const { api } = await import("/js/services/workspace-service.js");
    return api("profile", "get");
  });
  assert.equal(profile.name, "Cliente do cadastro");
  assert.equal(profile.phone, "(61) 99999-9999");
  assert.equal(profile.service, "Sistema web");
  assert.equal(profile.budget, "R$ 2.000 a R$ 5.000");
  assert.equal(
    await page.getByText("Copiar meu UID", { exact: true }).count(),
    0,
  );
  await page.goto("http://127.0.0.1:3000/?emulator=1");
  await page.waitForFunction(
    () =>
      document.querySelector("#profile-menu")?.textContent === "Minha conta",
  );
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector("#profile-menu")?.textContent === "Minha conta",
  );
  const another = await page.context().newPage();
  await another.goto("http://127.0.0.1:3000/?emulator=1");
  await another.waitForFunction(
    () =>
      document.querySelector("#profile-menu")?.textContent === "Minha conta",
  );
  await another.close();
  await page.locator("#profile-menu").click();
  await page.waitForURL("**/pages/portal.html");
  assert.equal(
    await page.locator(".site-header nav a").first().getAttribute("href"),
    "../index.html#sobre",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".menu-toggle").click();
  assert(
    await page
      .locator("#mobile-drawer")
      .evaluate((element) => element.classList.contains("is-open")),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.locator("#mobile-menu-close").click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator("#portal-logout").click();
  await page.goto("http://127.0.0.1:3000/?emulator=1");
  await page.waitForFunction(
    () => typeof document.querySelector("#profile-menu").onclick === "function",
  );
  await page.waitForFunction(
    () => document.querySelector("#profile-menu")?.textContent === "Entrar",
  );
  console.log(
    "OK: cadastro completo persistido, olhos das senhas, aviso de spam, login manual, sessão persistente, Minha conta, saída, UID oculto e menu compartilhado desktop/mobile.",
  );
} finally {
  await browser.close();
}
