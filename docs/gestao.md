# Gestão DEVXIS — configuração e operação

A implementação amplia o site existente. O painel continua sendo o modal administrativo com cabeçalho e abas horizontais. Abrir um projeto expande esse mesmo modal; **Voltar** retorna à administração. O portfólio público permanece na coleção `projects` e na aba **Portfólio**.

O portal do cliente e o modal administrativo usam o menu do site, inclusive a navegação mobile. No modal administrativo, as abas de gestão permanecem abaixo desse cabeçalho; os links públicos fecham o modal e levam à seção do site. O acesso administrativo continua exclusivamente no rodapé.

## O que está implementado

- Indicadores por consultas de agregação, entregas próximas e atividades recentes.
- Orçamentos legados e novos, edição, destinatário verificado, proposta comercial, histórico, arquivamento e impressão em PDF.
- Aprovação de proposta pelo cliente, criação transacional de um projeto com ID determinístico `quote_<id>` e proteção contra duplicidade.
- Central do projeto com escopo, prazo, valor, etapas, tarefas, lista/Kanban, prioridade, dependências, bloqueios, comentários e anexos.
- Progresso calculado por tarefas reais. Peso efetivo = peso da tarefa × peso da etapa; canceladas não entram no cálculo. Sem tarefas, progresso é 0%. A conclusão da etapa exige a conclusão ou cancelamento das suas tarefas.
- Nove categorias de documentação UML/arquitetura, definição Mermaid, prévia, zoom, movimentação da visualização, versões, restauração no editor, duplicação, exclusão confirmada, exportação SVG/PNG e impressão/PDF.
- Diagramas privados por padrão, com associação a etapa/tarefa e compartilhamento explícito. O cliente não pode editar UML nem consultar versões administrativas antigas.
- Solicitações de aprovação versionadas, revisão após pedido de alteração, decisão autenticada e bloqueio de tarefa. Custos e dias adicionais exigem confirmação expressa. O aceite atualiza os termos do projeto e cria uma versão contratual; não executa alterações no site.
- Portal com conta própria, verificação de e-mail, orçamento, projeto, entregas, histórico, aprovações, conversa, arquivos e notificações internas.
- Anexos pequenos privados, validados por tamanho, MIME e assinatura, sem Firebase Storage.
- Relatório interno e relatório do cliente, com seleção dos diagramas incluídos, impressão do navegador e identidade DEVXIS. A versão compartilhável exclui tarefas, eventos, notas internas e diagramas não compartilhados.

## Configuração de produção

Nenhuma configuração de produção, publicação, cobrança, commit ou push é realizada automaticamente.

1. Mantenha o Firebase Authentication existente e habilite **E-mail/senha**. Confira os domínios autorizados e os modelos gratuitos de confirmação e recuperação de senha.
2. Preserve o cadastro administrativo `users/<UID>` com `isAdmin: true`. Somente o Console ou o Admin SDK deve definir esse campo.
3. Configure no servidor as variáveis de `.env.example`: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `RATE_LIMIT_SECRET` e `ALLOWED_ORIGINS`. Nunca copie a chave privada para o frontend. No desenvolvimento, use `.env` local, que está ignorado pelo Git.
4. Publique **regras e índices** antes de liberar o portal: `firebase deploy --only firestore:rules,firestore:indexes --project devxis-91948`. Espere os índices ficarem prontos. Um push no GitHub não publica regras do Firebase.
5. O build executa `pnpm run build` e produz `public/`. A Vercel usa esse diretório e as duas rotas em `api/`. Os módulos `server/`, testes, ferramentas e credenciais não fazem parte da saída estática.
6. Confira o fluxo completo no domínio real com uma conta administrativa e uma conta de cliente verificadas. Os testes entregues usam somente o emulador; não confirmam configuração de credenciais, domínios, entrega de e-mails ou índices da sua produção.

O código mantém compatibilidade com o backend existente da Vercel, mas **Vercel Hobby tem restrição de uso pessoal não comercial**. Não se deve presumir que ele atende gratuitamente uma operação comercial. A alternativa sem assinatura adicionada ao projeto é executar `pnpm start` em infraestrutura própria com Node.js 22, HTTPS e as variáveis de ambiente. O servidor usa `HOST=127.0.0.1` por padrão para ficar atrás de um proxy; configure `PORT`, `HOST` e `NODE_ENV=production` conforme o ambiente. Não é necessário contratar um serviço de gestão de projetos.

## Vincular um cliente com segurança

