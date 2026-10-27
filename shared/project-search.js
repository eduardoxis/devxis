const normalized = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function matchesProject(project, search) {
  const text = normalized(
    [project.name, project.clientName, project.scope, project.service].join(
      " ",
    ),
  );
  return normalized(search)
    .trim()
    .split(/\s+/)
    .every((term) => text.includes(term));
}
