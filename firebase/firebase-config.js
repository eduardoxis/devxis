import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const firebaseConfig={apiKey:'YOUR_FIREBASE_API_KEY',authDomain:'YOUR_FIREBASE_AUTH_DOMAIN',projectId:'YOUR_FIREBASE_PROJECT_ID',messagingSenderId:'YOUR_FIREBASE_MESSAGING_SENDER_ID',appId:'YOUR_FIREBASE_APP_ID'};
export const firebaseReady=!Object.values(firebaseConfig).some(value=>value.startsWith('YOUR_'));
export const app=firebaseReady?initializeApp(firebaseConfig):null;
export const auth=firebaseReady?getAuth(app):null; export const db=firebaseReady?getFirestore(app):null;