1. O cliente usa **Entrar → Criar conta**. O modal pede nome, WhatsApp, e-mail, senha e confirmação; empresa e informações do projeto são opcionais. Os dados são persistidos em `client_profiles/<uid>` pela API autenticada. Não há envio automático de orçamento.
2. Depois do cadastro, a sessão é encerrada e o cliente volta ao login. O aviso orienta a verificar a caixa de entrada e a pasta de spam/lixo eletrônico para confirmar o e-mail.
3. Na aba **Clientes**, o administrador encontra **Cadastros recebidos → Vincular cadastro**. O cliente não precisa copiar ou visualizar um UID. O servidor consulta a conta no Authentication e exige e-mail verificado para vincular; ele não confia em um e-mail digitado no formulário público.
4. O administrador confere a identidade e vincula o UID ao orçamento na edição.
5. Elabora e envia a proposta. O cliente lê escopo, valor, entregas, condições e prazo no portal antes de responder.

O destinatário de um orçamento já vinculado não pode ser substituído. Uma proposta aceita não pode ser reescrita. Mudanças de prazo ou escopo contratado devem passar por solicitação de aprovação.

**Manter conectado** vem marcado no login do cliente e pode ser desmarcado. Usa a persistência nativa do Firebase Authentication; nenhuma senha é salva pelo aplicativo. Com sessão ativa, o cabeçalho mostra **Minha conta**, inclusive após recarregar ou abrir outra aba. Ao sair, volta a **Entrar**. Usuários ainda sem e-mail confirmado podem somente salvar/ler o próprio cadastro; o restante do portal continua exigindo confirmação.

## Estrutura persistente e permissões

| Caminho | Conteúdo |
| --- | --- |
| `users/<uid>` | Fonte existente de autorização administrativa |
| `projects` | Portfólio público existente, sem migração destrutiva |
| `quotes/<id>` | Pedido, rascunho de proposta, versão enviada e decisão |
| `quotes/<id>/versions` | Propostas enviadas imutáveis |
| `quotes/<id>/history`, `decisions` | Auditoria e respostas do orçamento |
| `clients/<uid>` | Cliente associado a uma conta verificada |
| `client_profiles/<uid>` | Dados de contato e interesse informados no cadastro, sem privilégios |
| `client_projects/<id>` | Projeto privado e termos vigentes |
| `client_projects/<id>/stages`, `tasks` | Etapas e tarefas |
| `client_projects/<id>/uml/<id>/versions` | Diagramas e versões separadas |
| `client_projects/<id>/approvals/<id>/versions`, `responses` | Solicitações e decisões |
| `client_projects/<id>/messages` | Conversas e comentários de tarefas |
| `client_projects/<id>/files/<id>/chunks` | Metadados e conteúdo privado dos anexos pequenos |
| `client_projects/<id>/contract_versions` | Alterações contratuais aprovadas |
| `notifications`, `activity_logs` | Notificações e auditoria protegidas |
| `settings/workspace` | Identidade e contato dos relatórios |

As regras bloqueiam leitura e escrita direta dos dados de gestão pelo navegador. O backend usa Admin SDK, valida o ID token com verificação de revogação, consulta `users/<uid>` e confere o proprietário do projeto em cada operação. Dados compartilhados são filtrados no servidor. As operações críticas usam transações e controle de revisão para impedir sobrescritas silenciosas.

O botão **Ver portal do cliente** abre uma prévia administrativa somente de leitura. O servidor limita essa prévia ao projeto escolhido e aplica o mesmo filtro do cliente. Enviar decisões ou mensagens pela prévia é proibido.

## Limites gratuitos e anexos

- Preserve o plano Spark no Firebase se o objetivo for não ter cobrança por excedentes. O aplicativo não muda planos nem configura faturamento. Em um projeto que já esteja no Blaze, o aplicativo não consegue impor um teto de cobrança do provedor.
- Anexos: PDF, PNG, JPEG, WebP e TXT, até **200 KB por arquivo**, **20 arquivos** e **2 MB por projeto**. Metadados e blocos de até 64 KB ficam separados e protegidos no Firestore; o conteúdo é obtido por API autenticada, sem URL pública. O limite não substitui a cota global do banco.
- Não há upload de arquivos grandes. Essa restrição é deliberada: o Cloud Storage for Firebase exige plano Blaze. Nenhum upload é anunciado como concluído sem persistência real.
- Projetos têm até 30 etapas e 120 tarefas para limitar o trabalho das transações de progresso/dependência. Consultas são paginadas, até 50 itens por página, sem novos listeners globais ou atualização contínua do painel.
- Relatórios carregam páginas sob demanda e têm limite de 1.000 registros por seção. Não omitem páginas silenciosamente ao exceder esse limite.
- Notificações são internas. Não há envio automático de propostas por e-mail, WhatsApp, serviço externo pago ou robô. A confirmação de cadastro/recuperação usa o próprio Firebase Authentication e suas cotas.
- Não há processo pago de TTL. Planeje a limpeza de `rate_limits` expirados manualmente, pelo servidor ou por ferramenta gratuita sob sua administração.

