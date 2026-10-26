import { fields, str, id, check } from "../shared/workspace-domain.js";
import {
  requireAdmin,
  page,
  mustGet,
  audit,
  updated,
  expectRevision,
} from "./core.js";
export async function clients(ctx, action, body, params) {
  requireAdmin(ctx);
  if (action === "list") return page(ctx.db.collection("clients"), params);
  check(action === "save", "Ação inválida.");
  const uid = id(body.id);
  const record = await ctx.auth.getUser(uid);
  check(
    !record.disabled && record.emailVerified,
    "O cliente deve criar a conta e confirmar o e-mail antes de ser vinculado.",
  );
  const data = fields(body.data, {
    name: (v) => str(v, 100, true),
    company: (v) => str(v, 120),
    phone: (v) => str(v, 25),
    notes: (v) => str(v, 3000),
  });
  check(data.name, "Informe o nome do cliente.");
  const ref = ctx.db.collection("clients").doc(uid);
  return ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const previous = snap.exists ? snap.data() : null;
    if (previous) expectRevision(body, previous);
    const value = {
      ...data,
      email: record.email,
      uid,
      ...updated(ctx, previous),
      ...(previous ? {} : { createdAt: new Date().toISOString() }),
    };
    tx.set(ref, value, { merge: true });
    audit(ctx, tx, {
      action: previous ? "Cliente atualizado" : "Cliente vinculado",
      details: uid,
    });
    return { id: uid, ...previous, ...value };
  });
}
