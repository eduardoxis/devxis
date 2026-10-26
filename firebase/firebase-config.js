import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth,connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore,connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

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

const local=typeof location!=='undefined'&&['localhost','127.0.0.1'].includes(location.hostname);
const emulator=local&&(new URLSearchParams(location.search).get('emulator')==='1'||sessionStorage.getItem('devxis-emulator')==='1');
if(emulator){sessionStorage.setItem('devxis-emulator','1');firebaseConfig.projectId='demo-devxis';firebaseConfig.authDomain='localhost';}

export const firebaseReady = !hasPlaceholder;
export const app = firebaseReady ? initializeApp(firebaseConfig) : null;
export const auth = firebaseReady ? getAuth(app) : null;
export const db = firebaseReady ? getFirestore(app) : null;
if(emulator){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8080)}
