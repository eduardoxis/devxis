# Portal do cliente — redesign

O novo visual segue a referência fornecida, mantendo a autenticação Firebase, as abas do portal e a central de cada projeto.

O site público usa o cabeçalho completo e reto da imagem 1. Dentro do portal do cliente e do modal administrativo, o mesmo menu aparece numa barra branca arredondada, como na imagem 2. Somente os painéis têm **Sair do painel**, com ícone de casa vermelho; **Sair da conta** tem ícone de saída vermelho. O sino do site e do administrador abre as notificações reais da conta.

## Funcionalidades

- Cabeçalho com os links do site, notificação, Minha conta e dois tipos de saída.
- **Sair do painel** retorna ao site e mantém a sessão.
- **Sair da conta** usa Firebase `signOut`, limpa a interface protegida e redireciona ao modal de login do site. Uma visita posterior ao portal exige autenticação novamente.
- Saudação com o nome do cadastro; contas antigas usam o nome do Authentication ou o identificador do próprio e-mail. O UID não é exibido.
- Data, dia da semana e relógio calculados no fuso `America/Sao_Paulo`, com atualização local do horário a cada 30 segundos, sem consultas ao banco.
- Abas com ícones SVG locais e seleção azul, preservando as áreas e ações anteriores.
- Quatro indicadores consultados pela API: projetos ativos, total de orçamentos vinculados, aprovações pendentes e mensagens compartilhadas do administrador ainda não lidas. O sino mostra quando há notificações não lidas.
- Busca por nome de projeto, cliente, serviço e escopo, com normalização de acentos e paginação. Observações internas não são pesquisadas.
- Atualizar consulta novamente os projetos e indicadores. Voltar à visão geral ou navegar entre as seções também atualiza o resumo.
- Estado vazio sem projetos e sem botão de paginação. **Carregar mais** só aparece quando a API confirma outra página de resultados.
- Cards de projetos reais com escopo, prazo e progresso calculado pela gestão existente.
- Minha conta permite consultar e editar os dados de contato já utilizados no cadastro.

## Configuração necessária

As credenciais e a autenticação são as mesmas do backend existente. Não há novo serviço pago, biblioteca externa de ícones nem recurso de faturamento.

Os novos indicadores usam os índices adicionados a `firebase/firestore.indexes.json`. **O push do código não publica índices no Firebase.** Com o Firebase CLI autenticado no projeto, publique:

```sh
firebase deploy --only firestore:indexes --project devxis-91948
```

Os índices continuam recomendados para consultas eficientes. Enquanto estiverem ausentes ou em construção, o resumo e a lista de notificações usam consultas alternativas restritas à própria conta. Os resultados são calculados a partir dos registros reais, mantendo a mesma ordenação e o mesmo cursor de paginação das notificações. A alternativa lê até 1.000 registros por consulta; acima disso, pede a publicação dos índices, sem devolver resultados parciais. Falhas de permissão, conexão e cota não são ocultadas por essa alternativa. As regras e a validação do vínculo do cliente continuam no servidor.

As consultas do resumo partem dos projetos da conta. Para compatibilidade com mensagens existentes, a contagem de não lidas usa agregações nas conversas de cada projeto, em lotes de dez. Não há listener global ou consulta de conversas de outros clientes. O resumo e a busca têm limite explícito de 1.000 projetos por consulta; ao exceder, a API informa a limitação em vez de fornecer totais parciais. A busca usa páginas de até 50 documentos no servidor e o portal apresenta 12 resultados por página.

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `pages/portal.html` | Cabeçalho e estrutura do portal |
| `css/client-portal.css` | Visual e adaptação desktop, tablet e mobile |
| `css/site-header.css` | Variantes pública e interna do cabeçalho |
| `js/utils/header-controls.js`, `js/utils/site-icons.js`, `js/utils/header-notifications.js` | Sessão, ícones e notificações do cabeçalho compartilhado |
| `js/client/portal.js` | Autenticação, saídas, navegação, busca e atualização |
| `js/client/portal-dashboard.js` | Saudação, data, indicadores, cards e estado vazio |
| `js/client/portal-icons.js` | Ícones SVG locais |
| `server/client-dashboard.js` | Contagens reais e isoladas por cliente |
| `server/projects.js`, `shared/project-search.js` | Busca paginada de projetos autorizados |
| `api/workspace.js` | Rotas autenticadas do resumo e da busca |
| `firebase/firestore.indexes.json` | Índices das consultas |
| `js/admin-modal.js` | Retorno ao login do cliente depois de sair da conta |
| `js/workspace/ui.js` | Paginação inicialmente oculta durante carregamento |

## Validação

`tests/workspace.test.js` cobre indicadores, leitura de mensagens, isolamento entre contas, busca por acentos, paginação e exclusão de campos privados da busca.

`tests/portal-redesign-browser.js` roda **exclusivamente com Auth e Firestore emulados**, usando o projeto `demo-devxis`. Ele cria contas de teste isoladas para conferir estados vazio e com projetos, quatro indicadores, links de navegação, busca, paginação, atualização, comportamento diferente dos dois botões de saída, proteção depois do logout e larguras de 1820, 1280, 768, 390 e 320 pixels.

Os registros de teste e as capturas permanecem no ambiente emulado ou em `work/`, ignorado pelo Git. Nenhum dado de produção é usado como fixture ou substituído.
