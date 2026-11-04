import { db, requireCondition, transaction } from "../../database/client.js";
import { visibleTo } from "../tournaments/policy.js";
import type { NotificationPreferences } from "../../../../../packages/shared/src/notifications.js";
import { mailDelivery } from "../auth/mail.js";
export const titles: Record<string, string> = {
  REGISTRATION: "Registration updated",
  SCHEDULE: "Match schedule updated",
  RESULT: "Result confirmed",
  ANNOUNCEMENT: "Tournament announcement",
  CHECK_IN: "Check-in reminder",
  LIFECYCLE: "Tournament status updated",
};
export const visibleNotifications = (userId: string) => ({
  userId,
  inApp: true,
  tournament: visibleTo(userId),
});
export async function listNotifications(userId: string, cursor?: string) {
  if (cursor)
    requireCondition(
      await db.notification.findFirst({ where: { id: cursor, ...visibleNotifications(userId) } }),
      "Notification not found.",
      404,
    );
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: visibleNotifications(userId),
      include: { tournament: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    db.notification.count({ where: { ...visibleNotifications(userId), readAt: null } }),
  ]);
  return {
    items: items.slice(0, 30).map((n) => ({
      id: n.id,
      tournamentId: n.tournamentId,
      tournamentName: n.tournament.name,
      kind: n.kind,
      title: titles[n.kind],
      detail: n.detail,
      createdAt: n.createdAt,
      readAt: n.readAt,
    })),
    unread,
    nextCursor: items.length > 30 ? items[29].id : null,
    emailAvailable: mailDelivery.available,
  };
}
export async function markRead(userId: string, id?: string) {
  return transaction(async (tx) => {
    if (id)
      requireCondition(
        await tx.notification.findFirst({ where: { id, ...visibleNotifications(userId) } }),
        "Notification not found.",
        404,
      );
    await tx.notification.updateMany({
      where: { ...visibleNotifications(userId), readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });
}
export async function preferences(userId: string) {
  const p = await db.notificationPreference.findUnique({ where: { userId } });
  return { inApp: p?.inApp ?? true, email: p?.email ?? true, mutedKinds: p?.mutedKinds ?? [] };
}
export async function savePreferences(userId: string, input: NotificationPreferences) {
  await db.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...input, revision: 1 },
    update: { ...input, revision: { increment: 1 } },
  });
  return input;
}
