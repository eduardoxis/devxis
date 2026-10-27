export function initializeSiteNavigation({
  root = document,
  prefix = "",
} = {}) {
  const drawer = root.querySelector(`#${prefix}mobile-drawer`),
    backdrop = root.querySelector(`#${prefix}mobile-menu-backdrop`),
    toggle = root.querySelector(".menu-toggle"),
    closeButton = root.querySelector(`#${prefix}mobile-menu-close`);
  if (!drawer || !backdrop || !toggle || !closeButton) return;
  const close = () => {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    backdrop.hidden = true;
    document.body.classList.remove("mobile-menu-open");
  };
  const open = () => {
    backdrop.hidden = false;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("mobile-menu-open");
  };
  toggle.addEventListener("click", () =>
    drawer.classList.contains("is-open") ? close() : open(),
  );
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  drawer
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", close));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  return { close, open };
}
