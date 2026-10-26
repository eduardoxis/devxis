import { api, write, allPages } from "../services/workspace-service.js";
import { QUOTE_STATUSES } from "../../shared/workspace-domain.js";
import {
  el,
  button,
  heading,
  badge,
  detail,
  card,
  field,
  dialog,
  money,
  dateText,
  pagedList,
  empty,
  say,
} from "../workspace/ui.js";
import { openProject } from "../workspace/project-console.js";
import { printProposal } from "../workspace/reports.js";
export async function renderWorkspaceAdmin(root, tab) {
  root.classList.add("ws-root");
  root.closest(".admin-modal-box")?.classList.remove("ws-expanded");
  root.replaceChildren();
  const render = () => renderWorkspaceAdmin(root, tab);
  if (tab === "overview") {
    const data = await api("dashboard", "get");
    const labels = {
      clients: "Clientes",
      newQuotes: "Orçamentos novos",
      waitingQuotes: "Propostas aguardando aprovação",
      activeProjects: "Projetos ativos",
      completedProjects: "Projetos concluídos",
      lateProjects: "Projetos atrasados",
      waitingApprovals: "Aprovações aguardando cliente",
      pendingTasks: "Tarefas pendentes",
      lateTasks: "Tarefas atrasadas",
    };
    root.append(
      heading(
        "Resumo da operação",
        "Indicadores consultados no banco de dados.",
        button("Atualizar", render),
      ),
      el(
        "div",
        { class: "ws-kpis" },
        ...Object.entries(labels).map(([key, label]) =>
          el(
            "article",
            {},
            el("small", { text: label }),
            el("b", { text: data.totals[key] }),
          ),
        ),
      ),
      heading("Próximas entregas"),
      ...(data.deliveries.length
        ? data.deliveries.map((p) =>
            card(
              p.name,
              `${dateText(p.deadline)} · ${p.clientName}`,
              button("Abrir projeto", () =>
                openProject(root, p.id, true, render),
              ),
            ),
          )
        : [empty("Nenhuma entrega agendada.")]),
      heading("Atividades recentes"),
      ...data.recent.map((e) =>
        card(
          e.action,
          `${dateText(e.createdAt)} · ${e.actorName || "—"}`,
          ...(e.projectId
            ? [
                button("Abrir projeto", () =>
                  openProject(root, e.projectId, true, render),
                ),
              ]
            : []),
        ),
      ),
    );
    return;
  }
  if (tab === "clients") {
    root.append(
      heading(
        "Clientes",
        "O cliente cria sua conta no portal e confirma o e-mail. Vincule pelo UID informado por ele.",
        button("+ Vincular cliente", () => editClient()),
      ),
    );
    await pagedList(
      root,
      (cursor) => api("clients", "list", { cursor }),
      (client) =>
        card(
          client.name,
          `${client.company || ""} · ${client.email} · UID: ${client.id}`,
          button("Editar", () => editClient(client)),
        ),
    );
    return;
  }
  if (tab === "client-projects" || tab === "approvals" || tab === "messages") {
    root.append(
      heading(
        tab === "client-projects"
          ? "Projetos de clientes"
          : tab === "approvals"
            ? "Aprovações por projeto"
            : "Mensagens por projeto",
        "Projetos privados contratados, separados do portfólio público.",
        ...(tab === "client-projects"
          ? [button("+ Criar projeto", createProject)]
          : []),
      ),
    );
    await pagedList(
      root,
      (cursor) => api("projects", "list", { cursor }),
      (p) =>
        card(
          p.name,
          `${p.clientName} · ${p.status} · ${p.progress || 0}% · ${dateText(p.deadline)}`,
          button(
            tab === "approvals"
              ? "Ver aprovações"
              : tab === "messages"
                ? "Abrir conversa"
                : "Abrir central do projeto",
            () =>
              openProject(
                root,
                p.id,
                true,
                render,
                tab === "approvals"
                  ? "Aprovações"
                  : tab === "messages"
                    ? "Mensagens"
                    : "Visão geral",
              ),
            true,
          ),
        ),
    );
    return;
  }
  if (tab === "quotes") {
    root.append(
      heading(
        "Orçamentos",
        "Propostas, decisões do cliente e conversão em projetos.",
      ),
    );
    await pagedList(
      root,
      (cursor) => api("quotes", "list", { cursor }),
      (q) =>
        card(
          q.nome,
          `${q.tipoSistema} · ${q.status}${q.archived ? " · Arquivado" : ""} · ${dateText(q.criadoEm || q.createdAt)}`,
          button("Abrir", () => showQuote(q.id)),
          button("Editar", () => editQuote(q)),
        ),
    );
    return;
  }
  if (tab === "notifications") {
    root.append(
      heading(
        "Notificações",
        "Atualize para consultar novos eventos.",
        button("Atualizar", render),
      ),
    );
    await pagedList(
      root,
      (cursor) => api("notifications", "list", { cursor }),
      (n) =>
        card(
          n.title,
          `${dateText(n.createdAt)} · ${n.readAt ? "Lida" : "Não lida"}`,
          ...(n.projectId
            ? [
                button("Abrir projeto", () =>
                  openProject(
                    root,
                    n.projectId,
                    true,
                    render,
                    n.kind === "approval"
                      ? "Aprovações"
                      : n.kind === "message"
                        ? "Mensagens"
                        : "Visão geral",
                  ),
                ),
              ]
            : []),
          ...(!n.readAt
            ? [
                button("Marcar como lida", async () => {
                  await write("notifications", "read", { id: n.id });
                  await render();
                }),
              ]
            : []),
        ),
    );
    return;
  }
  if (tab === "settings") {
    const settings = await api("settings", "get");
    root.append(
      heading("Configurações", "Dados usados na documentação da operação."),
      detail("Empresa", settings.businessName),
      detail("Contato", settings.contactEmail || "Não informado"),
      detail("Rodapé dos relatórios", settings.reportFooter || "Não informado"),
      button("Editar configurações", () =>
        dialog(
          "Configurações",
          [
            field("businessName", "Nome da empresa", "text", {
              required: true,
              maxLength: 120,
            }),
            field("contactEmail", "E-mail de contato", "email", {
              maxLength: 160,
            }),
            field("reportFooter", "Rodapé dos relatórios", "textarea", {
              maxLength: 1000,
            }),
          ],
          settings,
          async (data) => {
            await write("settings", "save", { data });
            await render();
          },
        ),
      ),
    );
    return;
  }
  async function editClient(client = {}) {
    dialog(
      client.id ? "Editar cliente" : "Vincular cliente",
      [
        field("id", "UID da conta verificada", "text", {
          required: true,
          readOnly: Boolean(client.id),
          maxLength: 128,
        }),
        field("name", "Nome", "text", { required: true, maxLength: 100 }),
        field("company", "Empresa", "text", { maxLength: 120 }),
        field("phone", "Telefone", "text", { maxLength: 25 }),
        field("notes", "Observações internas", "textarea", { maxLength: 3000 }),
      ],
      client,
      async ({ id, ...data }) => {
        await write("clients", "save", { id, revision: client.revision, data });
        await render();
      },
    );
  }
  async function createProject() {
    const result = { items: await allPages("clients") };
    if (!result.items.length)
      throw new Error("Vincule um cliente verificado primeiro.");
    dialog(
      "Criar projeto privado",
      [
        field("clientUid", "Cliente", "select", {
          options: result.items.map((c) => ({
            value: c.id,
            label: `${c.name} — ${c.email}`,
          })),
          default: result.items[0].id,
        }),
        field("name", "Nome do projeto", "text", {
          required: true,
          maxLength: 160,
        }),
        field("service", "Serviço contratado", "text", {
          required: true,
          maxLength: 100,
        }),
        field("scope", "Escopo", "textarea", { maxLength: 12000 }),
        field("startDate", "Início", "date"),
        field("deadline", "Prazo previsto", "date"),
      ],
      {},
      async ({ clientUid, ...data }) => {
        const project = await write("projects", "create", { clientUid, data });
        await openProject(root, project.id, true, render);
      },
    );
  }
  async function editQuote(q) {
    dialog(
      "Editar orçamento",
      [
        field("nome", "Nome", "text", { required: true, maxLength: 100 }),
        field("empresa", "Empresa", "text", { maxLength: 120 }),
        field("whatsapp", "WhatsApp", "text", { maxLength: 25 }),
        field("descricao", "Descrição", "textarea", {
          required: true,
          maxLength: 6000,
        }),
        field("responsible", "Responsável", "text", { maxLength: 100 }),
        field("clientUid", "UID do cliente verificado", "text", {
          required: false,
          readOnly: Boolean(q.clientUid),
          maxLength: 128,
          help: "Vincule a conta na aba Clientes antes de informar o UID. Confira o destinatário antes de enviar a proposta.",
        }),
        field("status", "Status", "select", {
          options: QUOTE_STATUSES.filter(
            (s) =>
              ![
                "aprovado",
                "proposta enviada",
                "aguardando aprovação",
              ].includes(s),
          ),
          default: "em análise",
        }),
      ],
      {
        ...q,
        status: [
          "aprovado",
          "proposta enviada",
          "aguardando aprovação",
        ].includes(q.status)
          ? "em elaboração"
          : q.status,
      },
      async (data) => {
        if (!data.clientUid) delete data.clientUid;
        await write("quotes", "save", {
          id: q.id,
          revision: q.revision || 0,
          data,
        });
        await render();
      },
    );
  }
  async function showQuote(id) {
    const q = await api("quotes", "get", { id });
    root.replaceChildren();
    root.append(
      heading(
        `Orçamento: ${q.nome}`,
        `${q.id} · ${q.status}`,
        button("← Voltar", render),
        button("Editar", () => editQuote(q)),
        button("Elaborar proposta", () => proposal(q)),
        button("Enviar proposta", async () => {
          if (
            !window.confirm(
              `Enviar a proposta para a conta vinculada a ${q.email}?`,
            )
          )
            return;
          await write("quotes", "send", {
            id: q.id,
            revision: q.revision || 0,
          });
          await showQuote(q.id);
        }),
        button("Imprimir proposta / PDF", () => printProposal(q)),
        button("Ver histórico", () => history(q)),
        button(q.archived ? "Desarquivar" : "Arquivar", async () => {
          await write("quotes", "archive", {
            id: q.id,
            revision: q.revision || 0,
            archived: !q.archived,
          });
          await showQuote(q.id);
        }),
      ),
      el(
        "div",
        { class: "ws-details" },
        detail("Cliente", q.nome),
        detail("Empresa", q.empresa || "—"),
        detail("E-mail", q.email),
        detail("WhatsApp", q.whatsapp),
        detail("Serviço", q.tipoSistema),
        detail("Faixa informada", q.faixaOrcamento),
        detail("Responsável", q.responsible || "—"),
        detail("Criado", dateText(q.criadoEm || q.createdAt)),
        detail("Atualizado", dateText(q.updatedAt)),
        detail("Conta vinculada", q.clientUid || "Ainda não vinculada"),
      ),
      detail("Pedido", q.descricao),
    );
    if (q.draftProposal)
      root.append(
        heading("Proposta em elaboração"),
        detail("Escopo", q.draftProposal.scope),
        detail("Valor proposto", money(q.draftProposal.valueCents)),
        detail(
          "Prazo",
          q.draftProposal.deadline || `${q.draftProposal.estimatedDays} dias`,
        ),
      );
    if (q.sentProposal)
      root.append(
        heading(`Proposta enviada — v${q.proposalVersion}`),
        detail("Escopo enviado", q.sentProposal.scope),
        detail("Valor enviado", money(q.sentProposal.valueCents)),
        detail("Prazo enviado", dateText(q.sentProposal.deadline)),
      );
    if (q.lastDecision)
      root.append(
        detail(
          "Decisão do cliente",
          `${q.lastDecision.decision}: ${q.lastDecision.comment || "Sem comentário"}`,
        ),
      );
    if (q.projectId)
      root.append(
        button(
          "Abrir projeto contratado",
          () => openProject(root, q.projectId, true, () => showQuote(q.id)),
          true,
        ),
      );
  }
  function proposal(q) {
    dialog(
      "Elaborar proposta",
      [
        field("title", "Título do projeto", "text", {
          required: true,
          maxLength: 160,
        }),
        field("scope", "Escopo", "textarea", {
          required: true,
          maxLength: 12000,
        }),
        field("services", "Serviços incluídos", "textarea", {
          required: true,
          maxLength: 6000,
        }),
        field("deliverables", "Entregas", "textarea", {
          required: true,
          maxLength: 6000,
        }),
        field("terms", "Condições comerciais", "textarea", {
          required: true,
          maxLength: 6000,
        }),
        field("valueCents", "Valor proposto (centavos)", "number", {
          required: true,
          help: "Exemplo: 200000 = R$ 2.000,00.",
        }),
        field("deadline", "Data prevista de entrega", "date", {
          required: true,
        }),
        field("estimatedDays", "Prazo estimado em dias", "number", {
          min: 1,
          max: 3650,
          default: 30,
        }),
      ],
      q.draftProposal || { title: q.tipoSistema },
      async (data) => {
        await write("quotes", "proposal", {
          id: q.id,
          revision: q.revision || 0,
          data,
        });
        await showQuote(q.id);
      },
    );
  }
  async function history(q) {
    root.replaceChildren(
      heading(
        "Histórico do orçamento",
        q.id,
        button("← Voltar", () => showQuote(q.id)),
      ),
    );
    await pagedList(
      root,
      (cursor) => api("quotes", "history", { id: q.id, cursor }),
      (v) =>
        card(
          v.action || `Proposta v${v.version}`,
          `${dateText(v.createdAt)} · ${v.authorUid || ""}`,
          button("Detalhes", () =>
            dialog(
              "Registro de auditoria",
              [
                field("content", "Dados registrados", "textarea", {
                  readOnly: true,
                  rows: 15,
                }),
              ],
              { content: JSON.stringify(v, null, 2) },
              async () => {},
              "Fechar",
            ),
          ),
        ),
    );
  }
}
