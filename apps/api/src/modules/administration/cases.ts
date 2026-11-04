import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { caseInput, reviewInput } from "../../../../../packages/shared/src/administration.js";
import { db, transaction, requireCondition, type Tx } from "../../database/client.js";
import { staffAccess } from "./staff-auth.js";
import { audit } from "./audit.js";
import { throttle } from "../auth/throttle.js";
import { viewable } from "../tournaments/policy.js";
export const caseProjection = {
  id: true,
  userId: true,
  teamId: true,
  tournamentId: true,
  organizationId: true,
  category: true,
  description: true,
  status: true,
  resolution: true,
  createdAt: true,
  resolvedAt: true,
  version: true,
} as const;
export async function createCase(
  actor: string,
  input: z.infer<typeof caseInput>,
  sharedIds: string[] = [],
  staffSession?: string,
) {
  await throttle(
    staffSession ? "staff-case" : "support-report",
    actor,
    staffSession ? 60 : 5,
    3600000,
  );
  return transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: actor } });
    requireCondition(
      user?.status === "ACTIVE" && user.emailVerifiedAt,
      "Verify your account before submitting a report.",
      403,
    );
    const target: {
      userId?: string;
      teamId?: string;
      tournamentId?: string;
      organizationId?: string;
    } = {};
    const id = input.targetId!;
    if (staffSession) {
      await staffAccess(tx, actor, staffSession, false, true);
      const exists =
        input.targetType === "USER"
          ? await tx.user.findUnique({ where: { id }, select: { id: true } })
          : input.targetType === "TEAM"
            ? await tx.team.findFirst({
                where: { id, competitionType: "TEAM" },
                select: { id: true },
              })
            : input.targetType === "TOURNAMENT"
              ? await tx.tournament.findUnique({ where: { id }, select: { id: true } })
              : input.targetType === "ORGANIZATION"
                ? await tx.organization.findUnique({ where: { id }, select: { id: true } })
                : { id: "support" };
      requireCondition(exists, "Report target not found.", 404);
      if (input.targetType === "USER") target.userId = id;
      if (input.targetType === "TEAM") target.teamId = id;
      if (input.targetType === "TOURNAMENT") target.tournamentId = id;
      if (input.targetType === "ORGANIZATION") target.organizationId = id;
    } else if (input.targetType === "USER") {
      requireCondition(
        await tx.user.findFirst({
          where: { id, status: "ACTIVE", OR: [{ profilePublic: true }, { id: actor }] },
        }),
        "Report target not found.",
        404,
      );
      target.userId = id;
    } else if (input.targetType === "TEAM") {
      requireCondition(
        await tx.team.findFirst({
          where: {
            id,
            competitionType: "TEAM",
            OR: [
              { members: { some: { userId: actor } } },
              {
                registrations: {
                  some: {
                    status: "APPROVED",
                    tournament: { visibility: "PUBLIC", phase: { not: "DRAFT" } },
                  },
                },
              },
            ],
          },
        }),
        "Report target not found.",
        404,
      );
      target.teamId = id;
    } else if (input.targetType === "TOURNAMENT") {
      await viewable(tx, id, actor, sharedIds);
      target.tournamentId = id;
    } else if (input.targetType === "ORGANIZATION") {
      requireCondition(
        await tx.organization.findFirst({
          where: {
            id,
            OR: [
              { publicProfile: true },
              { ownerId: actor },
              { members: { some: { userId: actor } } },
            ],
          },
        }),
        "Report target not found.",
        404,
      );
      target.organizationId = id;
    }
    const row = await tx.moderationCase.create({
      data: {
        reporterId: actor,
        ...target,
        category: input.category,
        description: input.description,
      },
      select: caseProjection,
    });
    await audit(tx, actor, "moderation.case.created", "ModerationCase", row.id);
    return row;
  });
}
async function enforce(
  tx: Tx,
  c: {
    id: string;
    userId: string | null;
    teamId: string | null;
    tournamentId: string | null;
    organizationId: string | null;
  },
  actor: string,
  admin: boolean,
  action: string,
) {
  if (["SUSPEND", "RESTORE_ACCOUNT"].includes(action)) {
    requireCondition(c.userId, "Select a user report.");
    const u = await tx.user.findUniqueOrThrow({ where: { id: c.userId } });
    requireCondition(
      u.id !== actor && (admin || u.platformRole === "NONE"),
      "You cannot enforce against this account.",
      403,
    );
    if (action === "SUSPEND") {
      requireCondition(u.status === "ACTIVE", "Only active accounts can be suspended.", 409);
      if (u.platformRole === "ADMIN")
        requireCondition(
          (await tx.user.count({ where: { platformRole: "ADMIN", status: "ACTIVE" } })) > 1,
          "The last administrator cannot be suspended.",
        );
    } else
      requireCondition(u.status === "SUSPENDED", "Only suspended accounts can be restored.", 409);
    await tx.user.update({
      where: { id: u.id },
      data: { status: action === "SUSPEND" ? "SUSPENDED" : "ACTIVE" },
    });
    await tx.session.deleteMany({ where: { userId: u.id } });
    await tx.identityToken.deleteMany({ where: { userId: u.id } });
    await tx.oAuthFlow.deleteMany({ where: { userId: u.id } });
    return { previousStatus: u.status };
  }
  requireCondition(["RESTRICT", "RESTORE_CONTENT"].includes(action), "Unsupported action.");
  const kind = c.teamId
    ? "Team"
    : c.tournamentId
      ? "Tournament"
      : c.organizationId
        ? "Organization"
        : null;
  requireCondition(kind, "Select a content report.");
  const id = (c.teamId || c.tournamentId || c.organizationId)!;
  const row =
    kind === "Team"
      ? await tx.team.findUniqueOrThrow({ where: { id } })
      : kind === "Tournament"
        ? await tx.tournament.findUniqueOrThrow({ where: { id } })
        : await tx.organization.findUniqueOrThrow({ where: { id } });
  const owner =
    "captainId" in row ? row.captainId : "organizerId" in row ? row.organizerId : row.ownerId;
  const orgOwner =
    "organizationId" in row && row.organizationId
      ? await tx.organization.findUnique({
          where: { id: row.organizationId },
          select: { ownerId: true },
        })
      : null;
  const ownerAccount = await tx.user.findUniqueOrThrow({
    where: { id: orgOwner?.ownerId || owner },
  });
  requireCondition(
    admin || ownerAccount.platformRole === "NONE",
    "Administrator review is required for staff-owned content.",
    403,
  );
  if (action === "RESTRICT") {
    requireCondition(!row.restrictedAt, "Content is already restricted.", 409);
    const evidence = {
      kind,
      id,
      name: row.name,
      description: row.description,
      ...("rules" in row
        ? {
            rules: row.rules,
            eligibility: row.eligibility,
            prizeInfo: row.prizeInfo,
            visibility: row.visibility,
          }
        : {}),
      ...("website" in row ? { website: row.website } : {}),
    };
    const data = {
      restrictedAt: new Date(),
      name: "Content unavailable",
      description: "This content is under platform review.",
    };
    if (kind === "Team") {
      await tx.team.update({
        where: { id },
        data: { ...data, logoId: null, logoUrl: null, transferToId: null, transferExpiresAt: null },
      });
      await tx.teamInvitation.updateMany({
        where: { teamId: id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    } else if (kind === "Tournament") {
      await tx.tournament.update({
        where: { id },
        data: {
          ...data,
          rules: "Under review",
          eligibility: "",
          prizeInfo: "",
          visibility: "PRIVATE",
          coverId: null,
          shareTokenHash: null,
        },
      });
      await tx.tournamentAnnouncement.updateMany({
        where: { tournamentId: id },
        data: { title: "Content unavailable", body: "Under platform review." },
      });
    } else {
      await tx.organization.update({
        where: { id },
        data: { ...data, website: "", publicProfile: false, logoId: null },
      });
      await tx.organizationInvitation.updateMany({
        where: { organizationId: id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      await tx.portal.updateMany({
        where: { organizationId: id },
        data: { enabled: false, version: { increment: 1 } },
      });
      await tx.integration.updateMany({
        where: { organizationId: id },
        data: { disabledAt: new Date() },
      });
    }
    return evidence;
  }
  requireCondition(row.restrictedAt, "Content is not restricted.", 409);
  // Restore the latest preserved snapshot for this target, even when another report initiated restriction.
  const prior = await tx.moderationAction.findFirst({
    where: {
      action: "RESTRICT",
      case: {
        ...(c.teamId
          ? { teamId: id }
          : c.tournamentId
            ? { tournamentId: id }
            : { organizationId: id }),
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const e = prior?.evidence as Record<string, unknown> | null;
  const data = {
    restrictedAt: null,
    ...(typeof e?.name === "string" ? { name: e.name } : {}),
    ...(typeof e?.description === "string" ? { description: e.description } : {}),
  };
  if (kind === "Team") await tx.team.update({ where: { id }, data });
  else if (kind === "Tournament")
    await tx.tournament.update({
      where: { id },
      data: {
        ...data,
        ...(typeof e?.rules === "string" ? { rules: e.rules } : {}),
        ...(typeof e?.eligibility === "string" ? { eligibility: e.eligibility } : {}),
        ...(typeof e?.prizeInfo === "string" ? { prizeInfo: e.prizeInfo } : {}),
      },
    });
  else await tx.organization.update({ where: { id }, data });
  // Restoring content never republishes a portal/event or re-enables integration credentials automatically.
  return { kind, id };
}
export async function reviewCase(
  actor: string,
  session: string,
  id: string,
  input: z.infer<typeof reviewInput>,
) {
  return transaction(async (tx) => {
    const staff = await staffAccess(tx, actor, session, false, true),
      c = await tx.moderationCase.findUnique({ where: { id } });
    requireCondition(c, "Case not found.", 404);
    requireCondition(
      c.version === input.expectedVersion,
      "Case changed. Refresh before reviewing.",
      409,
    );
    let evidence: Prisma.InputJsonValue | undefined;
    if (!["REVIEW", "RESOLVE", "DISMISS"].includes(input.action))
      evidence = await enforce(tx, c, actor, staff.platformRole === "ADMIN", input.action);
    const status =
      input.action === "RESOLVE"
        ? "RESOLVED"
        : input.action === "DISMISS"
          ? "DISMISSED"
          : "REVIEWING";
    requireCondition(
      !["RESOLVE", "DISMISS"].includes(input.action) || input.resolution.length >= 10,
      "Provide a resolution for the reporter.",
    );
    await tx.moderationCase.update({
      where: { id },
      data: {
        status,
        resolution: input.resolution,
        version: { increment: 1 },
        resolvedAt: ["RESOLVED", "DISMISSED"].includes(status) ? new Date() : null,
      },
    });
    await tx.moderationAction.create({
      data: { caseId: id, actorId: actor, action: input.action, reason: input.reason, evidence },
    });
    await audit(tx, actor, `moderation.${input.action.toLowerCase()}`, "ModerationCase", id);
    return { ok: true };
  });
}
export const ownCases = (actor: string, page: number) =>
  db.moderationCase.findMany({
    where: { reporterId: actor },
    select: caseProjection,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * 25,
    take: 25,
  });

export async function caseContext(actor: string, sessionId: string, id: string) {
  return transaction(async (tx) => {
    await staffAccess(tx, actor, sessionId);
    const c = await tx.moderationCase.findUnique({ where: { id } });
    requireCondition(c, "Case not found.", 404);
    const target = c.userId
      ? await tx.user.findUnique({
          where: { id: c.userId },
          select: {
            id: true,
            username: true,
            displayName: true,
            bio: true,
            status: true,
            platformRole: true,
          },
        })
      : c.teamId
        ? await tx.team.findUnique({
            where: { id: c.teamId },
            select: {
              id: true,
              name: true,
              description: true,
              captainId: true,
              restrictedAt: true,
            },
          })
        : c.tournamentId
          ? await tx.tournament.findUnique({
              where: { id: c.tournamentId },
              select: {
                id: true,
                name: true,
                description: true,
                rules: true,
                eligibility: true,
                prizeInfo: true,
                phase: true,
                visibility: true,
                restrictedAt: true,
              },
            })
          : c.organizationId
            ? await tx.organization.findUnique({
                where: { id: c.organizationId },
                select: {
                  id: true,
                  name: true,
                  description: true,
                  ownerId: true,
                  restrictedAt: true,
                },
              })
            : null;
    await audit(tx, actor, "moderation.context.viewed", "ModerationCase", id);
    return { target };
  });
}
