import { db, transaction, requireCondition } from "../../database/client.js";
import { staffAccess } from "./staff-auth.js";
import { audit } from "./audit.js";
export async function overview() {
  const since = new Date(Date.now() - 86400000);
  const [
    users,
    organizations,
    tournaments,
    openCases,
    openDisputes,
    requests,
    failures,
    queue,
    domains,
  ] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE" } }),
    db.organization.count(),
    db.tournament.count(),
    db.moderationCase.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }),
    db.matchDispute.count({ where: { status: "OPEN" } }),
    db.apiRequest.count({ where: { createdAt: { gte: since } } }),
    db.apiRequest.count({ where: { createdAt: { gte: since }, status: { gte: 400 } } }),
    db.notification.count({ where: { emailState: { in: ["DEAD", "RETRY"] } } }),
    db.customDomain.groupBy({ by: ["status"], _count: true }),
  ]);
  return {
    users,
    organizations,
    tournaments,
    openCases,
    openDisputes,
    apiRequests24h: requests,
    apiFailures24h: failures,
    failedEmails: queue,
    domains,
    database: "reachable",
    checkedAt: new Date().toISOString(),
    externalMonitoring: "Not configured by this application",
  };
}
export async function transferOrganization(
  actor: string,
  session: string,
  id: string,
  newOwnerId: string,
  reason: string,
) {
  return transaction(async (tx) => {
    await staffAccess(tx, actor, session, true, true);
    const org = await tx.organization.findUnique({
      where: { id },
      include: { members: { where: { userId: newOwnerId } } },
    });
    const next = await tx.user.findUnique({ where: { id: newOwnerId } });
    requireCondition(
      org &&
        next?.status === "ACTIVE" &&
        next.emailVerifiedAt &&
        org.members.length &&
        org.ownerId !== newOwnerId,
      "Choose a different verified existing member.",
    );
    const previous = org.ownerId;
    await tx.organization.update({
      where: { id },
      data: { ownerId: newOwnerId, version: { increment: 1 } },
    });
    await tx.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: id, userId: previous } },
      create: { organizationId: id, userId: previous, role: "MEMBER" },
      update: { role: "MEMBER" },
    });
    await tx.organizationMember.update({
      where: { organizationId_userId: { organizationId: id, userId: newOwnerId } },
      data: { role: "OWNER" },
    });
    await tx.tournamentPermission.deleteMany({
      where: { userId: previous, tournament: { organizationId: id } },
    });
    await tx.organizationInvitation.updateMany({
      where: { organizationId: id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await tx.apiCredential.updateMany({
      where: { integration: { organizationId: id }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const c = await tx.moderationCase.create({
      data: {
        reporterId: actor,
        organizationId: id,
        category: "OTHER",
        description: "Administrator ownership review",
        status: "RESOLVED",
        resolution: "Ownership transferred after administrator review.",
        resolvedAt: new Date(),
      },
    });
    await tx.moderationAction.create({
      data: {
        caseId: c.id,
        actorId: actor,
        action: "OWNERSHIP_TRANSFER",
        reason,
        evidence: { previousOwnerId: previous, newOwnerId },
      },
    });
    await audit(tx, actor, "organization.ownership.changed", "Organization", id);
    await audit(tx, actor, "api.credentials.revoked_on_transfer", "Organization", id);
    const domains = await tx.customDomain.findMany({
      where: { organizationId: id, removedAt: null },
      select: { id: true },
    });
    for (const d of domains)
      await audit(tx, actor, "domain.organization_owner.changed", "CustomDomain", d.id);
    return { ok: true };
  });
}
export async function setHold(
  actor: string,
  session: string,
  type: string,
  id: string,
  hold: boolean,
) {
  return transaction(async (tx) => {
    await staffAccess(tx, actor, session, true, true);
    if (type === "ModerationCase") {
      requireCondition(
        await tx.moderationCase.findUnique({ where: { id } }),
        "Case not found.",
        404,
      );
      await tx.moderationCase.update({
        where: { id },
        data: { legalHold: hold, version: { increment: 1 } },
      });
    } else {
      requireCondition(
        type === "AuditEvent"
          ? await tx.auditEvent.findUnique({ where: { id } })
          : await tx.apiRequest.findUnique({ where: { id } }),
        "Record not found.",
        404,
      );
      if (hold)
        await tx.retentionHold.upsert({
          where: { resourceType_resourceId: { resourceType: type, resourceId: id } },
          create: { resourceType: type, resourceId: id },
          update: {},
        });
      else await tx.retentionHold.deleteMany({ where: { resourceType: type, resourceId: id } });
    }
    await audit(tx, actor, hold ? "retention.hold.applied" : "retention.hold.released", type, id);
    return { ok: true };
  });
}
