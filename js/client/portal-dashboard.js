import { el, field, dialog } from "../workspace/ui.js";
import { write } from "../services/workspace-service.js";
import { portalIcon } from "./portal-icons.js";
import {
  REGISTRATION_SERVICES,
  REGISTRATION_BUDGETS,
} from "../../shared/registration-fields.js";

export const PORTAL_SECTIONS = [
  ["Meu painel", "grid"],
  ["Meus orçamentos", "file"],
  ["Meus projetos", "folder"],
  ["Aprovações", "check"],
  ["Mensagens", "message"],
  ["Arquivos", "file"],
  ["Notificações", "bell"],
];

export function buildWelcome(root, name) {
  const date = el("strong"),
    time = el("span");
  root.replaceChildren(
    el(
      "div",
      { class: "portal-welcome-copy" },
      el(
        "h1",
        {},
        `Olá, ${name}! `,
        el("span", { "aria-hidden": "true", text: "👋" }),
      ),
      el("p", {
        text: "Aqui está um resumo do seu portal. Gerencie seus projetos, orçamentos e acompanhe suas entregas.",
      }),
    ),
    el(
      "aside",
      { class: "portal-date-card", "aria-label": "Data e horário atuais" },
      el("span", { class: "portal-date-icon" }, portalIcon("calendar")),
      el(
        "div",
        {},
        date,
        el("div", { class: "portal-clock" }, portalIcon("clock"), time),
      ),
    ),
  );
  const update = () => {
    const now = new Date();
    date.textContent = `Hoje é ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}`;
    time.textContent = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(now);
  };
  update();
  const interval = setInterval(update, 30000);
  return () => clearInterval(interval);
}

export function buildPortalTabs(root, navigate) {
  root.replaceChildren(
    ...PORTAL_SECTIONS.map(([label, icon]) =>
      el(
        "button",
        {
          type: "button",
          class: "portal-tab",
          role: "tab",
          "aria-selected": "false",
          "data-section": label,
          onclick: () => navigate(label),
        },
        el("span", { class: "portal-tab-icon" }, portalIcon(icon)),
        el("span", { text: label }),
      ),
    ),
  );
  root.setAttribute("role", "tablist");
}
export function selectPortalTab(root, active) {
  root.querySelectorAll("[data-section]").forEach((button) => {
    const selected = button.dataset.section === active;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
}

export function buildMetrics(root, navigate) {
  const values = {};
  const cards = [
    [
      "activeProjects",
      "Projetos em andamento",
      "folder",
      "chart",
      "blue",
      "Meus projetos",
    ],
    ["quotes", "Orçamentos", "file", "bars", "green", "Meus orçamentos"],
    [
      "pendingApprovals",
      "Aprovações pendentes",
      "check",
      "clock",
      "orange",
      "Aprovações",
    ],
    [
      "unreadMessages",
      "Mensagens não lidas",
      "message",
      "message",
      "purple",
      "Mensagens",
    ],
  ];
  root.replaceChildren(
    ...cards.map(([key, label, icon, decoration, color, section]) => {
      const value = el("strong", { "data-metric": key, text: "—" });
      values[key] = value;
      return el(
        "article",
        { class: `portal-metric portal-metric-${color}` },
        el("span", { class: "portal-metric-icon" }, portalIcon(icon)),
        el(
          "div",
          { class: "portal-metric-copy" },
          el("span", { text: label }),
          value,
          el(
            "button",
            {
              type: "button",
              class: "portal-text-link",
              onclick: () => navigate(section),
            },
            "Ver todos",
            portalIcon("arrow"),
          ),
        ),
        portalIcon(decoration, "portal-metric-decoration"),
      );
    }),
  );
  return {
    update(data) {
      for (const [key, node] of Object.entries(values))
        node.textContent = String(data[key]);
      root.setAttribute("aria-busy", "false");
    },
    loading() {
      root.setAttribute("aria-busy", "true");
    },
    error() {
      for (const node of Object.values(values)) node.textContent = "—";
      root.setAttribute("aria-busy", "false");
    },
  };
}

export function projectEmpty(search = "") {
  return el(
    "div",
    { class: "portal-project-empty" },
    el("span", { class: "portal-empty-icon" }, portalIcon("folder"), el("i")),
    el("h3", { text: "Nenhum projeto encontrado" }),
    el("p", {
      text: search
        ? "Nenhum projeto corresponde à sua busca. Tente outro nome ou descrição."
        : "Você ainda não possui projetos cadastrados no seu portal.",
    }),
  );
}
export function projectCard(project, open) {
  const progress = Math.max(0, Math.min(100, Number(project.progress) || 0));
  return el(
    "article",
    { class: "portal-project-card" },
    el(
      "header",
      {},
      el("span", { class: "portal-project-symbol" }, portalIcon("folder")),
      el("span", { class: "portal-project-status", text: project.status }),
    ),
    el("h3", { text: project.name }),
    el("p", {
      class: "portal-project-description",
      text:
        project.scope ||
        project.service ||
        "Consulte o escopo e as próximas entregas do projeto.",
    }),
    el(
      "div",
      { class: "portal-project-progress-label" },
      el("span", { text: "Progresso do projeto" }),
      el("strong", { text: `${progress}%` }),
    ),
    el("progress", {
      value: progress,
      max: 100,
      "aria-label": `Progresso de ${project.name}`,
    }),
    el(
      "footer",
      {},
      el(
        "span",
        {},
        portalIcon("calendar"),
        project.deadline
          ? new Intl.DateTimeFormat("pt-BR", {
              timeZone: "America/Sao_Paulo",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }).format(new Date(`${project.deadline}T12:00:00Z`))
          : "Prazo a definir",
      ),
      el(
        "button",
        { type: "button", class: "portal-project-open", onclick: open },
        "Abrir projeto",
        portalIcon("arrow"),
      ),
    ),
  );
}

export async function showAccount(profile, onUpdated) {
  const current = profile || {
    name: "",
    phone: "",
    company: "",
    service: "",
    budget: "",
    description: "",
  };
  dialog(
    "Minha conta",
    [
      field("name", "Nome completo", "text", {
        required: true,
        maxLength: 100,
      }),
      field("phone", "WhatsApp", "tel", { required: true, maxLength: 25 }),
      field("company", "Empresa", "text", { maxLength: 120 }),
      field("service", "Serviço de interesse", "select", {
        options: [
          { value: "", label: "Ainda não definido" },
          ...REGISTRATION_SERVICES,
        ],
      }),
      field("budget", "Faixa de investimento", "select", {
        options: [
          { value: "", label: "Ainda não definida" },
          ...REGISTRATION_BUDGETS,
        ],
      }),
      field("description", "Sobre seu projeto", "textarea", {
        maxLength: 3000,
      }),
    ],
    current,
    async (data) => {
      const saved = await write("profile", "save", { data });
      await onUpdated(saved);
    },
  );
}
