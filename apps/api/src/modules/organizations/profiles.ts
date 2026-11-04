import type { z } from "zod";
import { db, transaction, requireCondition } from "../../database/client.js";
import { organizationProfileSchema } from "../../../../../packages/shared/src/organizations.js";
import { organizationAccess } from "./policy.js";
import { requireTeamActor } from "../teams/policy.js";
import { audit } from "../administration/audit.js";
export const profileSelect = {
  id: true,
  name: true,
  description: true,
  region: true,
  website: true,
  publicProfile: true,
  logoId: true,
  version: true,
} as const;
export async function createOrganization(
  actorId: string,
  data: z.infer<typeof organizationProfileSchema>,
) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const org = await tx.organization.create({
      data: { ...data, ownerId: actorId },
      select: profileSelect,
    });
    await audit(tx, actorId, "organization.created", "Organization", org.id);
    return org;
  });
}
export async function updateOrganization(
  id: string,
  actorId: string,
  data: z.infer<typeof organizationProfileSchema>,
  expectedVersion: number,
) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const org = await organizationAccess(id, actorId, false, tx);
    requireCondition(
      org.version === expectedVersion,
      "Organization changed. Reload before saving.",
      409,
    );
    const updated = await tx.organization.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
      select: profileSelect,
    });
    await audit(tx, actorId, "organization.profile.updated", "Organization", id);
    return updated;
  });
}
export async function publicOrganization(id: string) {
  const org = await db.organization.findFirst({
    where: { id, publicProfile: true },
    select: profileSelect,
  });
  requireCondition(org, "Organization not found.", 404);
  const events = await db.tournament.findMany({
    where: { organizationId: id, visibility: "PUBLIC", phase: { not: "DRAFT" } },
    select: { id: true, name: true, game: true, phase: true, startsAt: true },
    orderBy: { startsAt: "desc" },
    take: 100,
  });
  return {
    id: org.id,
    name: org.name,
    description: org.description,
    region: org.region,
    website: org.website,
    logoId: org.logoId,
    tournaments: events,
  };
}
