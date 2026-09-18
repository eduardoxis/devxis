# DEVXIS Portfolio

Site estático em HTML/CSS/JavaScript com Firebase Authentication, Firestore e API Serverless da Vercel.

## Segurança e configuração de produção

### Administradores

O painel usa exclusivamente o documento protegido `users/{uid}`. Clientes podem consultar apenas o próprio cadastro e não podem criar, editar ou excluir documentos dessa coleção.

Crie ou altere o cadastro administrativo somente pelo Firebase Console ou pelo Firebase Admin SDK:

```js
import { getFirestore } from 'firebase-admin/firestore';
await getFirestore().doc('users/UID_DO_USUARIO').set({ isAdmin: true }, { merge: true });
// Para remover o acesso, altere isAdmin para false.
```

Nunca crie uma rota pública que permita editar `users/{uid}`.

### Firebase

1. Publique as regras: `firebase deploy --only firestore:rules,firestore:indexes`.
2. Em Authentication > Settings > Authorized domains, mantenha somente produção, desenvolvimento e previews necessários.
3. Ative proteção contra enumeração de e-mails e proteção contra abuso/Identity Platform no Firebase ou Google Cloud quando disponível no seu plano.
4. Configure Firebase App Check para Firestore e registre o provedor web apropriado. App Check complementa, mas não substitui, as regras e a Custom Claim.

### Variáveis da Vercel

Copie `.env.example` sem adicionar valores ao Git. Configure na Vercel:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `RATE_LIMIT_SECRET` (segredo longo e aleatório)
- `ALLOWED_ORIGINS` (origens HTTPS separadas por vírgula; inclua produção e previews necessários)

As credenciais Admin SDK pertencem exclusivamente ao backend. A configuração Web do Firebase pode ser pública; a proteção depende de Authentication, Rules, App Check e restrições de domínio/API.

### API de orçamentos

`POST /api/quotes` aceita somente JSON pequeno, campos conhecidos e valores enumerados. A rota valida no servidor, ignora o honeypot sem revelar detecção, limita tentativas com transação persistente no Firestore e não expõe orçamentos ao público.

O rate limit cria documentos internos em `rate_limits`; eles não podem ser lidos ou gravados por clientes. Programe uma limpeza periódica dos documentos expirados (`expiresAt`) caso o volume seja alto.

### Antes do deploy

1. Não versione `.env`, service accounts, tokens ou chaves privadas.
2. Rode verificações de sintaxe: `node --check api/quotes.js` e `node --check js/admin-modal.js`.
3. Valide o JSON: `node -e "JSON.parse(require('fs').readFileSync('vercel.json'))"`.
4. Teste no Firebase Emulator: visitante não cria/lê projetos privados ou orçamentos; usuário comum não altera `users`, `settings` ou projetos; somente cadastro administrativo protegido opera o painel.
5. Confirme que a CSP e o formulário de orçamento funcionam no domínio final.

## Limitações conhecidas

As imagens permanecem em Base64 no Firestore por compatibilidade. Elas são limitadas e comprimidas, mas Firebase Storage é a opção recomendada para uma galeria muito grande. A migração para Storage deve ser planejada e não é automática.
