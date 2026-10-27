import { check } from "../shared/workspace-domain.js";
import { indexedCount, boundedRows } from "./query-fallback.js";

export async function clientDashboard(ctx) {
  check(!ctx.admin, "Esta visão usa exclusivamente a conta do cliente.", 403);
  const db = ctx.db,
    projects = db
      .collection("client_projects")
      .where("clientUid", "==", ctx.uid);
  const count = indexedCount;
  let ownedPromise;
  const owned = () => (ownedPromise ||= boundedRows(projects));
  const activeStatuses = [
    "Aguardando início",
    "Em planejamento",
    "Em desenvolvimento",
    "Aguardando cliente",
    "Em revisão",
  ];
  const [activeProjects, quotes, pendingApprovals, unreadNotifications] =
    await Promise.all([
      count(
        projects.where("status", "in", [
          "Aguardando início",
          "Em planejamento",
          "Em desenvolvimento",
          "Aguardando cliente",
          "Em revisão",
        ]),
        async () =>
          (await owned()).filter((project) =>
            activeStatuses.includes(project.status),
          ).length,
      ),
      count(
        db.collection("quotes").where("clientUid", "==", ctx.uid),
        async () =>
          (
            await boundedRows(
              db.collection("quotes").where("clientUid", "==", ctx.uid),
            )
          ).length,
      ),
      count(
        db
          .collectionGroup("approvals")
          .where("clientUid", "==", ctx.uid)
          .where("status", "==", "pendente"),
        async () => {
          let total = 0;
          for (const project of await owned()) {
            const approvals = await boundedRows(
              db
                .collection("client_projects")
                .doc(project.id)
                .collection("approvals"),
            );
            total += approvals.filter(
              (item) =>
                item.clientUid === ctx.uid && item.status === "pendente",
            ).length;
          }
          return total;
        },
      ),
      count(
        db
          .collection("notifications")
          .where("recipient", "==", ctx.uid)
          .where("readAt", "==", null),
        async () =>
          (
            await boundedRows(
              db.collection("notifications").where("recipient", "==", ctx.uid),
            )
          ).filter((item) => item.readAt === null).length,
      ),
    ]);
  // A consulta parte dos projetos autorizados, incluindo mensagens antigas que
  // não têm um destinatário desnormalizado. Não varre conversas de terceiros.
  let cursor,
    unreadMessages = 0,
    scanned = 0;
  do {
    let query = projects.orderBy("__name__").limit(50);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    scanned += snapshot.size;
    check(
      scanned <= 1000,
      "O resumo excede 1.000 projetos. Consulte os projetos individualmente.",
      422,
    );
    for (let offset = 0; offset < snapshot.docs.length; offset += 10) {
      const totals = await Promise.all(
        snapshot.docs
          .slice(offset, offset + 10)
          .map((project) =>
            count(
              db
                .collection("client_projects")
                .doc(project.id)
                .collection("messages")
                .where("visible", "==", true)
                .where("authorRole", "==", "Administrador")
                .where("readAt", "==", null),
              async () =>
                (
                  await boundedRows(
                    db
                      .collection("client_projects")
                      .doc(project.id)
                      .collection("messages")
                      .where("visible", "==", true),
                  )
                ).filter(
                  (item) =>
                    item.authorRole === "Administrador" && item.readAt === null,
                ).length,
            ),
          ),
      );
      unreadMessages += totals.reduce((sum, value) => sum + value, 0);
    }
    cursor = snapshot.size === 50 ? snapshot.docs.at(-1).id : null;
  } while (cursor);
  return {
    activeProjects,
    quotes,
    pendingApprovals,
    unreadMessages,
    unreadNotifications,
    updatedAt: new Date().toISOString(),
  };
}
