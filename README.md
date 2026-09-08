# DEVXIS Portfolio

1. Preencha os valores `YOUR_FIREBASE_*` em `firebase/firebase-config.js` com a configuração Web do Firebase.
2. No Firebase Authentication, crie a conta do administrador.
3. Defina a custom claim `admin: true` para o UID dessa conta usando Admin SDK ou Cloud Functions. Regras não permitem que o usuário se promova sozinho.
4. Publique `firebase/firestore.rules` no Firebase Console.
5. Crie as collections `projects`, `quotes`, `testimonials`, `technologies`, `profile` e `settings`.

Firebase Web API keys são públicas por design; nunca coloque service accounts ou chaves privadas no frontend.
