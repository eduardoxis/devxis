import { initializeSiteNavigation } from "../utils/site-navigation.js";
import { setHeaderControl } from "../utils/header-controls.js";
import { openHeaderNotifications } from "../utils/header-notifications.js";

// Reutiliza o próprio cabeçalho público; não cria um segundo modelo de menu.
export function mountAdminSiteHeader({ dashboard, closeModal, logout }) {
  const source = document.querySelector("body > .site-header");
  const oldHeading = dashboard.querySelector(".admin-modal-head");
  if (!source || !oldHeading) return;
  const root = document.createElement("div");
  root.className = "admin-site-navigation";
  const header = source.cloneNode(true);
  header.id = "admin-site-header";
  header.classList.add("panel-site-header");
  const profile = header.querySelector(".profile-area");
  profile.replaceChildren();
  const account = document.createElement("button");
  account.type = "button";
  account.className = "portal-header-button portal-account-button";
  setHeaderControl(account, "user", "Minha conta");
  account.setAttribute("aria-label", "Abrir minha conta");
  account.onclick = () => {
    closeModal();
    location.href = "pages/portal.html";
  };
  const bell = document.createElement("button");
  bell.type = "button";
  bell.className = "portal-header-button portal-bell";
  bell.setAttribute("aria-label", "Notificações");
  setHeaderControl(bell, "bell", "Notificações");
  bell.onclick = openHeaderNotifications;
  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "portal-header-button portal-panel-exit";
  setHeaderControl(exit, "home", "Sair do painel");
  exit.onclick = () => {
    closeModal();
    location.hash = "inicio";
  };
  logout.className = "portal-header-button portal-account-exit";
  setHeaderControl(logout, "logout", "Sair da conta");
  profile.append(bell, account, exit, logout);
  const drawer = document.querySelector("#mobile-drawer").cloneNode(true),
    backdrop = document.querySelector("#mobile-menu-backdrop").cloneNode(true);
  drawer.id = "admin-site-mobile-drawer";
  backdrop.id = "admin-site-mobile-menu-backdrop";
  drawer.querySelector("#mobile-menu-close").id =
    "admin-site-mobile-menu-close";
  header.querySelector(".menu-toggle").setAttribute("aria-controls", drawer.id);
  root.append(header, backdrop, drawer);
  const title = document.createElement("div");
  title.className = "admin-panel-title";
  const heading = document.createElement("h2");
  heading.textContent = "Painel administrativo";
  title.append(heading);
  oldHeading.replaceWith(root, title);
  const navigation = initializeSiteNavigation({ root, prefix: "admin-site-" });
  root.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      navigation.close();
      closeModal();
    }),
  );
  return navigation;
}
