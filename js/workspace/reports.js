import { el, dateText, money } from "./ui.js";
import { allPages, api } from "../services/workspace-service.js";
export function printDocument(title, nodes, branding = {}) {
  const existing = document.querySelector("#ws-print");
  existing?.remove();
  const root = el(
    "section",
    { id: "ws-print" },
    el(
      "header",
      {},
      el("strong", { text: branding.businessName || "DEVXIS" }),
      el("h1", { text: title }),
      el("p", { text: `Emitido em ${new Date().toLocaleString("pt-BR")}` }),
      branding.contactEmail ? el("p", { text: branding.contactEmail }) : null,
    ),
    ...nodes,
    branding.reportFooter
      ? el("footer", { text: branding.reportFooter })
      : null,
  );
  document.body.append(root);
  window.print();
  setTimeout(() => root.remove(), 1000);
}
export async function printProposal(quote) {
  const branding = await api("settings", "get");
  const p = quote.sentProposal || quote.draftProposal;
  if (!p) throw new Error("Elabore uma proposta antes de imprimir.");
  printDocument(
    p.title,
    [
      el("p", {
        text: `Cliente: ${quote.nome} • Proposta ${quote.id} • v${quote.proposalVersion || "rascunho"}`,
      }),
      el("p", {
        text: `Valor: ${money(p.valueCents)} • Prazo: ${p.deadline || `${p.estimatedDays} dias`}`,
      }),
      ...["scope", "services", "deliverables", "terms"].map((key, i) =>
        el(
          "section",
          {},
          el("h2", {
            text: ["Escopo", "Serviços", "Entregas", "Condições comerciais"][i],
          }),
          el("p", { text: p[key] }),
        ),
      ),
    ],
    branding,
  );
}
export async function projectReport(
  project,
  shared = false,
  selectedDiagrams = null,
) {
  const params = { projectId: project.id };
  const [stages, tasks, approvals, diagrams, history] = await Promise.all([
    allPages("stages", params),
    allPages("tasks", params),
    allPages("approvals", params),
    allPages("uml", params),
    historyPages(project.id),
  ]);
  const visibleTasks = tasks.filter((t) => !shared || t.visible);
  const visibleDiagrams = diagrams.filter(
    (d) =>
      (!shared || d.visible) &&
      (!selectedDiagrams || selectedDiagrams.includes(d.id)),
  );
  const nodes = [
    el("p", {
      text: `${project.clientName} • ${project.service} • ${project.status} • Progresso ${project.progress || 0}%`,
    }),
    el("p", {
      text: `Prazo: ${dateText(project.deadline)} • Contratado: ${money(project.valueCents)}`,
    }),
    el("h2", { text: "Escopo contratado" }),
    el("p", { text: project.scope || "Ainda não definido." }),
  ];
  if (!shared && project.internalNotes)
    nodes.push(
      el("h2", { text: "Observações internas" }),
      el("p", { text: project.internalNotes }),
    );
  for (const [title, items, toText] of [
    [
      "Etapas e cronograma",
      stages,
      (s) => `${s.title} — ${s.status} — ${dateText(s.deadline)}`,
    ],
    [
      "Tarefas e pendências",
      visibleTasks,
      (t) =>
        `${t.title} — ${t.status} — ${t.blocked ? "Bloqueada — " : ""}${dateText(t.deadline)}`,
    ],
    [
      "Aprovações",
      approvals,
      (a) => `${a.title} — v${a.version} — ${a.status}`,
    ],
    [
      "Atualizações",
      history.filter((e) => !shared || e.shared),
      (e) =>
        `${dateText(e.createdAt)} — ${e.action}${e.details ? `: ${e.details}` : ""}`,
    ],
  ])
    nodes.push(
      el("h2", { text: title }),
      el("ul", {}, ...items.map((item) => el("li", { text: toText(item) }))),
    );
  if (visibleDiagrams.length) {
    const { renderDiagram } = await import("./uml-editor.js");
    for (const diagram of visibleDiagrams) {
      const figure = el(
        "section",
        { class: "ws-report-diagram" },
        el("h2", { text: `${diagram.title} — v${diagram.version}` }),
        el("p", { text: diagram.description || "" }),
      );
      const target = el("div");
      await renderDiagram(diagram.source, target);
      figure.append(target);
      nodes.push(figure);
    }
  }
  const branding = await api("settings", "get", { projectId: project.id });
  printDocument(
    `${project.name} — ${shared ? "Relatório do cliente" : "Relatório interno"}`,
    nodes,
    branding,
  );
}
async function historyPages(projectId) {
  let cursor,
    items = [];
  do {
    const result = await api("projects", "history", {
      projectId,
      cursor,
      limit: 50,
    });
    items.push(...result.items);
    cursor = result.nextCursor;
    if (items.length > 1000)
      throw new Error("Histórico muito extenso para o relatório.");
  } while (cursor);
  return items;
}
