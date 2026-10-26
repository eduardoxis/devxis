import { auth } from "../../firebase/firebase-config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  reload,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { api, write, setPreviewScope } from "../services/workspace-service.js";
import {
  el,
  button,
  heading,
  detail,
  card,
  field,
  dialog,
  money,
  dateText,
  pagedList,
  say,
  empty,
} from "../workspace/ui.js";
import { openProject } from "../workspace/project-console.js";
import { printProposal } from "../workspace/reports.js";
const authView = document.querySelector("#portal-auth"),
  view = document.querySelector("#portal-view"),
  root = document.querySelector("#portal-content"),
  tabs = document.querySelector("#portal-tabs"),
  account = document.querySelector("#portal-account"),
  form = document.querySelector("#portal-login"),
  message = document.querySelector("#portal-auth-message"),
  logout = document.querySelector("#portal-logout");
let session,
  active = "Meu painel",
  preview = false;
const params = new URLSearchParams(location.search);
const credentials = () => ({
  email: form.elements.email.value.trim(),
  password: form.elements.password.value,
});
async function attempt(task) {
  for (const button of form.querySelectorAll("button")) button.disabled = true;
  message.textContent = "";
  try {
    await task();
  } catch (error) {
    message.textContent =
      error.code === "auth/invalid-credential"
        ? "Confira o e-mail e a senha."
        : error.message || "Não foi possível entrar.";
  } finally {
    for (const button of form.querySelectorAll("button"))
      button.disabled = false;
  }
}
form.onsubmit = (event) => {
  event.preventDefault();
  attempt(async () => {
    const { email, password } = credentials();
    await signInWithEmailAndPassword(auth, email, password);
  });
};
document.querySelector("#portal-register").onclick = () => {
  if (!form.reportValidity()) return;
  attempt(async () => {
    const { email, password } = credentials();
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(result.user);
    message.textContent =
      "Conta criada. Confirme o e-mail recebido para liberar o acesso.";
    await start(result.user);
  });
};
document.querySelector("#portal-reset").onclick = () =>
  attempt(async () => {
    const { email } = credentials();
    if (!email) throw new Error("Informe o e-mail para recuperar sua senha.");
    try {
      await sendPasswordResetEmail(auth, email);
    } catch {}
    message.textContent =
      "Se existir uma conta associada, você receberá as instruções.";
  });
