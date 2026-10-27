import { portalIcon } from "./portal-icons.js";
import {
  buildWelcome,
  buildPortalTabs,
  selectPortalTab,
  buildMetrics,
  projectEmpty,
  projectCard,
  showAccount,
} from "./portal-dashboard.js";
import { initializeSiteNavigation } from "../utils/site-navigation.js";
import { openRegistration } from "./registration-modal.js";
import { auth } from "../../firebase/firebase-config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  reload,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
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
initializeSiteNavigation();
let session,
  active = "Meu painel",
  preview = false;
const params = new URLSearchParams(location.search);
const metricsRoot = document.querySelector("#portal-metrics"),
  summaryError = document.querySelector("#portal-summary-error"),
  bell = document.querySelector("#portal-notifications"),
  exitPanel = document.querySelector("#portal-exit"),
  profileButton = document.querySelector("#profile-menu");
let profile = null,
  metrics = null,
  stopClock = () => {},
  bootstrap = 0,
  summaryVersion = 0,
  projectSearch = "";
const label = (node, icon, text) =>
  node.replaceChildren(portalIcon(icon), el("span", { text }));
label(logout, "logout", "Sair da conta");
label(exitPanel, "home", "Sair do painel");
label(bell, "bell", "Notificações");
const alertDot = el("i", { class: "portal-alert-dot", hidden: true });
bell.append(alertDot);
profileButton.onclick = async () => {
  if (!auth.currentUser) {
    authView.scrollIntoView({ behavior: "smooth" });
    form.elements.email.focus();
    return;
  }
  try {
    profile = profile || (await api("profile", "get"));
    await showAccount(profile, (saved) => {
      profile = saved;
      if (session && !session.admin) welcome();
    });
  } catch (error) {
    say(error.message);
  }
};
bell.onclick = () => navigate("Notificações");
function welcome() {
  stopClock();
  const rawName =
    profile?.name ||
    auth.currentUser?.displayName ||
    (session?.name && !session.name.includes("@")
      ? session.name
      : session?.email?.split("@")[0]) ||
    "cliente";
  stopClock = buildWelcome(account, rawName);
}
window.addEventListener("pagehide", () => stopClock());
window.addEventListener("pageshow", (event) => {
  if (event.persisted && session && !session.admin) welcome();
});
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
    await setPersistence(
      auth,
      form.elements.remember.checked
        ? browserLocalPersistence
        : browserSessionPersistence,
    );
    await signInWithEmailAndPassword(auth, email, password);
  });
};
document.querySelector("#portal-register").onclick = () => {
  authView.hidden = true;
  openRegistration({
    auth,
    email: form.elements.email.value.trim(),
    onCancel: () => {
      authView.hidden = false;
      form.elements.email.focus();
    },
    onCreated: async ({ email, verificationSent }) => {
      await start(null);
      form.elements.email.value = email;
      form.elements.password.value = "";
      message.textContent = verificationSent
        ? "Conta criada! Confira seu e-mail, inclusive a pasta de spam ou lixo eletrônico. Depois de confirmar, entre com sua senha."
        : "Conta criada! Entre com sua senha para reenviar a confirmação de e-mail.";
      form.elements.password.focus();
    },
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
logout.onclick = async () => {
  logout.disabled = true;
  try {
    await signOut(auth);
    location.replace("../index.html?login=1");
  } catch (error) {
    say("Não foi possível sair. Tente novamente.");
  } finally {
    logout.disabled = false;
  }
};
async function start(user) {
  const ticket = ++bootstrap;
  stopClock();
  summaryVersion++;
  setPreviewScope("");
  session = null;
  profile = null;
  metrics = null;
  account.replaceChildren();
  tabs.replaceChildren();
  root.replaceChildren();
  metricsRoot.replaceChildren();
  metricsRoot.hidden = true;
  summaryError.hidden = true;
  alertDot.hidden = true;
  logout.hidden = !user;
  bell.hidden = true;
  exitPanel.hidden = !user;
  label(profileButton, "user", user ? "Minha conta" : "Entrar");
  if (!user) {
    authView.hidden = false;
    view.hidden = true;
    return;
  }
  authView.hidden = true;
  view.hidden = false;
  root.append(empty("Validando acesso…"));
  try {
    await reload(user);
    await user.getIdToken(true);
    const checked = await api("session", "get");
    if (ticket !== bootstrap || auth.currentUser?.uid !== user.uid) return;
    session = checked;
    bell.hidden = session.admin;
    preview = session.admin && params.get("preview") === "1";
    if (session.admin && !preview) {
      account.append(heading("Área do cliente", session.email));
      root.replaceChildren(
        empty(
          "Esta é uma conta administrativa. Para acessar a administração, use o link no rodapé do site.",
        ),
      );
      return;
    }
    if (preview) {
      if (!params.get("project"))
        throw new Error("Selecione um projeto para visualizar o portal.");
      setPreviewScope(params.get("project"));
      account.append(
        el("p", {
          class: "ws-note",
          text: "Prévia do portal: somente conteúdo compartilhado com o cliente.",
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
    profile = await api("profile", "get");
    if (ticket !== bootstrap) return;
    welcome();
    buildPortalTabs(tabs, navigate);
    metrics = buildMetrics(metricsRoot, navigate);
    if (params.get("project")) await openClientProject(params.get("project"));
    else await render();
  } catch (error) {
    if (ticket !== bootstrap) return;
    root.replaceChildren(empty(error.message));
    if (!user.emailVerified)
      root.append(
        button("Reenviar confirmação", async () => {
          await sendEmailVerification(user);
          say(
            "Confirmação enviada. Confira a caixa de entrada e a pasta de spam ou lixo eletrônico.",
          );
        }),
        button("Já confirmei meu e-mail", () => start(user)),
      );
    else root.append(button("Tentar novamente", () => start(user)));
  }
}
async function refreshSummary() {
  if (!metrics || !session || session.admin || preview) return;
  const version = ++summaryVersion;
  metrics.loading();
  summaryError.hidden = true;
  try {
    const values = await api("client-dashboard", "get");
    if (version !== summaryVersion || !auth.currentUser) return;
    metrics.update(values);
    alertDot.hidden = values.unreadNotifications === 0;
    bell.setAttribute(
      "aria-label",
      values.unreadNotifications
        ? "Notificações: " + values.unreadNotifications + " não lidas"
        : "Notificações",
    );
  } catch (error) {
    if (version !== summaryVersion) return;
    metrics.error();
    summaryError.textContent =
      "Não foi possível atualizar os indicadores: " + error.message;
    summaryError.hidden = false;
  }
}
async function navigate(label) {
  if (!session || session.admin || preview) return;
  active = label;
  await render();
}
async function render() {
  if (!session || !auth.currentUser) return;
  selectPortalTab(tabs, active);
  metricsRoot.hidden = active !== "Meu painel";
  root.replaceChildren();
  const content = el("section", { class: "portal-section-content" });
  root.append(content);
  refreshSummary();
  try {
    if (active === "Meu painel") {
      await projectList(content, "Visão geral", true);
      return;
    }
    if (active === "Meus orçamentos") {
      content.append(
        heading(
          "Meus orçamentos",
          "Propostas e decisões relacionadas à sua conta.",
        ),
      );
      await pagedList(
        content,
        (cursor) => api("quotes", "list", { cursor }),
        (q) =>
          card(
            q.sentProposal?.title || q.nome,
            q.tipoSistema + " · " + q.status,
            button("Abrir proposta", () => proposal(q)),
          ),
      );
      return;
    }
    if (active === "Notificações") {
      content.append(
        heading(
          "Notificações",
          "Acompanhe as atualizações da sua conta.",
          button("Atualizar", render),
        ),
      );
      await pagedList(
        content,
        (cursor) => api("notifications", "list", { cursor }),
        (n) =>
          card(
            n.title,
            dateText(n.createdAt) + " · " + (n.readAt ? "Lida" : "Não lida"),
            ...(n.projectId
              ? [
                  button("Abrir projeto", () =>
                    openClientProject(
                      n.projectId,
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
    if (active !== "Meus projetos")
      content.append(heading(active, "Selecione um projeto para continuar."));
    await projectList(
      content,
      active === "Meus projetos" ? "Visão geral" : active,
      false,
    );
  } catch (error) {
    if (content.isConnected)
      content.replaceChildren(
        empty(error.message),
        button("Tentar novamente", render),
      );
  }
}
async function openClientProject(id, tab = "Visão geral") {
  const origin = active;
  metricsRoot.hidden = true;
  summaryError.hidden = true;
  selectPortalTab(tabs, "Meus projetos");
  try {
    await openProject(root, id, false, () => navigate(origin), tab);
  } catch (error) {
    root.replaceChildren(
      empty(error.message),
      button("Voltar", () => navigate(origin)),
    );
  }
}
async function projectList(target, tab = "Visão geral", overview = false) {
  const input = el("input", {
    type: "search",
    value: projectSearch,
    maxLength: 100,
    placeholder: "Buscar projeto, cliente ou descrição...",
    "aria-label": "Buscar projeto, cliente ou descrição",
  });
  const grid = el("div", { class: "portal-project-grid" }),
    more = button("Carregar mais", () => load(false), true);
  more.classList.add("portal-load-more");
  more.replaceChildren(
    portalIcon("plus"),
    el("span", { text: "Carregar mais" }),
  );
  more.hidden = true;
  const refresh = button(
    "Atualizar",
    async () => {
      await Promise.all([load(true), refreshSummary()]);
    },
    true,
  );
  refresh.classList.add("portal-refresh");
  refresh.replaceChildren(
    portalIcon("refresh"),
    el("span", { text: "Atualizar" }),
  );
  const tools = el(
    "div",
    { class: "portal-project-tools" },
    el("label", { class: "portal-search" }, portalIcon("search"), input),
    refresh,
  );
  target.append(
    el(
      "header",
      { class: "portal-project-heading" },
      el(
        "div",
        {},
        el("h2", {
          text: overview
            ? "Meus projetos e próximas entregas"
            : active === "Meus projetos"
              ? "Meus projetos"
              : "Projetos disponíveis",
        }),
        el("p", { text: "As informações são atualizadas a cada consulta." }),
      ),
      tools,
    ),
    grid,
    el("div", { class: "portal-load-more-wrap" }, more),
  );
  let cursor = null,
    items = [],
    request = 0,
    timer;
  input.oninput = () => {
    clearTimeout(timer);
    projectSearch = input.value;
    timer = setTimeout(() => load(true), 350);
  };
  async function load(reset) {
    if (!target.isConnected) return;
    const version = ++request;
    more.disabled = true;
    grid.setAttribute("aria-busy", "true");
    if (reset) {
      cursor = null;
      items = [];
      more.hidden = true;
      grid.replaceChildren(
        el("p", {
          class: "portal-list-status",
          role: "status",
          text: "Carregando projetos…",
        }),
      );
    }
    try {
      const result = await api(
        "projects",
        projectSearch.trim() ? "search" : "list",
        { search: projectSearch.trim(), cursor, limit: 12 },
      );
      if (version !== request || !target.isConnected) return;
      items = reset ? result.items : [...items, ...result.items];
      cursor = result.nextCursor;
      grid.replaceChildren(
        ...items.map((project) =>
          projectCard(project, () => openClientProject(project.id, tab)),
        ),
      );
      if (!items.length) grid.append(projectEmpty(projectSearch.trim()));
      more.hidden = !cursor;
    } catch (error) {
      if (version !== request || !target.isConnected) return;
      grid.replaceChildren(
        el(
          "div",
          { class: "portal-project-empty" },
          portalIcon("folder"),
          el("h3", { text: "Não foi possível carregar os projetos" }),
          el("p", { text: error.message }),
          button("Tentar novamente", () => load(true), true),
        ),
      );
      more.hidden = true;
    } finally {
      if (version === request) {
        more.disabled = false;
        grid.setAttribute("aria-busy", "false");
      }
    }
  }
  await load(true);
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
              if (result.projectId) await openClientProject(result.projectId);
              else await render();
            },
            "Registrar decisão",
          ),
        true,
      ),
    );
}
onAuthStateChanged(auth, (user) => start(user));
