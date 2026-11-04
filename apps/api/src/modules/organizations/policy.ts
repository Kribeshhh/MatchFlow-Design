import { db, requireCondition, type Tx } from "../../database/client.js";
import { requireTeamActor } from "../teams/policy.js";
export async function workspaceAccess(id: string, userId: string, tx: Tx = db) {
  await requireTeamActor(tx, userId);
  const org = await tx.organization.findUnique({
    where: { id },
    include: { members: { where: { userId }, select: { role: true } } },
  });
  requireCondition(
    org && (org.ownerId === userId || org.members.length),
    "Organization not found.",
    404,
  );
  requireCondition(
    !org.restrictedAt,
    "This organization is restricted by platform moderation.",
    403,
  );
  const access = org.ownerId === userId ? "OWNER" : org.members[0].role;
  return { ...org, access };
}
export async function organizationAccess(
  id: string,
  userId: string,
  ownerOnly = false,
  tx: Tx = db,
) {
  const org = await workspaceAccess(id, userId, tx);
  requireCondition(
    org.access === "OWNER" || (!ownerOnly && org.access === "ADMIN"),
    "Permission denied.",
    403,
  );
  return org;
}
export async function organizationEventsAccess(id: string, userId: string, tx: Tx = db) {
  const org = await workspaceAccess(id, userId, tx);
  requireCondition(["OWNER", "ADMIN", "MANAGER"].includes(org.access), "Permission denied.", 403);
  return org;
}
