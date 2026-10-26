export const QUOTE_STATUSES = [
  "novo",
  "em análise",
  "em elaboração",
  "proposta enviada",
  "aguardando aprovação",
  "alterações solicitadas",
  "aprovado",
  "recusado",
  "cancelado",
];
export const PROJECT_STATUSES = [
  "Aguardando início",
  "Em planejamento",
  "Em desenvolvimento",
  "Aguardando cliente",
  "Em revisão",
  "Concluído",
  "Cancelado",
];
export const TASK_STATUSES = [
  "Não iniciada",
  "Em andamento",
  "Bloqueada",
  "Aguardando cliente",
  "Em revisão",
  "Concluída",
  "Cancelada",
];
export const UML_TYPES = [
  "Casos de uso",
  "Diagrama de classes",
  "Diagrama de atividades",
  "Diagrama de sequência",
  "Diagrama de estados",
  "Diagrama de componentes",
  "Diagrama de implantação",
  "Banco de dados (DER)",
  "Arquitetura geral",
];
export function todayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function check(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export function str(value, max = 5000, required = false) {
  check(typeof value === "string", "Texto inválido.");
  const text = value.trim();
  check(
    text.length <= max && (!required || text.length > 0),
    `Preencha o texto (máximo ${max} caracteres).`,
  );
  check(
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text),
    "Texto contém caracteres inválidos.",
  );
  return text;
}
export function id(value) {
  check(
    typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value),
    "Identificador inválido.",
  );
  return value;
}
export function number(value, min = 0, max = 100000000) {
  check(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max,
    "Número fora do limite.",
  );
  return value;
}
export function choice(value, values) {
  check(values.includes(value), "Selecione uma opção válida.");
  return value;
}
export function integer(value, min = 0, max = 100000000) {
  number(value, min, max);
  check(Number.isInteger(value), "Use um número inteiro.");
  return value;
}
export function date(value) {
  if (value === "") return "";
  check(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Data inválida.",
  );
  return value;
}
export function bool(value) {
  check(typeof value === "boolean", "Opção inválida.");
  return value;
}
export function fields(data, schema) {
  check(
    data && typeof data === "object" && !Array.isArray(data),
    "Dados inválidos.",
  );
  check(
    Object.keys(data).every((key) => Object.hasOwn(schema, key)),
    "Campo não permitido.",
  );
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, schema[key](value)]),
  );
}
export const textList = (value, max = 12) => {
  check(Array.isArray(value) && value.length <= max, "Lista muito grande.");
  return [...new Set(value.map(id))];
};
export function progress(stages, tasks) {
  const active = tasks.filter((t) => t.status !== "Cancelada");
  let total = 0,
    done = 0;
  for (const task of active) {
    const stage = stages.find((s) => s.id === task.stageId);
    const weight = (stage?.weight ?? 1) * (task.weight ?? 1);
    total += weight;
    if (task.status === "Concluída") done += weight;
  }
  return total ? Math.round((done / total) * 100) : 0;
}
export function quoteForClient(q) {
  return Object.fromEntries(
    [
      "id",
      "revision",
      "clientUid",
      "nome",
      "empresa",
      "tipoSistema",
      "descricao",
      "status",
      "createdAt",
      "criadoEm",
      "updatedAt",
      "sentProposal",
      "proposalVersion",
      "projectId",
      "archived",
    ]
      .filter((key) => q[key] !== undefined)
      .map((key) => [key, q[key]]),
  );
}
export function projectForClient(p) {
  const { internalNotes, ...visible } = p;
  return visible;
}
export function validateDiagram(source) {
  source = str(source, 24000, true);
  check(
    !/%%\s*\{|^\s*---|\bclick\s|<\s*(?:script|iframe|object|img|a)\b|javascript:|https?:\/\//im.test(
      source,
    ),
    "Use apenas definição Mermaid, sem diretivas, links ou HTML ativo.",
  );
  return source;
}
export function taskBlocked(task, tasks, approvals) {
  return (
    Boolean(task.manualBlocked) ||
    (task.dependencies || []).some(
      (dependency) =>
        !tasks.some((t) => t.id === dependency && t.status === "Concluída"),
    ) ||
    approvals.some(
      (a) =>
        a.taskId === task.id &&
        a.status !== "aprovado" &&
        a.status !== "cancelado",
    )
  );
}
