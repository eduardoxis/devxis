import { diagramTemplates as templates } from "../../shared/diagram-templates.js";
import { api, write, allPages } from "../services/workspace-service.js";
import { UML_TYPES } from "../../shared/workspace-domain.js";
import {
  el,
  button,
  heading,
  badge,
  dateText,
  empty,
  field,
  dialog,
  confirmDelete,
  download,
  say,
  pagedList,
} from "./ui.js";
import { printDocument } from "./reports.js";
let library,
  renderId = 0;
async function mermaid() {
  if (!library) {
    library = import("../vendor/mermaid/mermaid.esm.min.mjs")
      .then(({ default: m }) => {
        m.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          htmlLabels: false,
          class: { htmlLabels: false },
          theme: "base",
          themeVariables: {
            primaryColor: "#edf5ff",
            primaryTextColor: "#071832",
            primaryBorderColor: "#087bff",
            lineColor: "#527198",
            fontFamily: "Plus Jakarta Sans, sans-serif",
          },
          flowchart: { htmlLabels: false },
          maxTextSize: 24000,
          suppressErrorRendering: true,
        });
        return m;
      })
      .catch((error) => {
        library = null;
        throw new Error(
          `Não foi possível carregar o editor de diagramas: ${error.message}`,
        );
      });
  }
  return library;
}
export async function renderDiagram(source, target) {
  const m = await mermaid();
  const { svg } = await m.render(`devxis_uml_${++renderId}`, source);
  target.innerHTML = svg;
  const node = target.querySelector("svg");
  const dimensions = node.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
  if (dimensions?.length === 4) {
    node.setAttribute("width", String(Math.ceil(dimensions[2])));
    node.setAttribute("height", String(Math.ceil(dimensions[3])));
  }
  node.style.maxWidth = "none";
  return new XMLSerializer().serializeToString(node);
}

