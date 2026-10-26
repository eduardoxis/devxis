import { api, write, allPages } from "../services/workspace-service.js";
import { auth } from "../../firebase/firebase-config.js";
import {
  PROJECT_STATUSES,
  TASK_STATUSES,
  todayDate,
} from "../../shared/workspace-domain.js";
import {
  el,
  button,
  heading,
  badge,
  money,
  dateText,
  empty,
  detail,
  card,
  field,
  dialog,
  confirmDelete,
  pagedList,
  say,
  download,
} from "./ui.js";
import { umlArea } from "./uml-editor.js";
import { projectReport } from "./reports.js";
export async function openProject(
  root,
  projectId,
  admin,
  onBack,
  initialTab = "Visão geral",
  readOnly = false,
) {
  const modal = root.closest(".admin-modal-box");
  modal?.classList.add("ws-expanded");
  let active = initialTab,
    project;
  const back = () => {
    modal?.classList.remove("ws-expanded");
    return onBack();
  };
  async function refresh() {
    project = await api("projects", "get", { id: projectId });
    root.replaceChildren();
    root.classList.add("ws-root");
    const remaining = project.deadline
      ? Math.ceil(
          (new Date(`${project.deadline}T23:59:59`) - new Date()) / 86400000,
        )
      : null;
    const progress = el("progress", {
      value: project.progress || 0,
      max: 100,
      "aria-label": "Progresso do projeto",
    });
    root.append(
      el(
        "div",
        { class: "ws-project-head" },
        el(
          "div",
          { class: "ws-actions" },
          button("← Voltar", back),
          el(
            "div",
            {},
            el("h2", { text: project.name }),
            el("p", {
              text: `${project.clientName} · ${project.service} · ${project.id}`,
            }),
          ),
          badge(project.status),
        ),
        el(
          "div",
          { class: "ws-progress" },
          el("small", { text: "Progresso por tarefas e pesos" }),
          progress,
          el("b", { text: `${project.progress || 0}%` }),
        ),
      ),
    );
    const toolbar = el("div", { class: "ws-actions ws-toolbar" });
    if (admin)
      toolbar.append(
        button("Editar projeto", editProject),
        button("+ Etapa", () => editStage()),
        button("+ Tarefa", () => editTask()),
        button("Enviar atualização", () =>
          dialog(
            "Atualização do projeto",
            [
              field("message", "Atualização para o cliente", "textarea", {
                required: true,
                maxLength: 6000,
              }),
            ],
            {},
            async (data) => {
              await write("projects", "update", {
                projectId,
                revision: project.revision,
                ...data,
              });
              await refresh();
            },
          ),
        ),
        button("+ Solicitar aprovação", () => editApproval()),
        button("Adicionar arquivo", uploadFile),
        button("Ver portal do cliente", () =>
          window.open(
            `/pages/portal.html?project=${encodeURIComponent(projectId)}&preview=1`,
            "_blank",
            "noopener",
          ),
        ),
        button("Relatório interno", () => chooseReport(false)),
      );
    toolbar.append(
      button("Relatório do cliente", () => chooseReport(true)),
      button("Atualizar", refresh),
    );
    root.append(toolbar);
    const tabs = el("nav", {
      class: "ws-tabs",
      "aria-label": "Áreas do projeto",
    });
    const area = el("section", { class: "ws-project-area" });
    for (const name of [
      "Visão geral",
      "Etapas",
      "Tarefas",
      "UML e Arquitetura",
      "Aprovações",
      "Arquivos",
      "Mensagens",
      "Histórico",
      ...(admin ? ["Configurações"] : []),
    ])
      tabs.append(
        button(
          name,
          async () => {
            active = name;
            await renderArea();
          },
          name === active,
        ),
      );
    root.append(tabs, area);
    async function renderArea() {
      tabs.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("primary", b.textContent === active);
        b.setAttribute(
          "aria-current",
          b.textContent === active ? "page" : "false",
        );
      });
      area.replaceChildren(el("p", { text: "Carregando…" }));
      try {
        area.replaceChildren();
        if (active === "Visão geral") await overview(area, remaining);
        else if (active === "Etapas") await stagesArea(area);
        else if (active === "Tarefas") await tasksArea(area);
        else if (active === "UML e Arquitetura")
          await umlArea(area, project, admin);
        else if (active === "Aprovações") await approvalsArea(area);
        else if (active === "Arquivos") await filesArea(area);
        else if (active === "Mensagens") await messagesArea(area);
        else if (active === "Histórico") await historyArea(area);
        else if (active === "Configurações")
          area.append(
            heading(
              "Configurações do projeto",
              "O vínculo com o cliente e a origem contratual são protegidos.",
            ),
            detail("Cliente vinculado (UID)", project.clientUid),
            detail(
              "Orçamento de origem",
              project.sourceQuoteId || "Projeto criado manualmente",
            ),
            button("Editar dados e observações internas", editProject),
          );
      } catch (error) {
        area.replaceChildren(
          empty(error.message),
          button("Tentar novamente", renderArea),
        );
      }
    }
    await renderArea();
  }
  async function chooseReport(shared) {
    const diagrams = (await allPages("uml", { projectId })).filter(
      (d) => !shared || d.visible,
    );
    dialog(
      "Gerar relatório",
      [
        field("diagrams", "Diagramas para incluir", "multiselect", {
          options: diagrams.map((d) => ({
            value: d.id,
            label: `${d.title} · v${d.version}`,
          })),
          help: "Selecione os diagramas que deseja incluir no relatório.",
        }),
      ],
      { diagrams: diagrams.map((d) => d.id) },
      async (data) => {
        await projectReport(project, shared, data.diagrams);
      },
      "Imprimir / salvar PDF",
    );
  }
  async function overview(area, remaining) {
    const [stages, tasks, approvals, files] = await Promise.all(
      ["stages", "tasks", "approvals", "files"].map((resource) =>
        allPages(resource, { projectId }),
      ),
    );
    const late = tasks.filter(
      (t) =>
        t.deadline &&
        t.deadline < todayDate() &&
        !["Concluída", "Cancelada"].includes(t.status),
    );
    area.append(
      el(
        "div",
        { class: "ws-details" },
        detail("Início", dateText(project.startDate)),
        detail("Entrega prevista", dateText(project.deadline)),
        detail(
          "Tempo restante",
          remaining === null
            ? "Sem prazo"
            : remaining < 0
              ? `${Math.abs(remaining)} dias de atraso`
              : `${remaining} dias`,
        ),
        detail("Valor contratado", money(project.valueCents)),
        detail("Última atualização", dateText(project.updatedAt)),
        detail("Tarefas atrasadas", late.length),
        detail(
          "Aprovações pendentes",
          approvals.filter((a) => a.status === "pendente").length,
        ),
      ),
      el("h4", { text: "Escopo contratado" }),
      el("p", {
        class: "ws-prose",
        text: project.scope || "Ainda não definido.",
      }),
      el("h4", { text: "Cronograma de etapas" }),
      el(
        "div",
        { class: "ws-timeline" },
        ...stages
          .sort((a, b) => a.order - b.order)
          .map((s) => card(s.title, `${s.status} · ${dateText(s.deadline)}`)),
      ),
      el("h4", { text: "Próximas entregas" }),
      ...tasks
        .filter(
          (t) => t.deadline && !["Concluída", "Cancelada"].includes(t.status),
        )
        .sort((a, b) => a.deadline.localeCompare(b.deadline))
        .slice(0, 6)
        .map((t) => card(t.title, `${dateText(t.deadline)} · ${t.status}`)),
      el("h4", { text: "Arquivos recentes" }),
      ...files
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 3)
        .map((f) =>
          card(
            f.name,
            dateText(f.createdAt),
            button("Baixar", () => downloadFile(f)),
          ),
        ),
    );
    if (late.length)
      area.prepend(
        el("p", {
          class: "ws-alert",
          text: `${late.length} tarefa(s) precisam de atenção ao prazo.`,
        }),
      );
  }
  function editProject() {
    const fields = [
      field("name", "Nome", "text", { required: true, maxLength: 160 }),
      field("service", "Serviço", "text", { required: true, maxLength: 100 }),
      field("scope", "Escopo contratado", "textarea", {
        readOnly: Boolean(project.contract),
        maxLength: 12000,
      }),
      field("status", "Status", "select", { options: PROJECT_STATUSES }),
      field("startDate", "Data de início", "date"),
      field("deadline", "Prazo previsto", "date", {
        readOnly: Boolean(project.contract),
        help: project.contract
          ? "Mudanças de prazo e escopo contratado devem ser enviadas em uma solicitação de aprovação."
          : "",
      }),
      field("internalNotes", "Observações internas", "textarea", {
        maxLength: 6000,
      }),
    ];
    dialog("Editar projeto", fields, project, async (data) => {
      await write("projects", "save", {
        projectId,
        revision: project.revision,
        data,
      });
      await refresh();
    });
  }
  async function stagesArea(area) {
    const stages = await allPages("stages", { projectId });
    area.append(
      heading(
        "Etapas",
        "A ordem e os pesos são editáveis.",
        ...(admin ? [button("+ Adicionar etapa", () => editStage())] : []),
      ),
    );
    if (!stages.length) area.append(empty("Nenhuma etapa cadastrada."));
    for (const stage of stages.sort((a, b) => (a.order || 0) - (b.order || 0)))
      area.append(
        card(
          stage.title,
          `${stage.status} · Peso ${stage.weight || 1} · Ordem ${stage.order || 0} · Entrega ${dateText(stage.deadline)}`,
          ...(admin
            ? [
                button("Editar", () => editStage(stage)),
                button("Excluir", () =>
                  confirmDelete(`Excluir etapa ${stage.title}?`, async () => {
                    await write("stages", "delete", {
                      projectId,
                      id: stage.id,
                      revision: stage.revision,
                    });
                    await refresh();
                  }),
                ),
              ]
            : []),
        ),
      );
  }
  function editStage(stage = {}) {
    dialog(
      stage.id ? "Editar etapa" : "Adicionar etapa",
      [
        field("title", "Título", "text", { required: true, maxLength: 160 }),
        field("description", "Descrição", "textarea", { maxLength: 4000 }),
        field("status", "Status", "select", {
          options: ["Não iniciada", "Em andamento", "Concluída"],
        }),
        field("deadline", "Entrega", "date"),
        field("weight", "Peso no progresso", "number", {
          min: 0.1,
          max: 100,
          step: 0.1,
          default: 1,
        }),
        field("order", "Ordem", "number", { max: 10000, default: 0 }),
      ],
      stage,
      async (data) => {
        await write("stages", "save", {
          projectId,
          id: stage.id,
          revision: stage.revision,
          data,
        });
        await refresh();
      },
    );
  }
  async function tasksArea(area) {
    const [tasks, stages, files] = await Promise.all([
      allPages("tasks", { projectId }),
      allPages("stages", { projectId }),
      allPages("files", { projectId }),
    ]);
    let kanban = false;
    const list = el("div");
    const paint = () => {
      list.className = kanban ? "ws-kanban" : "ws-list";
      list.replaceChildren();
      const sorted = tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
      if (!sorted.length) list.append(empty("Nenhuma tarefa cadastrada."));
      const render = (t) => {
        const row = card(
          t.title,
          `${stages.find((s) => s.id === t.stageId)?.title || "—"} · ${t.priority} · ${t.status}${t.blocked ? " · Bloqueada" : ""} · ${dateText(t.deadline)}`,
          button("Comentários", () => taskComments(t)),
          ...(admin
            ? [
                button("Editar", () => editTask(t)),
                button("Solicitar aprovação", () =>
                  editApproval({ taskId: t.id }),
                ),
                button("Excluir", () =>
                  confirmDelete(`Excluir tarefa ${t.title}?`, async () => {
                    await write("tasks", "delete", {
                      projectId,
                      id: t.id,
                      revision: t.revision,
                    });
                    await refresh();
                  }),
                ),
              ]
            : []),
        );
        if (t.description)
          row.append(el("p", { class: "ws-prose", text: t.description }));
        for (const fileId of t.attachments || []) {
          const file = files.find((f) => f.id === fileId);
          if (file)
            row.append(button(`Anexo: ${file.name}`, () => downloadFile(file)));
        }
        return row;
      };
      if (kanban) {
        for (const status of TASK_STATUSES) {
          const column = el(
            "div",
            {},
            el("h4", { text: status }),
            ...sorted.filter((t) => t.status === status).map(render),
          );
          list.append(column);
        }
      } else list.append(...sorted.map(render));
    };
    area.append(
      heading(
        "Tarefas",
        "Altere a ordem no formulário. Dependências e aprovações são validadas pelo servidor.",
        button("Lista / Kanban", () => {
          kanban = !kanban;
          paint();
        }),
        ...(admin ? [button("+ Criar tarefa", () => editTask())] : []),
      ),
      list,
    );
    paint();
  }
  async function editTask(task = {}) {
    const stages = await allPages("stages", { projectId });
    if (!stages.length)
      throw new Error("Crie uma etapa antes de adicionar tarefas.");
    const [tasks, files] = await Promise.all([
      allPages("tasks", { projectId }),
      allPages("files", { projectId }),
    ]);
    const data = {
      ...task,
      dependencies: task.dependencies || [],
      attachments: task.attachments || [],
    };
    dialog(
      task.id ? "Editar tarefa" : "Criar tarefa",
      [
        field("title", "Título", "text", { required: true, maxLength: 160 }),
        field("description", "Descrição", "textarea", { maxLength: 6000 }),
        field("stageId", "Etapa", "select", {
          options: stages.map((s) => ({ value: s.id, label: s.title })),
          default: stages[0].id,
        }),
        field("priority", "Prioridade", "select", {
          options: ["Baixa", "Normal", "Alta", "Urgente"],
          default: "Normal",
        }),
        field("status", "Status", "select", {
          options: TASK_STATUSES,
          default: "Não iniciada",
        }),
        field("deadline", "Prazo", "date"),
        field("weight", "Peso", "number", {
          min: 0.1,
          max: 100,
          step: 0.1,
          default: 1,
        }),
        field("order", "Ordem", "number", { default: 0, max: 10000 }),
        field(
          "dependencies",
          "Tarefas que precisam ser concluídas antes",
          "multiselect",
          {
            options: tasks
              .filter((t) => t.id !== task.id)
              .map((t) => ({ label: t.title, value: t.id })),
            help: "No computador, use Ctrl para selecionar mais de uma opção.",
          },
        ),
        field("attachments", "Anexos", "multiselect", {
          options: files.map((f) => ({ label: f.name, value: f.id })),
        }),
        field("manualBlocked", "Bloqueio manual", "checkbox"),
        field("visible", "Visível no portal do cliente", "checkbox", {
          default: true,
        }),
      ],
      data,
      async (value) => {
        await write("tasks", "save", {
          projectId,
          id: task.id,
          revision: task.revision,
          data: {
            ...value,
            dependencies: value.dependencies,
            attachments: value.attachments,
          },
        });
        await refresh();
      },
    );
  }
  async function taskComments(task) {
    const overlay = el("div", { class: "ws-dialog-backdrop" }),
      box = el(
        "section",
        { class: "ws-dialog" },
        heading(
          `Comentários: ${task.title}`,
          "",
          button("Fechar", () => overlay.remove()),
        ),
      );
    overlay.append(box);
    document.body.append(overlay);
    await messagesArea(box, task.id);
  }
  async function approvalsArea(area) {
    const files = await allPages("files", { projectId });
    area.append(
      heading(
        "Aprovações",
        "Mudanças são executadas somente depois da autorização.",
        ...(admin
          ? [button("+ Solicitar aprovação", () => editApproval())]
          : []),
      ),
    );
    await pagedList(
      area,
      (cursor) => api("approvals", "list", { projectId, cursor }),
      (a) => {
        const row = card(
          a.title,
          `v${a.version} · ${a.status} · Responder até ${dateText(a.deadline)}`,
          badge(a.status),
        );
        row.append(
          el("p", { class: "ws-prose", text: a.description }),
          detail("Motivo", a.reason || "—"),
          detail(
            "Impacto",
            `${money(a.costCents)} adicionais · ${a.impactDays || 0} dia(s)`,
          ),
        );
        if (a.scopeChange)
          row.append(detail("Novo escopo proposto", a.scopeChange));
        for (const fileId of a.attachments || []) {
          const file = files.find((f) => f.id === fileId);
          if (file)
            row.append(button(`Anexo: ${file.name}`, () => downloadFile(file)));
        }
        if (a.response)
          row.append(
            detail(
              "Resposta do cliente",
              `${a.response.comment || a.response.decision} · ${dateText(a.response.createdAt)}`,
            ),
          );
        if (admin) {
          row.append(button("Ver versões", () => approvalVersions(a)));
          if (a.status !== "aprovado")
            row.append(
              button("Revisar", () => editApproval(a)),
              button("Cancelar solicitação", async () => {
                if (
                  !window.confirm(
                    "Cancelar esta solicitação e remover seu bloqueio?",
                  )
                )
                  return;
                await write("approvals", "cancel", {
                  projectId,
                  id: a.id,
                  revision: a.revision,
                });
                await refresh();
              }),
            );
        } else if (!readOnly && a.status === "pendente")
          row.append(button("Responder", () => respondApproval(a), true));
        return row;
      },
    );
  }
  async function editApproval(approval = {}) {
    const [tasks, files] = await Promise.all([
      allPages("tasks", { projectId }),
      allPages("files", { projectId }),
    ]);
    dialog(
      approval.id ? "Revisar solicitação" : "Solicitar aprovação",
      [
        field("title", "Título", "text", { required: true, maxLength: 160 }),
        field("type", "Tipo", "select", {
          options: ["Layout", "Escopo", "Prazo", "Custo", "Entrega", "Outro"],
          default: "Layout",
        }),
        field("description", "Descrição", "textarea", {
          required: true,
          maxLength: 8000,
        }),
        field("reason", "Motivo", "textarea", { maxLength: 4000 }),
        field("impactDays", "Dias adicionais no prazo", "number", {
          max: 3650,
          default: 0,
        }),
        field("costCents", "Custo adicional (centavos)", "number", {
          default: 0,
          help: "Exemplo: 15000 = R$ 150,00.",
        }),
        field(
          "scopeChange",
          "Novo escopo completo (se houver alteração contratual)",
          "textarea",
          { maxLength: 12000 },
        ),
        field("deadline", "Data limite de resposta", "date"),
        field("taskId", "Tarefa vinculada", "select", {
          options: [
            { value: "", label: "Sem tarefa" },
            ...tasks
              .filter((t) => t.visible)
              .map((t) => ({ value: t.id, label: t.title })),
          ],
          readOnly: Boolean(approval.id),
        }),
        field(
          "attachments",
          "Anexos compartilhados com o cliente",
          "multiselect",
          {
            options: files
              .filter((f) => f.visible)
              .map((f) => ({ label: f.name, value: f.id })),
          },
        ),
      ],
      { ...approval, attachments: approval.attachments || [] },
      async (value) => {
        await write("approvals", "save", {
          projectId,
          id: approval.id,
          revision: approval.revision,
          data: value,
        });
        await refresh();
      },
    );
  }
  function respondApproval(a) {
    dialog(
      `Responder: ${a.title}`,
      [
        field("decision", "Sua decisão", "select", {
          options: ["aprovado", "alterações solicitadas", "recusado"],
        }),
        field("comment", "Comentário", "textarea", { maxLength: 3000 }),
        field(
          "confirmImpact",
          `Confirmo ${money(a.costCents)} adicionais e ${a.impactDays || 0} dia(s) de impacto no prazo`,
          "checkbox",
          { required: a.costCents > 0 || a.impactDays > 0 },
        ),
      ],
      {},
      async (data) => {
        await write("approvals", "respond", {
          projectId,
          id: a.id,
          revision: a.revision,
          version: a.version,
          ...data,
        });
        await refresh();
      },
      "Registrar decisão",
    );
  }
  async function approvalVersions(a) {
    const overlay = el("div", { class: "ws-dialog-backdrop" }),
      box = el(
        "section",
        { class: "ws-dialog" },
        heading(
          `Versões: ${a.title}`,
          "",
          button("Fechar", () => overlay.remove()),
        ),
      );
    overlay.append(box);
    document.body.append(overlay);
    await pagedList(
      box,
      (cursor) => api("approvals", "versions", { projectId, id: a.id, cursor }),
      (v) =>
        card(
          `v${v.version} · ${dateText(v.createdAt)}`,
          `${v.description}\n${money(v.costCents)} · ${v.impactDays || 0} dias`,
        ),
    );
  }
  async function filesArea(area) {
    area.append(
      heading(
        "Arquivos",
        "PDF, imagens e TXT: até 200 KB cada; 20 arquivos e 2 MB por projeto.",
        ...(admin ? [button("+ Adicionar arquivo", uploadFile)] : []),
      ),
    );
    await pagedList(
      area,
      (cursor) => api("files", "list", { projectId, cursor }),
      (f) =>
        card(
          f.name,
          `${Math.ceil(f.size / 1024)} KB · ${f.visible ? "Compartilhado" : "Privado"} · ${dateText(f.createdAt)}`,
          button("Baixar", () => downloadFile(f)),
          ...(admin
            ? [
                button("Excluir", () =>
                  confirmDelete(`Excluir arquivo ${f.name}?`, async () => {
                    await write("files", "delete", { projectId, id: f.id });
                    await refresh();
                  }),
                ),
              ]
            : []),
        ),
    );
  }
  function uploadFile() {
    const d = dialog(
      "Adicionar arquivo",
      [
        field("file", "Arquivo (máximo 200 KB)", "file", { required: true }),
        field("visible", "Compartilhar com o cliente", "checkbox"),
      ],
      {},
      async (data) => {
        const file = d.inputs.file.files[0];
        if (!file || file.size > 200 * 1024)
          throw new Error("Escolha um arquivo de até 200 KB.");
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () =>
            reject(new Error("Não foi possível ler o arquivo."));
          reader.readAsDataURL(file);
        });
        await write("files", "upload", {
          projectId,
          name: file.name,
          type: file.type || "text/plain",
          base64,
          visible: data.visible,
        });
        await refresh();
      },
    );
    d.inputs.file.accept = ".pdf,.png,.jpg,.jpeg,.webp,.txt";
  }
  async function downloadFile(file) {
    const data = await write("files", "download", { projectId, id: file.id });
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    download(new Blob([bytes], { type: data.type }), data.name);
  }
  async function messagesArea(area, taskId = "") {
    area.append(
      heading(
        taskId ? "Comentários da tarefa" : "Mensagens",
        "As mensagens são compartilhadas entre você e o cliente.",
        button("Atualizar", () => {
          active = "Mensagens";
          refresh();
        }),
      ),
    );
    const form = el("form", { class: "ws-message-form" }),
      input = el("textarea", {
        required: true,
        maxLength: 5000,
        rows: 3,
        placeholder: "Escreva uma mensagem…",
        "aria-label": "Mensagem",
      }),
      submit = el("button", {
        class: "ws-button primary",
        type: "submit",
        text: "Enviar",
      });
    form.append(input, submit);
    form.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        await write("messages", "send", {
          projectId,
          content: input.value,
          taskId,
        });
        input.value = "";
        await paint();
      } catch (error) {
        say(error.message);
      } finally {
        submit.disabled = false;
      }
    };
    const list = el("div");
    if (!readOnly) area.append(form);
    area.append(list);
    async function paint() {
      list.replaceChildren();
      await pagedList(
        list,
        (cursor) => api("messages", "list", { projectId, taskId, cursor }),
        (m) => {
          const row = card(
            m.authorName,
            `${m.authorRole} · ${dateText(m.createdAt)} · ${m.readAt ? "Lida" : "Enviada"}`,
          );
          row.append(el("p", { class: "ws-prose", text: m.content }));
          if (!readOnly && !m.readAt && m.authorUid !== auth.currentUser?.uid)
            row.append(
              button("Marcar como lida", async () => {
                await write("messages", "read", { projectId, id: m.id });
                await paint();
              }),
            );
          return row;
        },
      );
    }
    await paint();
  }
  async function historyArea(area) {
    area.append(heading("Histórico", "Eventos registrados pelo servidor."));
    await pagedList(
      area,
      (cursor) => api("projects", "history", { projectId, cursor }),
      (e) =>
        card(
          e.action,
          `${dateText(e.createdAt)} · ${e.actorName || "—"}${e.details ? ` · ${e.details}` : ""}`,
        ),
    );
  }
  await refresh();
}
