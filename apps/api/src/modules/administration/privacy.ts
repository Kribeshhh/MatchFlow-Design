import { db, transaction } from "../../database/client.js";
import { selfUser } from "../auth/repository.js";
import { env } from "../../config/env.js";
import { audit } from "./audit.js";
import { throttle } from "../auth/throttle.js";
export async function accountExport(actor: string, page: number) {
  await throttle("account-export", actor, 30, 3600000);
  const args = { skip: (page - 1) * 100, take: 101, orderBy: { id: "asc" as const } };
  const [user, memberships, registrations, cases] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actor }, select: selfUser }),
    db.teamMember.findMany({
      where: { userId: actor },
      select: { teamId: true, joinedAt: true, manager: true, substitute: true },
      orderBy: { teamId: "asc" },
      skip: args.skip,
      take: 101,
    }),
    db.tournamentRegistration.findMany({
      ...args,
      where: { roster: { array_contains: [{ id: actor }] } },
      select: {
        id: true,
        tournamentId: true,
        teamId: true,
        status: true,
        createdAt: true,
        checkedInAt: true,
      },
    }),
    db.moderationCase.findMany({
      ...args,
      where: { reporterId: actor },
      select: {
        id: true,
        category: true,
        description: true,
        status: true,
        resolution: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
  ]);
  await audit(db, actor, "privacy.account.exported", "User", actor);
  return {
    generatedAt: new Date().toISOString(),
    page,
    nextPage: [memberships, registrations, cases].some((rows) => rows.length > 100)
      ? page + 1
      : null,
    user,
    memberships: memberships.slice(0, 100),
    registrations: registrations.slice(0, 100),
    submittedCases: cases.slice(0, 100),
    scope:
      "Account profile, own team memberships, participation identifiers and submitted reports. Other users and confidential moderation evidence are excluded.",
  };
}
export async function cleanupRetention(apply = false, now = new Date()) {
  const cutoff = (days: number) => new Date(now.getTime() - days * 86400000);
  return transaction(async (tx) => {
    const held = await tx.retentionHold.findMany();
    const caseWhere = {
      legalHold: false,
      status: { in: ["RESOLVED", "DISMISSED"] },
      OR: [
        { category: "SUPPORT", resolvedAt: { lt: cutoff(env.SUPPORT_RETENTION_DAYS) } },
        { category: { not: "SUPPORT" }, resolvedAt: { lt: cutoff(env.MODERATION_RETENTION_DAYS) } },
      ],
    };
    const heldCases = await tx.moderationCase.findMany({
      where: { legalHold: true },
      select: { id: true },
    });
    const auditWhere = {
      NOT: { resourceType: "ModerationCase", resourceId: { in: heldCases.map((c) => c.id) } },
      createdAt: { lt: cutoff(env.AUDIT_RETENTION_DAYS) },
      id: { notIn: held.filter((h) => h.resourceType === "AuditEvent").map((h) => h.resourceId) },
    };
    const apiWhere = {
      createdAt: { lt: cutoff(env.AUDIT_RETENTION_DAYS) },
      id: { notIn: held.filter((h) => h.resourceType === "ApiRequest").map((h) => h.resourceId) },
    };
    const counts = {
      cases: await tx.moderationCase.count({ where: caseWhere }),
      auditEvents: await tx.auditEvent.count({ where: auditWhere }),
      apiRequests: await tx.apiRequest.count({ where: apiWhere }),
    };
    if (apply) {
      await tx.moderationCase.deleteMany({ where: caseWhere });
      await tx.auditEvent.deleteMany({ where: auditWhere });
      await tx.apiRequest.deleteMany({ where: apiWhere });
      await audit(tx, null, "retention.cleanup.completed", "Platform", "retention");
    }
    return {
      dryRun: !apply,
      cutoffs: {
        support: cutoff(env.SUPPORT_RETENTION_DAYS),
        moderation: cutoff(env.MODERATION_RETENTION_DAYS),
        audit: cutoff(env.AUDIT_RETENTION_DAYS),
      },
      ...counts,
    };
  });
}
