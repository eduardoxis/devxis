export const diagramTemplates = {
  "Casos de uso":
    "flowchart LR\n  Ator[Ator] --> Consulta([Consultar informações])\n  Ator --> Solicita([Enviar solicitação])",
  "Diagrama de classes":
    'classDiagram\n  class Entidade {\n    +String id\n    +salvar()\n  }\n  class Registro {\n    +String entidadeId\n  }\n  Entidade "1" --> "0..*" Registro : referencia',
  "Diagrama de atividades":
    "flowchart TD\n  Inicio([Início]) --> Analise[Analisar solicitação]\n  Analise --> Decisao{Aprovada?}\n  Decisao -->|Sim| Execucao[Executar]\n  Decisao -->|Não| Revisao[Revisar]\n  Revisao --> Analise\n  Execucao --> Fim([Fim])",
  "Diagrama de sequência":
    "sequenceDiagram\n  actor Usuario\n  participant Interface\n  participant API\n  participant Firestore\n  Usuario->>Interface: Confirmar ação\n  Interface->>API: Requisição autenticada\n  API->>API: Validar identidade e permissão\n  API->>Firestore: Gravar em transação\n  Firestore-->>API: Confirmação\n  API-->>Interface: Resultado",
  "Diagrama de estados":
    "stateDiagram-v2\n  [*] --> Novo\n  Novo --> EmAnalise\n  EmAnalise --> AguardandoAprovacao\n  AguardandoAprovacao --> Aprovado\n  AguardandoAprovacao --> Revisao\n  Revisao --> EmAnalise\n  Aprovado --> [*]",
  "Diagrama de componentes":
    "flowchart LR\n  Frontend --> API\n  API --> Autenticacao[Autenticação]\n  API --> Banco[Firestore]",
  "Diagrama de implantação":
    "flowchart LR\n  subgraph Navegador\n    Site[Site estático]\n  end\n  subgraph Vercel\n    API[API Serverless]\n  end\n  subgraph Firebase\n    Auth[Authentication]\n    DB[(Firestore)]\n  end\n  Site --> API\n  Site --> Auth\n  API --> Auth\n  API --> DB",
  "Banco de dados (DER)":
    'classDiagram\n  class ColecaoPrincipal {\n    documentoId string\n    titulo string\n  }\n  class Subcolecao {\n    documentoId string\n    referenciaPrincipal string\n  }\n  ColecaoPrincipal "1" --> "0..*" Subcolecao : referencia de documento',
  "Arquitetura geral":
    "flowchart TD\n  Usuario[Usuário] --> Web[Frontend]\n  Web --> Auth[Firebase Authentication]\n  Web --> API[API autenticada]\n  API --> DB[(Cloud Firestore)]",
};
