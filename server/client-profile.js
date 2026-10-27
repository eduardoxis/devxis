import { fields, str, choice, check, id } from "../shared/workspace-domain.js";
import {
  REGISTRATION_SERVICES,
  REGISTRATION_BUDGETS,
} from "../shared/registration-fields.js";
import { page, requireAdmin, updated, stamp, audit } from "./core.js";

export async function clientProfile(ctx, action, body, params) {
  const collection = ctx.db.collection("client_profiles");
  if (action === "list") {
    requireAdmin(ctx);
    return page(collection, params);
  }
  const uid = params.uid ? (requireAdmin(ctx), id(params.uid)) : ctx.uid;
  if (action === "get") {
    const snapshot = await collection.doc(uid).get();
    return snapshot.exists ? { id: uid, ...snapshot.data() } : null;
  }
  check(action === "save", "Ação inválida.");
  const data = fields(body.data, {
    name: (value) => str(value, 100, true),
    phone: (value) => {
      const phone = str(value, 25, true);
      check(
        /^[+()\s0-9-]{8,25}$/.test(phone) &&
          phone.replace(/\D/g, "").length >= 8,
        "Confira o WhatsApp informado.",
      );
      return phone;
    },
    company: (value) => str(value, 120),
    service: (value) => choice(value, ["", ...REGISTRATION_SERVICES]),
    budget: (value) => choice(value, ["", ...REGISTRATION_BUDGETS]),
    description: (value) => str(value, 3000),
  });
  check(data.name && data.phone, "Informe o nome e o WhatsApp.");
  const ref = collection.doc(ctx.uid);
  return ctx.db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref),
      previous = snapshot.exists ? snapshot.data() : null;
    const profile = {
      company: "",
      service: "",
      budget: "",
      description: "",
      ...previous,
      ...data,
      uid: ctx.uid,
      email: ctx.email,
      createdAt: previous?.createdAt || stamp(),
      ...updated(ctx, previous),
    };
    tx.set(ref, profile);
    audit(ctx, tx, {
      action: previous
        ? "Cadastro do cliente atualizado"
        : "Novo cadastro de cliente",
      details: ctx.uid,
    });
    return { id: ctx.uid, ...profile };
  });
}