export async function umlArea(root, project, admin, selectedId = "") {
  root.replaceChildren();
  const diagrams = await allPages("uml", { projectId: project.id });
  root.append(
    heading(
      "UML e Arquitetura",
      "Definição Mermaid com prévia visual. Diagramas novos são privados.",
      ...(admin ? [button("+ Novo diagrama", () => create())] : []),
    ),
  );
  const types = el("div", { class: "ws-uml-types" });
  for (const type of UML_TYPES) {
    const list = diagrams
        .filter((d) => d.type === type)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      last = list[0];
    types.append(
      button(
        `${type}\n${last ? `v${last.version} · ${dateText(last.updatedAt)}` : "Ainda não criado"}`,
        () => {
          if (last) open(last);
          else if (admin) create(type);
          else say("Nenhum diagrama compartilhado deste tipo.");
        },
      ),
    );
  }
  root.append(types);
  const select = el("select", { "aria-label": "Diagrama" });
  select.add(new Option("Selecione um diagrama", ""));
  diagrams.forEach((d) =>
    select.add(new Option(`${d.title} · v${d.version}`, d.id)),
  );
  select.onchange = () => open(diagrams.find((d) => d.id === select.value));
  root.append(select);
  const editor = el("section", { class: "ws-uml-editor" });
  root.append(editor);
  function create(type = UML_TYPES[0]) {
    dialog(
      "Novo diagrama",
      [
        field("title", "Título", "text", { required: true, maxLength: 160 }),
        field("type", "Tipo", "select", { options: UML_TYPES }),
      ],
      { title: type, type },
      async (data) => {
        const item = await write("uml", "save", {
          projectId: project.id,
          data: {
            ...data,
            source: templates[data.type],
            description: "",
            notes: "",
            visible: false,
            stageId: "",
            taskId: "",
          },
        });
        await umlArea(root, project, admin, item.id);
      },
    );
  }
  async function open(diagram) {
    if (!diagram) {
      editor.replaceChildren();
      return;
    }
    select.value = diagram.id;
    let current = diagram,
      svg = "",
      zoom = 1,
      sequence = 0,
      valid = false;
    const preview = el("div", { class: "ws-diagram-canvas" }),
      viewport = el(
        "div",
        {
          class: "ws-diagram-viewport",
          tabIndex: 0,
          "aria-label": "Prévia do diagrama. Arraste o fundo para mover.",
        },
        preview,
      ),
      source = el("textarea", {
        class: "ws-code",
        value: diagram.source,
        readOnly: !admin,
        spellcheck: false,
        "aria-label": "Definição Mermaid",
        maxLength: 24000,
      });
    const status = el("p", { class: "ws-error", role: "status" }),
      version = el("span", { text: `v${diagram.version}` });
    const title = el("input", {
        value: diagram.title,
        readOnly: !admin,
        maxLength: 160,
        "aria-label": "Título",
      }),
      description = el("textarea", {
        value: diagram.description || "",
        readOnly: !admin,
        rows: 2,
        maxLength: 4000,
        "aria-label": "Descrição",
      }),
      notes = el("textarea", {
        value: diagram.notes || "",
        readOnly: !admin,
        rows: 3,
        maxLength: 6000,
        "aria-label": "Observações técnicas",
      }),
      visible = el("input", {
        type: "checkbox",
        checked: diagram.visible,
        disabled: !admin,
      });
    const type = el("select", {
      "aria-label": "Tipo de diagrama",
      disabled: !admin,
    });
    UML_TYPES.forEach((t) =>
      type.add(new Option(t, t, t === diagram.type, t === diagram.type)),
    );
    const stage = el("select", {
        "aria-label": "Etapa vinculada",
        disabled: !admin,
      }),
      task = el("select", {
        "aria-label": "Tarefa vinculada",
        disabled: !admin,
      });
    stage.add(new Option("Sem etapa", ""));
    task.add(new Option("Sem tarefa", ""));
    if (admin) {
      const [stages, tasks] = await Promise.all([
        allPages("stages", { projectId: project.id }),
        allPages("tasks", { projectId: project.id }),
      ]);
      stages.forEach((s) => stage.add(new Option(s.title, s.id)));
      tasks.forEach((t) => task.add(new Option(t.title, t.id)));
      stage.value = diagram.stageId || "";
      task.value = diagram.taskId || "";
    }
    const props = el(
      "aside",
      { class: "ws-uml-properties" },
      el("h4", { text: "Propriedades" }),
      el("label", {}, "Título", title),
      el("label", {}, "Tipo", type),
      el("label", {}, "Descrição", description),
      el("label", {}, "Etapa", stage),
      el("label", {}, "Tarefa", task),
      el("label", {}, "Observações técnicas", notes),
      el(
        "label",
        { class: "ws-check" },
        visible,
        "Visível no portal do cliente",
      ),
      el("small", {
        text: `Autor: ${diagram.authorName || "—"} · ${dateText(diagram.updatedAt)}`,
      }),
      version,
    );
    const refreshPreview = async () => {
      const ticket = ++sequence;
      valid = false;
      status.textContent = "Renderizando…";
      const temp = el("div");
      try {
        const rendered = await renderDiagram(source.value, temp);
        if (ticket !== sequence) return;
        preview.replaceChildren(...temp.childNodes);
        svg = rendered;
        valid = true;
        status.textContent = "";
      } catch (error) {
        if (ticket === sequence) {
          preview.replaceChildren(
            empty("Corrija a definição para visualizar."),
          );
          status.textContent = `Definição inválida: ${error.message.slice(0, 300)}`;
        }
      }
    };
    let debounce;
    source.oninput = () => {
      clearTimeout(debounce);
      debounce = setTimeout(refreshPreview, 450);
    };
    const zoomBy = (delta) => {
      zoom = Math.min(3, Math.max(0.25, zoom + delta));
      preview.style.transform = `scale(${zoom})`;
      zoomText.textContent = `${Math.round(zoom * 100)}%`;
    };
    const zoomText = el("span", { text: "100%" });
    let drag;
    viewport.onpointerdown = (e) => {
      if (e.button !== 0) return;
      drag = {
        x: e.clientX,
        y: e.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      viewport.setPointerCapture(e.pointerId);
    };
    viewport.onpointermove = (e) => {
      if (drag) {
        viewport.scrollLeft = drag.left - (e.clientX - drag.x);
        viewport.scrollTop = drag.top - (e.clientY - drag.y);
      }
    };
    viewport.onpointerup = () => (drag = null);
    const exportSvg = () => {
      if (!valid) throw new Error("Corrija a definição antes de exportar.");
      download(
        new Blob([svg], { type: "image/svg+xml" }),
        `${current.title}.svg`,
      );
    };
    const exportPng = async () => {
      if (!valid) throw new Error("Corrija a definição antes de exportar.");
      const url = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml" }),
      );
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(image.width, 1200);
        canvas.height = Math.max(
          1,
          Math.round((image.height / image.width) * canvas.width),
        );
        if (canvas.width * canvas.height > 16000000)
          throw new Error("Diagrama muito grande para PNG. Use SVG.");
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve));
        if (!blob)
          throw new Error(
            "Este navegador não conseguiu exportar PNG. Use SVG.",
          );
        download(blob, `${current.title}.png`);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    const actions = [
      button("Exportar SVG", exportSvg),
      button("Exportar PNG", exportPng),
      button("Imprimir / PDF", () => {
        if (!valid) throw new Error("Corrija o diagrama antes de imprimir.");
        printDocument(current.title, [
          el("p", {
            text: `v${current.version} · ${current.description || ""}`,
          }),
          preview.cloneNode(true),
        ]);
      }),
    ];
    if (admin)
      actions.unshift(
        button(
          "Salvar",
          async () => {
            await refreshPreview();
            if (!valid) throw new Error("Corrija a sintaxe antes de salvar.");
            current = await write("uml", "save", {
              projectId: project.id,
              id: current.id,
              revision: current.revision,
              data: {
                title: title.value,
                type: type.value,
                description: description.value,
                source: source.value,
                notes: notes.value,
                visible: visible.checked,
                stageId: stage.value,
                taskId: task.value,
              },
            });
            diagram = current;
            diagrams[diagrams.findIndex((d) => d.id === current.id)] = current;
            version.textContent = `v${current.version}`;
            say("Diagrama e nova versão salvos.");
            await umlArea(root, project, admin, current.id);
          },
          true,
        ),
        button("Duplicar", async () => {
          await write("uml", "duplicate", {
            projectId: project.id,
            id: current.id,
            revision: current.revision,
          });
          await umlArea(root, project, admin);
        }),
        button("Excluir", () =>
          confirmDelete(`Excluir “${current.title}”?`, async () => {
            await write("uml", "delete", {
              projectId: project.id,
              id: current.id,
              revision: current.revision,
            });
            await umlArea(root, project, admin);
          }),
        ),
      );
    editor.replaceChildren(
      heading(current.title, current.type, ...actions),
      status,
      el(
        "div",
        { class: "ws-uml-columns" },
        el(
          "div",
          { class: "ws-visual" },
          el(
            "div",
            { class: "ws-actions" },
            button("−", () => zoomBy(-0.1)),
            zoomText,
            button("+", () => zoomBy(0.1)),
            button("100%", () => {
              zoom = 1;
              zoomBy(0);
            }),
            button("Tela cheia", () => viewport.requestFullscreen()),
          ),
          viewport,
        ),
        el(
          "div",
          {},
          el("h4", { text: "Definição (Mermaid)" }),
          source,
          button("Copiar definição", () =>
            navigator.clipboard.writeText(source.value),
          ),
        ),
        props,
      ),
    );
    if (current.type === "Banco de dados (DER)")
      editor.prepend(
        el("p", {
          class: "ws-note",
          text: "Firestore guarda documentos em coleções. As relações deste modelo são referências lógicas, sem chaves estrangeiras, joins ou integridade relacional automática.",
        }),
      );
    const versionRoot = el("div", { class: "ws-version-list" });
    if (admin) props.append(el("h4", { text: "Versões" }), versionRoot);
    async function versions() {
      versionRoot.replaceChildren();
      await pagedList(
        versionRoot,
        (cursor) =>
          api("uml", "versions", {
            projectId: project.id,
            id: current.id,
            cursor,
          }),
        (v) =>
          el(
            "article",
            {},
            el("b", { text: `v${v.version} · ${dateText(v.updatedAt)}` }),
            button("Carregar esta versão", () => {
              source.value = v.source;
              title.value = v.title;
              description.value = v.description || "";
              notes.value = v.notes || "";
              type.value = v.type;
              visible.checked = v.visible;
              stage.value = v.stageId || "";
              task.value = v.taskId || "";
              refreshPreview();
              say(
                "Versão carregada no editor. Salve para criar uma nova versão.",
              );
            }),
          ),
      );
    }
    await refreshPreview();
    if (admin) await versions();
  }
  if (diagrams.length)
    await open(diagrams.find((d) => d.id === selectedId) || diagrams[0]);
  else
    editor.append(
      empty(
        admin
          ? "Crie o primeiro diagrama do projeto."
          : "Nenhum diagrama foi compartilhado.",
      ),
    );
}
