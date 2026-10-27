import { write } from "../services/workspace-service.js";
import {
  REGISTRATION_SERVICES,
  REGISTRATION_BUDGETS,
} from "../../shared/registration-fields.js";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

export function openRegistration({ auth, email = "", onCancel, onCreated }) {
  const modal = document.createElement("div");
  modal.id = "client-registration-modal";
  modal.className = "modal";
  modal.innerHTML = `<div class="modal-box admin-modal-box client-registration-box" role="dialog" aria-modal="true" aria-labelledby="client-registration-title">
    <button class="modal-close" type="button" aria-label="Voltar ao login">×</button>
    <img src="/assets/images/logo-devxis.png" alt="DEVXIS" class="admin-modal-logo">
    <h2 id="client-registration-title">Crie sua conta.</h2>
    <p>Acompanhe seus projetos, propostas e entregas.</p>
    <form id="client-registration-form">
      <label>Nome completo<input name="name" autocomplete="name" maxlength="100" required></label>
      <label>WhatsApp<input name="phone" type="tel" autocomplete="tel" minlength="8" maxlength="25" required placeholder="(61) 99999-9999"></label>
      <label>Empresa (opcional)<input name="company" autocomplete="organization" maxlength="120"></label>
      <label>E-mail<input name="email" type="email" autocomplete="email" maxlength="160" required></label>
      <label>Senha<span class="client-password-field"><input name="password" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-eye="password" aria-label="Mostrar senha" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></span><small>Use pelo menos 8 caracteres.</small></label>
      <label>Confirme sua senha<span class="client-password-field"><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-eye="confirmPassword" aria-label="Mostrar confirmação de senha" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></span></label>
      <fieldset class="client-project-interest"><legend>Sobre seu projeto (opcional)</legend><label>O que você precisa?<select name="service"><option value="">Ainda não definido</option></select></label><label>Faixa de investimento<select name="budget"><option value="">Ainda não definida</option></select></label><label>Conte um pouco sobre a ideia<textarea name="description" rows="3" maxlength="3000"></textarea></label><small>Essas informações fazem parte do seu cadastro. Nenhum pedido de orçamento é enviado automaticamente.</small></fieldset>
      <p class="client-registration-error" role="alert"></p>
      <div class="client-registration-actions"><button class="button primary" type="submit">Criar conta</button><button class="button outline" type="button" data-back>Voltar para entrar</button></div>
    </form>
  </div>`;
  const form = modal.querySelector("form"),
    confirm = form.elements.confirmPassword,
    error = modal.querySelector('[role="alert"]');
  let busy = false,
    pendingUser = null;
  for (const value of REGISTRATION_SERVICES)
    form.elements.service.add(new Option(value, value));
  for (const value of REGISTRATION_BUDGETS)
    form.elements.budget.add(new Option(value, value));
  modal.querySelectorAll("[data-eye]").forEach(
    (button) =>
      (button.onclick = () => {
        const input = form.elements[button.dataset.eye],
          show = input.type === "password";
        input.type = show ? "text" : "password";
        button.setAttribute("aria-pressed", String(show));
        button.setAttribute(
          "aria-label",
          (show ? "Ocultar" : "Mostrar") +
            (button.dataset.eye === "password"
              ? " senha"
              : " confirmação de senha"),
        );
        input.focus();
      }),
  );
  form.elements.email.value = email;
  const close = () => {
    document.removeEventListener("keydown", onKey);
    modal.remove();
  };
  const cancel = async () => {
    if (busy) return;
    if (pendingUser) await signOut(auth);
    close();
    onCancel();
  };
  const onKey = (event) => {
    if (event.key === "Escape") cancel();
    if (event.key === "Tab") {
      const inputs = [
        ...modal.querySelectorAll("input,select,textarea,button"),
      ].filter((el) => !el.disabled);
      if (event.shiftKey && document.activeElement === inputs[0]) {
        event.preventDefault();
        inputs.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === inputs.at(-1)) {
        event.preventDefault();
        inputs[0].focus();
      }
    }
  };
  modal.querySelector(".modal-close").onclick = cancel;
  modal.querySelector("[data-back]").onclick = cancel;
  modal.onclick = (event) => {
    if (event.target === modal) cancel();
  };
  for (const input of [form.elements.password, confirm])
    input.oninput = () => confirm.setCustomValidity("");
  form.onsubmit = async (event) => {
    event.preventDefault();
    confirm.setCustomValidity(
      form.elements.password.value === confirm.value
        ? ""
        : "As senhas não coincidem. Digite a mesma senha nos dois campos.",
    );
    if (!form.reportValidity() || busy) return;
    const phone = form.elements.phone.value.trim();
    if (
      !/^[+()\s0-9-]{8,25}$/.test(phone) ||
      phone.replace(/\D/g, "").length < 8
    ) {
      error.textContent = "Confira o WhatsApp informado.";
      return;
    }
    busy = true;
    error.textContent = "";
    modal
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = true));
    try {
      const email = form.elements.email.value.trim();
      if (!pendingUser) {
        const result = await createUserWithEmailAndPassword(
          auth,
          email,
          form.elements.password.value,
        );
        pendingUser = result.user;
        form.elements.email.readOnly = true;
        form.elements.password.readOnly = true;
        confirm.readOnly = true;
      }
      await write("profile", "save", {
        data: {
          name: form.elements.name.value.trim(),
          phone,
          company: form.elements.company.value.trim(),
          service: form.elements.service.value,
          budget: form.elements.budget.value,
          description: form.elements.description.value.trim(),
        },
      });
      let verificationSent = true;
      try {
        await sendEmailVerification(pendingUser);
      } catch {
        verificationSent = false;
      }
      // O cadastro não abre o portal: o usuário deve entrar com suas credenciais.
      await signOut(auth);
      close();
      await onCreated({ email, verificationSent });
    } catch (exception) {
      error.textContent = pendingUser
        ? "A conta foi criada, mas não foi possível salvar os dados. Confira a conexão e clique em Criar conta para tentar salvar novamente."
        : exception.code === "auth/email-already-in-use"
          ? "Este e-mail já possui uma conta. Volte para entrar ou recuperar sua senha."
          : exception.code === "auth/weak-password"
            ? "Escolha uma senha mais forte, com pelo menos 8 caracteres."
            : "Não foi possível criar a conta. Confira os dados e tente novamente.";
    } finally {
      busy = false;
      modal
        .querySelectorAll("button")
        .forEach((button) => (button.disabled = false));
    }
  };
  document.body.append(modal);
  document.addEventListener("keydown", onKey);
  form.elements.name.focus();
}
