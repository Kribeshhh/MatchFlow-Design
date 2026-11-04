import { randomUUID } from "node:crypto";
import { db, requireCondition, transaction, ApiError } from "../../database/client.js";
import { editableTeam, requireTeamActor } from "../teams/policy.js";
import { audit } from "../administration/audit.js";
import { normalizeImage } from "./image.js";
import type { ObjectStorage } from "./storage.js";
import { owned, visibleTo } from "../tournaments/policy.js";
import { organizationAccess } from "../organizations/policy.js";
type Target =
  | { userId: string }
  | { teamId: string }
  | { tournamentId: string }
  | { organizationId: string }
  | { portalOrganizationId: string };
async function authorize(
  actorId: string,
  target: Target,
  tx = db as import("../../database/client.js").Tx,
) {
  await requireTeamActor(tx, actorId);
  if ("portalOrganizationId" in target) {
    await organizationAccess(target.portalOrganizationId, actorId, false, tx);
    requireCondition(
      await tx.portal.findUnique({ where: { organizationId: target.portalOrganizationId } }),
      "Configure your portal first.",
    );
  } else if ("organizationId" in target)
    await organizationAccess(target.organizationId, actorId, false, tx);
  else if ("teamId" in target) await editableTeam(tx, target.teamId, actorId);
  else if ("tournamentId" in target) {
    const event = await owned(tx, target.tournamentId, actorId);
    requireCondition(
      ["DRAFT", "PUBLISHED", "REGISTRATION", "POSTPONED"].includes(event.phase),
      "Cover editing is closed.",
    );
  } else requireCondition(target.userId === actorId, "Permission denied.", 403);
}
export async function uploadImage(
  actorId: string,
  target: Target,
  input: Buffer,
  storage: ObjectStorage,
) {
  await authorize(actorId, target);
  const bytes = await normalizeImage(
    input,
    "tournamentId" in target || "portalOrganizationId" in target,
  );
  const assetId = randomUUID(),
    key = `matchflow/${assetId}.webp`;
  // Track before external I/O so failed uploads remain eligible for scheduled cleanup.
  await transaction(async (tx) => {
    await authorize(actorId, target, tx);
    await tx.mediaAsset.create({ data: { id: assetId, key, ownerId: actorId } });
  });
  try {
    await storage.put(key, bytes);
  } catch {
    throw new ApiError(503, "Image upload failed. Please try again.");
  }
  await transaction(async (tx) => {
    await authorize(actorId, target, tx);
    if ("portalOrganizationId" in target)
      await tx.portal.update({
        where: { organizationId: target.portalOrganizationId },
        data: { coverId: assetId, version: { increment: 1 } },
      });
    else if ("userId" in target)
      await tx.user.update({ where: { id: target.userId }, data: { avatarId: assetId } });
    else if ("tournamentId" in target)
      await tx.tournament.update({
        where: { id: target.tournamentId },
        data: { coverId: assetId },
      });
    else if ("organizationId" in target)
      await tx.organization.update({
        where: { id: target.organizationId },
        data: { logoId: assetId, version: { increment: 1 } },
      });
    else
      await tx.team.update({
        where: { id: target.teamId },
        data: { logoId: assetId, logoUrl: `/api/media/${assetId}` },
      });
    await audit(
      tx,
      actorId,
      "media.updated",
      "portalOrganizationId" in target
        ? "Organization"
        : "userId" in target
          ? "User"
          : "tournamentId" in target
            ? "Tournament"
            : "organizationId" in target
              ? "Organization"
              : "Team",
      "portalOrganizationId" in target
        ? target.portalOrganizationId
        : "userId" in target
          ? target.userId
          : "tournamentId" in target
            ? target.tournamentId
            : "organizationId" in target
              ? target.organizationId
              : target.teamId,
    );
  });
  return { id: assetId };
}
export async function removeImage(actorId: string, target: Target) {
  await transaction(async (tx) => {
    await authorize(actorId, target, tx);
    if ("portalOrganizationId" in target)
      await tx.portal.update({
        where: { organizationId: target.portalOrganizationId },
        data: { coverId: null, version: { increment: 1 } },
      });
    else if ("userId" in target)
      await tx.user.update({ where: { id: target.userId }, data: { avatarId: null } });
    else if ("tournamentId" in target)
      await tx.tournament.update({ where: { id: target.tournamentId }, data: { coverId: null } });
    else if ("organizationId" in target)
      await tx.organization.update({
        where: { id: target.organizationId },
        data: { logoId: null, version: { increment: 1 } },
      });
    else
      await tx.team.update({ where: { id: target.teamId }, data: { logoId: null, logoUrl: null } });
    await audit(
      tx,
      actorId,
      "media.removed",
      "portalOrganizationId" in target
        ? "Organization"
        : "userId" in target
          ? "User"
          : "tournamentId" in target
            ? "Tournament"
            : "organizationId" in target
              ? "Organization"
              : "Team",
      "portalOrganizationId" in target
        ? target.portalOrganizationId
        : "userId" in target
          ? target.userId
          : "tournamentId" in target
            ? target.tournamentId
            : "organizationId" in target
              ? target.organizationId
              : target.teamId,
    );
  });
  return { ok: true };
}
export async function readImage(
  id: string,
  viewerId: string | undefined,
  storage: ObjectStorage | undefined,
  sharedIds: string[] = [],
) {
  const asset = await db.mediaAsset.findUnique({
    where: { id },
    include: {
      portalCovers: {
        where: {
          OR: [
            { enabled: true },
            ...(viewerId
              ? [
                  {
                    organization: {
                      OR: [{ ownerId: viewerId }, { members: { some: { userId: viewerId } } }],
                    },
                  },
                ]
              : []),
          ],
        },
        select: { organizationId: true },
      },
      organizationLogos: {
        where: {
          OR: [
            { publicProfile: true },
            { portal: { enabled: true } },
            ...(viewerId
              ? [{ ownerId: viewerId }, { members: { some: { userId: viewerId } } }]
              : []),
          ],
        },
        select: { id: true },
      },
      avatars: { select: { id: true, status: true, profilePublic: true } },
      logos: { select: { id: true } },
      covers: { where: visibleTo(viewerId, sharedIds), select: { id: true } },
    },
  });
  requireCondition(
    asset &&
      (asset.portalCovers.length ||
        asset.organizationLogos.length ||
        asset.covers.length ||
        asset.logos.length ||
        asset.avatars.some((u) => u.status === "ACTIVE" && (u.profilePublic || u.id === viewerId))),
    "Image not found.",
    404,
  );
  requireCondition(storage, "Image storage is not configured yet.", 503);
  try {
    return Buffer.from(await storage.get(asset.key));
  } catch {
    throw new ApiError(503, "Image is unavailable. Please try again.");
  }
}
export async function cleanupMedia(storage: ObjectStorage) {
  const assets = await db.mediaAsset.findMany({
    where: {
      createdAt: { lt: new Date(Date.now() - 86400000) },
      avatars: { none: {} },
      logos: { none: {} },
      covers: { none: {} },
      organizationLogos: { none: {} },
      portalCovers: { none: {} },
    },
    take: 100,
  });
  for (const asset of assets) {
    // No endpoint accepts an old asset ID for attachment; each upload always creates a new one.
    await storage.remove(asset.key);
    await db.mediaAsset.delete({ where: { id: asset.id } });
  }
  return assets.length;
}
