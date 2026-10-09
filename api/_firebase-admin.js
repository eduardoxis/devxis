import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function cleanEnvironmentValue(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    return cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

function normalizePrivateKey(value) {
  let key = cleanEnvironmentValue(value);
  if (!key) return '';

  // O painel da Vercel pode armazenar as quebras de linha como "\\n"
  // ou como quebras reais. O Admin SDK exige sempre o formato real.
  key = key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  return key.trim();
}

function credentials() {
  const projectId = cleanEnvironmentValue(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = cleanEnvironmentValue(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  if (!projectId || !clientEmail || !privateKey) {
    console.error('firebase_admin_environment_missing', {
      projectId: Boolean(projectId),
      clientEmail: Boolean(clientEmail),
      privateKey: Boolean(privateKey),
    });
    throw new Error('Firebase Admin não configurado.');
  }

  return cert({
    projectId,
    clientEmail,
    privateKey,
  });
}
function getAdminApp() {
  return getApps()[0] || initializeApp({ credential: credentials() });
}

// Inicialização tardia: uma variável ausente não derruba a rota antes do handler
// conseguir responder com um erro controlado.
export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}
