import { api, write } from "../services/workspace-service.js";
import {
  el,
  button,
  heading,
  card,
  pagedList,
  dateText,
} from "../workspace/ui.js";

export async function openHeaderNotifications() {
  const overlay = el("div", { class: "ws-dialog-backdrop" }),
    box = el("section", {
      class: "ws-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Notificações",
    }),
    before = document.activeElement;
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    before?.focus();
  };
  const onKey = (event) => {
    if (event.key === "Escape") close();
  };
  const list = el("div");
  box.append(
    heading(
      "Notificações",
      "Atualizações da sua conta.",
      button("Fechar", close),
    ),
    list,
  );
  overlay.append(box);
  document.body.append(overlay);
  document.addEventListener("keydown", onKey);
  overlay.onclick = (event) => {
    if (event.target === overlay) close();
  };
  async function load() {
    list.replaceChildren();
    await pagedList(
      list,
      (cursor) => api("notifications", "list", { cursor }),
      (item) =>
        card(
          item.title,
          `${dateText(item.createdAt)} · ${item.readAt ? "Lida" : "Não lida"}`,
          ...(!item.readAt
            ? [
                button("Marcar como lida", async () => {
                  await write("notifications", "read", { id: item.id });
                  await load();
                }),
              ]
            : []),
        ),
    );
  }
  await load();
  box.querySelector("button")?.focus();
}