## UML e exportação

Mermaid é distribuído localmente pelo build, com versão fixa e renderização estrita. O servidor analisa a sintaxe antes de persistir. Diretivas de configuração, links ativos e HTML ativo são recusados. Não existe edição visual de elementos por arrastar: arrastar a prévia apenas movimenta a visualização.

Casos de uso, componentes, implantação e arquitetura podem ser representados por fluxogramas Mermaid; isso não equivale a implementar todos os elementos formais de um editor UML especializado. O DER usa coleções/documentos e referências lógicas: Firestore não possui joins ou chaves estrangeiras relacionais automáticas. Os modelos iniciais são pontos de partida editáveis, não dados reais do cliente.

SVG e PNG usam o diagrama renderizado localmente. PNG é limitado a 16 milhões de pixels e depende do suporte a canvas do navegador; para diagramas maiores use SVG. Para PDF, escolha **Salvar como PDF** na impressão do navegador.

## Desenvolvimento e testes

Com Node.js 22 e pnpm disponível:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run check
pnpm test
pnpm dev
```

Para testar sem produção, use Java 21 e o Firebase CLI:

```sh
firebase emulators:start --only auth,firestore --project demo-devxis
```

Em outro terminal PowerShell:

```powershell
$env:FIREBASE_PROJECT_ID='demo-devxis'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
pnpm run test:emulators
pnpm dev
```

Abra `http://127.0.0.1:3000/?emulator=1`. O modo emulado é permitido somente em localhost; o backend recusa usar emuladores em produção ou misturar um emulador com credenciais reais. Para voltar ao desenvolvimento com Firebase real, limpe `sessionStorage['devxis-emulator']` e retire `?emulator=1`.

`tests/emulator-flow.js` cria contas e dados **exclusivamente no projeto demo-devxis** e recusa rodar sem os dois emuladores. Os cenários cobrem envio público, edição, proposta, aceite concorrente, projeto, etapas, tarefas, UML, revisões, aprovação do cliente, progresso, arquivos, mensagens e segurança. `tests/workspace.test.js` cobre também falha de commit sem gravação parcial, permissões, duplicidade, limites, modelos UML e paginação.

`tests/browser-flow.js` usa Playwright, instalado separadamente como ferramenta de teste, um navegador compatível e a fixture criada pelo teste de emulador. `PLAYWRIGHT_MODULE_PATH` e `BROWSER_EXECUTABLE` permitem usar uma instalação existente; sem essas variáveis ele procura o pacote `playwright` e o Chromium padrão. O teste abre o modal, valida desktop/mobile, sintaxe inválida, versões, SVG, PNG, Kanban, relatório e portal somente leitura. As capturas e PDFs ficam em `work/browser/`, ignorado pelo Git.

## Arquivos da implementação

Frontend: `js/admin/workspace-admin.js`, `js/client/portal.js`, `js/workspace/{ui,project-console,uml-editor,reports}.js`, `js/services/workspace-service.js`, `shared/{workspace-domain,diagram-templates}.js`, `pages/portal.html` e `css/workspace.css`.

Backend: `api/workspace.js` e módulos em `server/` para autenticação compartilhada, clientes, comercial, projetos/tarefas, aprovações, arquivos, comunicação e análise Mermaid.

Integração: `index.html`, `js/admin-modal.js`, `api/quotes.js`, `api/_firebase-admin.js`, `firebase/firebase-config.js`, regras/índices, `firebase.json`, `vercel.json`, scripts de build/servidor e arquivos de dependências. A criação automática dos antigos projetos de demonstração ao entrar no painel foi desativada; dados existentes não são apagados.

Fontes de referência: [cotas Firestore](https://firebase.google.com/docs/firestore/quotas), [exigência de Blaze para Cloud Storage](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [restrições Vercel Hobby](https://vercel.com/docs/plans/hobby) e [API Mermaid](https://mermaid.js.org/config/usage).
