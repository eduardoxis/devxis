import { siteIcon } from "./site-icons.js";
export function setHeaderControl(node, icon, text) {
  const label = document.createElement("span");
  label.textContent = text;
  node.replaceChildren(siteIcon(icon), label);
}
export function updateHeaderSession(user) {
  document.body.classList.toggle("is-authenticated", Boolean(user));
  const header = document.querySelector("body > .official-site-header");
  if (!header) return;
  const account = header.querySelector("#profile-menu"),
    bell = header.querySelector("#header-notifications"),
    logout = header.querySelector("#header-logout");
  if (account)
    setHeaderControl(account, "user", user ? "Minha conta" : "Entrar");
  if (bell) {
    setHeaderControl(bell, "bell", "Notificações");
    bell.hidden = !user;
  }
  if (logout) {
    setHeaderControl(logout, "logout", "Sair da conta");
    logout.hidden = !user;
  }
}
