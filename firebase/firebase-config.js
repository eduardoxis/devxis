import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Cole aqui os dados do seu aplicativo Web, obtidos no Console do Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyCJ4itSfOYwPyIkbiQVEGoeL1yFTJXdpOU",
  authDomain: "devxis-91948.firebaseapp.com",
  projectId: "devxis-91948",
  storageBucket: "devxis-91948.firebasestorage.app",
  messagingSenderId: "48502567432",
  appId: "1:48502567432:web:809508fc8a37e352d097bd"
};

const hasPlaceholder = Object.values(firebaseConfig).some((value) =>
  value.startsWith('YOUR_'),
);

export const firebaseReady = !hasPlaceholder;
export const app = firebaseReady ? initializeApp(firebaseConfig) : null;
export const auth = firebaseReady ? getAuth(app) : null;
export const db = firebaseReady ? getFirestore(app) : null;
