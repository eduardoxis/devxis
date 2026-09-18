import { auth, firebaseReady } from '../firebase/firebase-config.js';
import { signInWithEmailAndPassword, signOut, getIdTokenResult } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const form = document.querySelector('#login-form');
const toast = document.querySelector('#toast');
const say = message => { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3500); };

if (!firebaseReady) say('Configure o Firebase antes de fazer login.');

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  const email = form.elements.email.value.trim();
  const password = form.elements.senha.value;
  try {
    button.disabled = true;
    const result = await signInWithEmailAndPassword(auth, email, password);
    const token = await getIdTokenResult(result.user, true);
    if (token.claims.admin !== true) {
      await signOut(auth);
      throw new Error('not-authorized');
    }
    location.href = 'dashboard.html';
  } catch (error) {
    if (location.hostname === 'localhost') console.warn('admin_login_denied', error?.code || 'unknown');
    say('E-mail ou senha inválidos, ou conta sem acesso ao painel.');
  } finally {
    button.disabled = false;
  }
});
