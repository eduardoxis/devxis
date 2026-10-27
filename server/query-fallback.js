import { check, id } from "../shared/workspace-domain.js";
import { row } from "./core.js";

// Only missing/building indexes qualify: permissions, outages and quota errors
// must still reach the normal error handler.
export function missingIndex(error) {
  return (
    [9, "failed-precondition", "FAILED_PRECONDITION"].includes(error.code) &&
    /index/i.test(error.message || "")
  );
}
export async function boundedRows(query) {
  const snapshot = await query.limit(1001).get();
  check(
    snapshot.docs.length <= 1000,
    "Esta consulta precisa dos índices do Firebase para mais de 1.000 registros. Publique os índices do projeto.",
    422,
  );
  return snapshot.docs.map(row);
}
export async function indexedCount(query, fallback) {
  try {
    return (await query.count().get()).data().count;
  } catch (error) {
    if (!missingIndex(error)) throw error;
    return fallback();
  }
}
export function notificationPage(items, params = {}) {
  const size = Math.floor(
    Math.min(Math.max(Number(params.limit) || 20, 1), 50),
  );
  let cursor;
  if (params.cursor) {
    id(params.cursor);
    try {
      cursor = JSON.parse(Buffer.from(params.cursor, "base64url").toString());
    } catch {
      check(false, "Página inválida.");
    }
    check(
      Array.isArray(cursor) &&
        cursor.length === 2 &&
        typeof cursor[0] === "string",
      "Página inválida.",
    );
    id(cursor[1]);
  }
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const sorted = items
    .filter((item) => typeof item.createdAt === "string")
    .sort((a, b) => compare(b.createdAt, a.createdAt) || compare(b.id, a.id))
    .filter(
      (item) =>
        !cursor ||
        compare(item.createdAt, cursor[0]) < 0 ||
        (item.createdAt === cursor[0] && compare(item.id, cursor[1]) < 0),
    );
  const result = sorted.slice(0, size),
    last = result.at(-1);
  return {
    items: result,
    nextCursor:
      sorted.length > size
        ? Buffer.from(JSON.stringify([last.createdAt, last.id])).toString(
            "base64url",
          )
        : null,
  };
}
