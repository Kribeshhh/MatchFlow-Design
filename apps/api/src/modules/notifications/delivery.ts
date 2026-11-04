import type { NotificationEvent } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import { db, transaction, type Tx } from "../../database/client.js";
import { rosterOf } from "../registrations/domain.js";
import { visibleTo } from "../tournaments/policy.js";
import { env } from "../../config/env.js";
import { mailDelivery, type MailDelivery } from "../auth/mail.js";
import { titles } from "./service.js";
import { z } from "zod";
export const EVENT_QUEUE = "tournament-events",
  MAIL_QUEUE = "tournament-email",
  DEAD_QUEUE = "notification-dead";
export function queueDatabase(tx: Tx) {
  return {
    executeSql: async (text: string, values: unknown[] = []) => ({
      rows: await tx.$queryRawUnsafe<unknown[]>(text, ...values),
    }),
  };
}
const metadata = z.object({
  status: z.string().optional(),
  roster: z.array(z.object({ id: z.string() })).optional(),
  teamId: z.string().optional(),
  teamIds: z.array(z.string().nullable()).optional(),
  reminder: z.string().optional(),
});
async function recipients(tx: Tx, event: NotificationEvent) {
  const data = metadata.parse(event.payload);
  const tournament = await tx.tournament.findUniqueOrThrow({
    where: { id: event.tournamentId },
    include: { permissions: true, organization: { include: { members: true } } },
  });
  const managers = [
    ...(tournament.organizationId ? [] : [tournament.organizerId]),
    ...tournament.permissions.filter((p) => p.canManage).map((p) => p.userId),
    ...(tournament.organization
      ? [
          tournament.organization.ownerId,
          ...tournament.organization.members
            .filter((m) => ["OWNER", "ADMIN", "MANAGER"].includes(m.role))
            .map((m) => m.userId),
        ]
      : []),
  ];
  let users: string[];
  if (event.kind === "REGISTRATION" || event.kind === "CHECK_IN") {
    users = data.roster?.map((p) => p.id) || [];
    if (data.teamId) {
      const team = await tx.team.findUnique({
        where: { id: data.teamId },
        include: { members: true },
      });
      if (team)
        users.push(team.captainId, ...team.members.filter((m) => m.manager).map((m) => m.userId));
    }
  } else {
    const entries = await tx.tournamentRegistration.findMany({
      where: {
        tournamentId: event.tournamentId,
        status: { in: ["APPROVED", "PENDING", "WAITLISTED"] },
        ...(data.teamIds?.filter(Boolean).length
          ? { teamId: { in: data.teamIds.filter((id): id is string => Boolean(id)) } }
          : {}),
      },
      include: { team: { include: { members: true } } },
    });
    users = entries.flatMap((e) => [
      ...rosterOf(e.roster).map((p) => p.id),
      e.team.captainId,
      ...e.team.members.filter((m) => m.manager).map((m) => m.userId),
    ]);
  }
  if (event.kind !== "CHECK_IN") users.push(...managers);
  return {
    ids: [...new Set(users)],
    detail:
      event.kind === "REGISTRATION"
        ? `Entry status: ${data.status || "updated"}.`
        : event.kind === "CHECK_IN"
          ? data.reminder === "closing"
            ? "Check-in closes soon. Check your entry and tournament deadline now."
            : "Check-in is open. Confirm your entry before tournament start."
          : "Open the tournament for the latest details.",
  };
}
export async function processEvent(eventId: string) {
  return transaction(async (tx) => {
    const event = await tx.notificationEvent.findUnique({ where: { id: eventId } });
    if (!event || event.processedAt) return;
    if (
      event.kind === "CHECK_IN" &&
      !(await tx.tournamentRegistration.findFirst({
        where: {
          id: event.resourceId,
          status: "APPROVED",
          checkedInAt: null,
          tournament: { phase: "CHECK_IN", startsAt: { gt: new Date() } },
        },
      }))
    ) {
      await tx.notificationEvent.update({
        where: { id: eventId },
        data: { processedAt: new Date() },
      });
      return;
    }
    const { ids, detail } = await recipients(tx, event);
    for (const id of ids) {
      const user = await tx.user.findUnique({
        where: { id },
        include: { notificationPreference: true },
      });
      if (!user || user.status !== "ACTIVE") continue;
      if (
        !(await tx.tournament.findFirst({
          where: { id: event.tournamentId, ...visibleTo(id) },
          select: { id: true },
        }))
      )
        continue;
      const p = user.notificationPreference;
      if (p?.mutedKinds.includes(event.kind) || (p?.inApp === false && p.email === false)) continue;
      await tx.notification.upsert({
        where: { eventId_userId: { eventId, userId: id } },
        update: {},
        create: {
          eventId,
          userId: id,
          tournamentId: event.tournamentId,
          kind: event.kind,
          resourceId: event.resourceId,
          detail,
          inApp: p?.inApp ?? true,
          emailState: p?.email === false ? "SKIPPED" : "PENDING",
        },
      });
    }
    await tx.notificationEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), failedAt: null },
    });
  });
}
export async function enqueuePending(boss: PgBoss, mailAvailable: boolean) {
  const events = await db.notificationEvent.findMany({
    where: { queuedAt: null, processedAt: null, failedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  for (const event of events)
    await transaction(async (tx) => {
      const changed = await tx.notificationEvent.updateMany({
        where: { id: event.id, queuedAt: null, processedAt: null },
        data: { queuedAt: new Date() },
      });
      if (changed.count)
        await boss.send(EVENT_QUEUE, { eventId: event.id }, { db: queueDatabase(tx) });
    });
  if (!mailAvailable) return;
  const messages = await db.notification.findMany({
    where: { emailState: "PENDING" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  for (const message of messages)
    await transaction(async (tx) => {
      const changed = await tx.notification.updateMany({
        where: { id: message.id, emailState: "PENDING" },
        data: { emailState: "QUEUED" },
      });
      if (changed.count)
        await boss.send(MAIL_QUEUE, { notificationId: message.id }, { db: queueDatabase(tx) });
    });
}
export async function deliverEmail(id: string, mail: MailDelivery = mailDelivery) {
  const n = await db.notification.findUnique({
    where: { id },
    include: {
      user: { include: { notificationPreference: true } },
      tournament: { select: { name: true } },
    },
  });
  if (!n || ["SENT", "SKIPPED"].includes(n.emailState)) return;
  const pref = n.user.notificationPreference;
  const reminderCurrent =
    n.kind !== "CHECK_IN" ||
    (await db.tournamentRegistration.findFirst({
      where: {
        id: n.resourceId,
        status: "APPROVED",
        checkedInAt: null,
        tournament: { phase: "CHECK_IN", startsAt: { gt: new Date() } },
      },
    }));
  const allowed =
    reminderCurrent &&
    n.user.status === "ACTIVE" &&
    n.user.emailVerifiedAt &&
    pref?.email !== false &&
    !pref?.mutedKinds.includes(n.kind) &&
    n.createdAt > new Date(Date.now() - 7 * 86400000) &&
    (await db.tournament.findFirst({
      where: { id: n.tournamentId, ...visibleTo(n.userId) },
      select: { id: true },
    }));
  if (!allowed) {
    await db.notification.update({ where: { id }, data: { emailState: "SKIPPED" } });
    return;
  }
  if (!mail.available) throw Error("Notification email unavailable");
  await db.notification.update({ where: { id }, data: { emailState: "SENDING" } });
  await mail.send({
    to: n.user.email,
    subject: `MatchFlow · ${titles[n.kind]}`,
    text: `${titles[n.kind]} — ${n.tournament.name}\n\n${n.detail}\n\n${env.APP_ORIGIN}/tournaments/${n.tournamentId}\n\nManage notification preferences: ${env.APP_ORIGIN}/notifications`,
    messageId: `<matchflow-${n.id}@${new URL(env.APP_ORIGIN).hostname}>`,
  });
  await db.notification.update({
    where: { id },
    data: { emailState: "SENT", emailSentAt: new Date() },
  });
}
export async function scheduleReminders(now = new Date()) {
  let cursor: string | undefined;
  for (;;) {
    const events = await db.tournament.findMany({
      where: {
        checkInRequired: true,
        phase: "CHECK_IN",
        closesAt: { lte: now },
        startsAt: { gt: now },
      },
      include: { registrations: { where: { status: "APPROVED", checkedInAt: null } } },
      take: 100,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const event of events)
      for (const entry of event.registrations) {
        const moments = [
          "opening",
          ...(event.startsAt.getTime() - now.getTime() <= 30 * 60000 &&
          event.startsAt.getTime() - event.closesAt.getTime() > 30 * 60000
            ? ["closing"]
            : []),
        ];
        for (const reminder of moments) {
          const dedupeKey = `reminder:${event.id}:${event.startsAt.toISOString()}:${entry.id}:${reminder}`;
          await db.notificationEvent.createMany({
            skipDuplicates: true,
            data: [
              {
                dedupeKey,
                tournamentId: event.id,
                kind: "CHECK_IN",
                resourceId: entry.id,
                payload: {
                  teamId: entry.teamId,
                  roster: rosterOf(entry.roster).map((p) => ({ id: p.id })),
                  reminder,
                },
              },
            ],
          });
        }
      }
    if (events.length < 100) break;
    cursor = events.at(-1)!.id;
  }
}