logout.onclick = () => signOut(auth);
async function start(user) {
  setPreviewScope("");
  logout.hidden = !user;
  if (!user) {
    authView.hidden = false;
    view.hidden = true;
    return;
  }
  authView.hidden = true;
  view.hidden = false;
  account.replaceChildren();
  tabs.replaceChildren();
  root.replaceChildren(empty("Validando acesso…"));
  try {
    await reload(user);
    await user.getIdToken(true);
    session = await api("session", "get");
    preview = session.admin && params.get("preview") === "1";
    if (session.admin && !preview) {
      account.append(heading('Área do cliente',session.email));
      root.replaceChildren(empty('Esta é uma conta administrativa. Para acessar a administração, use o link no rodapé do site.'));
      return;
    }
    if (preview) {
      if (!params.get("project"))
        throw new Error("Selecione um projeto para visualizar o portal.");
      setPreviewScope(params.get("project"));
      account.append(
        el("p", {
          class: "ws-note",
          text: "Prévia do portal: acesso somente ao conteúdo compartilhado com este cliente.",
        }),
      );
      await openProject(
        root,
        params.get("project"),
        false,
        () => (location.href = "../index.html"),
        "Visão geral",
        true,
      );
      return;
    }
    account.append(
      heading(
        "Meu portal",
        session.email,
        button("Copiar meu UID", () =>
          navigator.clipboard.writeText(session.uid),
        ),
      ),
    );
    account.append(
      el("small", {
        text: `Seu UID para vinculação pelo administrador: ${session.uid}`,
      }),
    );
    for (const label of [
      "Meu painel",
      "Meus orçamentos",
      "Meus projetos",
      "Aprovações",
      "Mensagens",
      "Arquivos",
      "Notificações",
    ])
      tabs.append(
        button(
          label,
          async () => {
            active = label;
            await render();
          },
          label === active,
        ),
      );
    if (params.get("project"))
      await openProject(root, params.get("project"), false, render);
    else await render();
  } catch (error) {
    root.replaceChildren(empty(error.message));
    if (!user.emailVerified)
      root.append(
        button("Reenviar confirmação", async () => {
          await sendEmailVerification(user);
          say("Confirmação enviada. Verifique sua caixa de entrada.");
        }),
        button("Já confirmei meu e-mail", () => start(user)),
      );
    else root.append(button("Tentar novamente", () => start(user)));
  }
}
async function render() {
  tabs
    .querySelectorAll("button")
    .forEach((b) => b.classList.toggle("primary", b.textContent === active));
  root.replaceChildren();
  try {
    if (active === "Meu painel") {
      root.append(
        heading(
          "Meus projetos e próximas entregas",
          "As informações são atualizadas a cada consulta.",
          button("Atualizar", render),
        ),
      );
      await projectList(root);
      return;
    }
    if (active === "Meus orçamentos") {
      root.append(
        heading(
          "Meus orçamentos",
          "Leia a proposta vigente antes de registrar sua decisão.",
        ),
      );
      await pagedList(
        root,
        (cursor) => api("quotes", "list", { cursor }),
        (q) =>
          card(
            q.nome,
            `${q.tipoSistema} · ${q.status}`,
            button("Abrir proposta", () => proposal(q)),
          ),
      );
      return;
    }
    if (active === "Notificações") {
      root.append(heading("Notificações", "", button("Atualizar", render)));
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
                      false,
                      render,
                      n.kind === "approval" ? "Aprovações" : "Visão geral",
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
    root.append(heading(active, "Selecione um projeto."));
    await projectList(
      root,
      active === "Meus projetos" ? "Visão geral" : active,
    );
  } catch (error) {
    root.replaceChildren(
      empty(error.message),
      button("Tentar novamente", render),
    );
  }
}
async function projectList(target, tab = "Visão geral") {
  await pagedList(
    target,
    (cursor) => api("projects", "list", { cursor }),
    (p) =>
      card(
        p.name,
        `${p.status} · ${p.progress || 0}% · Entrega: ${dateText(p.deadline)}`,
        button(
          "Abrir projeto",
          () => openProject(root, p.id, false, render, tab),
          true,
        ),
      ),
  );
}
async function proposal(q) {
  root.replaceChildren(
    heading(`Proposta: ${q.tipoSistema}`, q.status, button("← Voltar", render)),
  );
  const p = q.sentProposal;
  if (!p) {
    root.append(empty("A proposta ainda está sendo elaborada."));
    return;
  }
  root.append(
    heading(
      p.title,
      `Versão ${q.proposalVersion}`,
      button("Imprimir / PDF", () => printProposal(q)),
    ),
    detail("Valor proposto", money(p.valueCents)),
    detail("Prazo previsto", dateText(p.deadline)),
    detail("Escopo", p.scope),
    detail("Serviços", p.services),
    detail("Entregas", p.deliverables),
    detail("Condições comerciais", p.terms),
  );
  if (["proposta enviada", "aguardando aprovação"].includes(q.status))
    root.append(
      button(
        "Responder proposta",
        () =>
          dialog(
            "Sua decisão",
            [
              field("decision", "Decisão", "select", {
                options: [
                  { value: "aprovar", label: "Aprovar" },
                  { value: "alterar", label: "Solicitar alteração" },
                  { value: "recusar", label: "Recusar" },
                ],
                default: "aprovar",
              }),
              field("comment", "Comentário", "textarea", { maxLength: 3000 }),
              field(
                "confirmTerms",
                `Li e aceito o escopo, as condições, o valor de ${money(p.valueCents)} e o prazo de ${dateText(p.deadline)}`,
                "checkbox",
              ),
            ],
            {},
            async (data) => {
              const result = await write("quotes", "respond", {
                id: q.id,
                revision: q.revision,
                proposalVersion: q.proposalVersion,
                ...data,
              });
              if (result.projectId)
                await openProject(root, result.projectId, false, render);
              else await render();
            },
            "Registrar decisão",
          ),
        true,
      ),
    );
}
onAuthStateChanged(auth, (user) => start(user));
