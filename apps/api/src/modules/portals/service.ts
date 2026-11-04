import { db, transaction, requireCondition } from "../../database/client.js";
import { env } from "../../config/env.js";
import { organizationAccess } from "../organizations/policy.js";
import { audit } from "../administration/audit.js";
import type { PortalInput } from "../../../../../packages/shared/src/portals.js";
export function savePortal(org: string, actor: string, input: PortalInput) {
  return transaction(async (tx) => {
    await organizationAccess(org, actor, false, tx);
    const current = await tx.portal.findUnique({ where: { organizationId: org } });
    requireCondition(
      !current || current.slug === input.slug,
      "Portal address cannot be reassigned.",
    );
    requireCondition(
      !current || current.version === input.expectedVersion,
      "Portal changed. Reload before saving.",
      409,
    );
    requireCondition(
      !input.hideAttribution || env.PORTAL_ALLOW_HIDE_ATTRIBUTION,
      "Platform policy requires MatchFlow attribution.",
      403,
    );
    const { expectedVersion: _version, ...data } = input;
    const portal = await tx.portal.upsert({
      where: { organizationId: org },
      create: { ...data, organizationId: org },
      update: { ...data, version: { increment: 1 } },
    });
    await audit(tx, actor, "portal.updated", "Organization", org);
    return portal;
  });
}
export const portalProjection = {
  organizationId: true,
  slug: true,
  title: true,
  intro: true,
  accent: true,
  navigation: true,
  hideAttribution: true,
  coverId: true,
  organization: { select: { name: true, logoId: true } },
} as const;
export async function portalBySlug(slug: string) {
  const p = await db.portal.findFirst({ where: { slug, enabled: true }, select: portalProjection });
  requireCondition(p, "Portal not found.", 404);
  return p;
}
export async function portalByOrganization(organizationId: string) {
  const p = await db.portal.findFirst({
    where: { organizationId, enabled: true },
    select: portalProjection,
  });
  requireCondition(p, "Portal not found.", 404);
  return p;
}
export function publicPortal(p: Awaited<ReturnType<typeof portalBySlug>>) {
  return {
    ...p,
    hideAttribution: p.hideAttribution && env.PORTAL_ALLOW_HIDE_ATTRIBUTION,
    canonicalOrigin: env.APP_ORIGIN,
  };
}
