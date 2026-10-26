import {createUserWithEmailAndPassword,sendEmailVerification,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

export function openRegistration({auth,email='',onCancel,onCreated}) {
  const modal=document.createElement('div');
  modal.id='client-registration-modal';
  modal.className='modal';
  modal.innerHTML=`<div class="modal-box admin-modal-box client-registration-box" role="dialog" aria-modal="true" aria-labelledby="client-registration-title">
    <button class="modal-close" type="button" aria-label="Voltar ao login">×</button>
    <img src="assets/images/logo-devxis.png" alt="DEVXIS" class="admin-modal-logo">
    <h2 id="client-registration-title">Crie sua conta.</h2>
    <p>Acompanhe seus projetos, propostas e entregas.</p>
    <form id="client-registration-form">
      <label>E-mail<input name="email" type="email" autocomplete="email" maxlength="160" required></label>
      <label>Senha<input name="password" type="password" autocomplete="new-password" minlength="8" required><small>Use pelo menos 8 caracteres.</small></label>
      <label>Confirme sua senha<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label>
      <p class="client-registration-error" role="alert"></p>
      <div class="client-registration-actions"><button class="button primary" type="submit">Criar conta</button><button class="button outline" type="button" data-back>Voltar para entrar</button></div>
    </form>
  </div>`;
  const form=modal.querySelector('form'),confirm=form.elements.confirmPassword,error=modal.querySelector('[role="alert"]');
  let busy=false;
  form.elements.email.value=email;
  const close=()=>{document.removeEventListener('keydown',onKey);modal.remove()};
  const cancel=()=>{if(busy)return;close();onCancel()};
  const onKey=event=>{if(event.key==='Escape')cancel();if(event.key==='Tab'){const inputs=[...modal.querySelectorAll('input,button')].filter(el=>!el.disabled);if(event.shiftKey&&document.activeElement===inputs[0]){event.preventDefault();inputs.at(-1).focus()}else if(!event.shiftKey&&document.activeElement===inputs.at(-1)){event.preventDefault();inputs[0].focus()}}};
  modal.querySelector('.modal-close').onclick=cancel;
  modal.querySelector('[data-back]').onclick=cancel;
  modal.onclick=event=>{if(event.target===modal)cancel()};
  for(const input of [form.elements.password,confirm])input.oninput=()=>confirm.setCustomValidity('');
  form.onsubmit=async event=>{
    event.preventDefault();
    confirm.setCustomValidity(form.elements.password.value===confirm.value?'':'As senhas não coincidem. Digite a mesma senha nos dois campos.');
    if(!form.reportValidity()||busy)return;
    busy=true;error.textContent='';modal.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{
      const email=form.elements.email.value.trim();
      const result=await createUserWithEmailAndPassword(auth,email,form.elements.password.value);
      let verificationSent=true;
      try{await sendEmailVerification(result.user)}catch{verificationSent=false}
      // O cadastro não abre o portal: o usuário deve entrar com suas credenciais.
      await signOut(auth);
      close();await onCreated({email,verificationSent});
    }catch(exception){error.textContent=exception.code==='auth/email-already-in-use'?'Este e-mail já possui uma conta. Volte para entrar ou recuperar sua senha.':exception.code==='auth/weak-password'?'Escolha uma senha mais forte, com pelo menos 8 caracteres.':'Não foi possível criar a conta. Confira os dados e tente novamente.'}
    finally{busy=false;modal.querySelectorAll('button').forEach(button=>button.disabled=false)}
  };
  document.body.append(modal);document.addEventListener('keydown',onKey);form.elements.email.focus();
}
