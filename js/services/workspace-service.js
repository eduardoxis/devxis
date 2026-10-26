import { auth } from "../../firebase/firebase-config.js";
let previewScope = "";
export function setPreviewScope(projectId) {
  previewScope = projectId;
}
export async function api(
  resource,
  action = "list",
  data = {},
  method = "GET",
) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Entre na sua conta.");
  const token = await user.getIdToken();
  const params = new URLSearchParams({ resource, action });
  if (previewScope) params.set("previewProjectId", previewScope);
  if (method === "GET")
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.set(key, String(value));
    });
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`/api/workspace?${params}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        "O servidor não respondeu em JSON. Use o ambiente local da Vercel ou publique a API.",
      );
    }
    if (!response.ok)
      throw new Error(result.error || "Não foi possível concluir.");
    return result;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(
        "O servidor demorou a responder. Atualize os dados antes de tentar novamente.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export const write = (resource, action, data) =>
  api(resource, action, data, "POST");
export async function allPages(resource, params = {}) {
  const items = [];
  let cursor;
  do {
    const result = await api(resource, "list", {
      ...params,
      limit: 50,
      cursor,
    });
    items.push(...result.items);
    cursor = result.nextCursor;
    if (items.length > 1000)
      throw new Error(
        "Relatório excede 1.000 registros; reduza o volume antes de exportar.",
      );
  } while (cursor);
  return items;
}
