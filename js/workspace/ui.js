export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity))
    if (child != null)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return node;
}
export function say(message) {
  const root = document.querySelector("#toast");
  if (!root) return;
  root.textContent = message;
  root.classList.add("show");
  clearTimeout(say.timer);
  say.timer = setTimeout(() => root.classList.remove("show"), 5000);
}
export function button(label, handler, primary = false) {
  const node = el("button", {
    type: "button",
    class: `ws-button${primary ? " primary" : ""}`,
    text: label,
  });
  node.onclick = async () => {
    node.disabled = true;
    try {
      await handler();
    } catch (error) {
      say(error.message);
    } finally {
      node.disabled = false;
    }
  };
  return node;
}
export const heading = (title, subtitle = "", ...actions) =>
  el(
    "header",
    { class: "ws-heading" },
    el(
      "div",
      {},
      el("h3", { text: title }),
      subtitle ? el("p", { text: subtitle }) : null,
    ),
    el("div", { class: "ws-actions" }, ...actions),
  );
export const badge = (status) =>
  el("span", { class: "ws-badge", text: status || "Não informado" });
export const money = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    (value || 0) / 100,
  );
export function dateText(value) {
  if (!value) return "—";
  const seconds = value?.seconds ?? value?._seconds;
  const date = new Date(
    seconds !== undefined
      ? seconds * 1000
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? `${value}T12:00:00`
        : value,
  );
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("pt-BR", {
        dateStyle: "short",
        ...(String(value).length > 10 || seconds !== undefined
          ? { timeStyle: "short" }
          : {}),
      });
}
export function empty(message = "Nenhum registro encontrado.") {
  return el("p", { class: "ws-empty", text: message });
}
export function detail(label, value) {
  return el(
    "div",
    { class: "ws-detail" },
    el("small", { text: label }),
    el("div", { text: value ?? "—" }),
  );
}
export function card(title, meta = "", ...actions) {
  return el(
    "article",
    { class: "ws-card" },
    el("div", {}, el("h4", { text: title }), el("p", { text: meta })),
    el("div", { class: "ws-actions" }, ...actions),
  );
}
export function field(name, label, type = "text", extra = {}) {
  return { name, label, type, ...extra };
}
export function dialog(
  title,
  fields,
  initial = {},
  save,
  saveLabel = "Salvar",
) {
  const overlay = el("div", { class: "ws-dialog-backdrop" }),
    form = el("form", {
      class: "ws-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
    });
  const error = el("p", { class: "ws-error", role: "alert" });
  const inputs = {};
  for (const f of fields) {
    let input;
    if (f.type === "select" || f.type === "multiselect") {
      input = el("select", {
        name: f.name,
        multiple: f.type === "multiselect",
      });
      for (const option of f.options || [])
        input.add(
          new Option(
            typeof option === "string" ? option : option.label,
            typeof option === "string" ? option : option.value,
          ),
        );
      if (f.type === "multiselect") {
        const selected = initial[f.name] ?? f.default ?? [];
        for (const option of input.options)
          option.selected = selected.includes(option.value);
      } else
        input.value =
          initial[f.name] ?? f.default ?? input.options[0]?.value ?? "";
    } else {
      input = el(f.type === "textarea" ? "textarea" : "input", {
        name: f.name,
        ...(f.type !== "textarea" ? { type: f.type } : {}),
        value: initial[f.name] ?? f.default ?? "",
        ...(f.type === "checkbox"
          ? { checked: Boolean(initial[f.name] ?? f.default) }
          : {}),
        ...(f.type === "number"
          ? { min: f.min ?? 0, max: f.max ?? 100000000, step: f.step ?? 1 }
          : {}),
        ...(f.type === "textarea" ? { rows: f.rows || 4 } : {}),
      });
    }
    input.required = Boolean(f.required);
    if (f.maxLength) input.maxLength = f.maxLength;
    if (f.readOnly) input.readOnly = true;
    if (f.readOnly && f.type === "select") input.disabled = true;
    inputs[f.name] = input;
    form.append(
      el(
        "label",
        { class: f.type === "checkbox" ? "ws-check" : "" },
        input.type === "checkbox" ? input : null,
        el("span", { text: f.label }),
        input.type !== "checkbox" ? input : null,
        f.help ? el("small", { text: f.help }) : null,
      ),
    );
  }
  const before = document.activeElement,
    close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      before?.focus();
    };
  const onKey = (event) => {
    if (event.key === "Escape" && !submit.disabled) close();
    if (event.key === "Tab") {
      const items = [
        ...form.querySelectorAll("input,select,textarea,button"),
      ].filter((n) => !n.disabled);
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0].focus();
      }
    }
  };
  const submit = el("button", {
    class: "ws-button primary",
    type: "submit",
    text: saveLabel,
  });
  form.prepend(el("h3", { text: title }));
  form.append(
    error,
    el("footer", { class: "ws-actions" }, button("Cancelar", close), submit),
  );
  overlay.append(form);
  document.body.append(overlay);
  document.addEventListener("keydown", onKey);
  form.onsubmit = async (event) => {
    event.preventDefault();
    submit.disabled = true;
    error.textContent = "";
    const data = Object.fromEntries(
      fields.map((f) => [
        f.name,
        f.type === "checkbox"
          ? inputs[f.name].checked
          : f.type === "multiselect"
            ? [...inputs[f.name].selectedOptions].map((option) => option.value)
            : f.type === "number"
              ? Number(inputs[f.name].value)
              : inputs[f.name].value,
      ]),
    );
    try {
      await save(data);
      close();
    } catch (e) {
      error.textContent = e.message;
    } finally {
      submit.disabled = false;
    }
  };
  form.querySelector("input,select,textarea")?.focus();
  return { close, form, inputs };
}
export function confirmDelete(message, action) {
  return dialog(
    "Confirmar exclusão",
    [field("confirm", message, "checkbox", { required: true })],
    {},
    async () => {
      await action();
    },
    "Excluir",
  );
}
export async function pagedList(root, fetchPage, render) {
  const list = el("div", { class: "ws-list" });
  root.append(list);
  let cursor = null,
    first = true;
  const more = button("Carregar mais", load);
  async function load() {
    try {
      const result = await fetchPage(cursor);
      if (first) {
        list.replaceChildren();
        first = false;
      }
      list.append(...result.items.map(render));
      cursor = result.nextCursor;
      more.hidden = !cursor;
      if (!list.childElementCount) list.append(empty());
    } catch (error) {
      list.replaceChildren(empty(error.message));
      more.hidden = true;
      say(error.message);
    }
  }
  root.append(more);
  await load();
  return list;
}
export function loading(root) {
  root.replaceChildren(
    el("p", { class: "ws-empty", role: "status", text: "Carregando…" }),
  );
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
