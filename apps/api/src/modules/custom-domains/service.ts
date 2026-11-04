import { randomBytes } from "node:crypto";
import { db, requireCondition, transaction } from "../../database/client.js";
import { organizationAccess } from "../organizations/policy.js";
import { audit } from "../administration/audit.js";
import { claimHostname } from "./hostname.js";
import { verifyDNS, domainDNS, type DomainDNS } from "./dns.js";
import { cloudflareProvider, domainAvailable, type DomainProvider } from "./provider.js";
import type { PgBoss } from "pg-boss";
import { queueDatabase } from "../notifications/delivery.js";
export const DOMAIN_QUEUE = "custom-domain-reconcile";
export async function claimDomain(org: string, actor: string, value: string) {
  const hostname = claimHostname(value);
  return transaction(async (tx) => {
    await organizationAccess(org, actor, true, tx);
    requireCondition(
      await tx.portal.findUnique({ where: { organizationId: org } }),
      "Configure your portal first.",
    );
    requireCondition(
      (await tx.customDomain.count({ where: { organizationId: org, removedAt: null } })) < 5,
      "Domain limit reached.",
    );
    requireCondition(
      !(await tx.customDomain.findFirst({ where: { hostname, removedAt: null } })),
      "This hostname is unavailable.",
      409,
    );
    const d = await tx.customDomain.create({
      data: {
        organizationId: org,
        hostname,
        challenge: `matchflow=${randomBytes(32).toString("hex")}`,
        challengeExpiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    await audit(tx, actor, "domain.claimed", "CustomDomain", d.id);
    return d;
  });
}
export async function requestRemoval(org: string, actor: string, id: string) {
  return transaction(async (tx) => {
    await organizationAccess(org, actor, true, tx);
    const d = await tx.customDomain.findFirst({
      where: { id, organizationId: org, removedAt: null },
    });
    requireCondition(d, "Domain not found.", 404);
    await tx.customDomain.update({
      where: { id },
      data: { status: "REMOVING", version: { increment: 1 }, nextCheckAt: new Date() },
    });
    await audit(tx, actor, "domain.removal.requested", "CustomDomain", id);
    return { ok: true };
  });
}
export async function renewChallenge(org: string, actor: string, id: string) {
  return transaction(async (tx) => {
    await organizationAccess(org, actor, true, tx);
    const d = await tx.customDomain.findFirst({
      where: { id, organizationId: org, status: { notIn: ["REMOVING", "REMOVED"] } },
    });
    requireCondition(d, "Domain not found.", 404);
    await tx.customDomain.update({
      where: { id },
      data: {
        challenge: `matchflow=${randomBytes(32).toString("hex")}`,
        challengeExpiresAt: new Date(Date.now() + 7 * 86400000),
        status: "PENDING",
        verifiedAt: null,
        checkedAt: null,
        version: { increment: 1 },
        nextCheckAt: new Date(),
      },
    });
    await audit(tx, actor, "domain.challenge.rotated", "CustomDomain", id);
    return { ok: true };
  });
}
export async function reconcileDomain(
  id: string,
  provider: DomainProvider = cloudflareProvider(),
  dns: DomainDNS = domainDNS,
  configured = domainAvailable(),
) {
  const claimed = await db.customDomain.updateMany({
    where: { id, removedAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
    data: { leaseUntil: new Date(Date.now() + 90000), version: { increment: 1 } },
  });
  if (!claimed.count) return;
  const d = await db.customDomain.findUniqueOrThrow({ where: { id } });
  const update = async (data: Parameters<typeof db.customDomain.updateMany>[0]["data"]) =>
    db.customDomain.updateMany({
      where: { id, version: d.version, status: d.status },
      data: { ...data, leaseUntil: null, nextCheckAt: new Date(Date.now() + 5 * 60000) },
    });
  try {
    if (d.status === "REMOVING") {
      // Unconfigured claims never contacted the provider and can be safely released.
      if (!configured) {
        if (d.providerStatus !== "unconfigured" || d.providerId) return;
        await update({ status: "REMOVED", removedAt: new Date() });
        return;
      }
      const old = await provider.find(d.hostname);
      if (old) await provider.remove(old.id);
      requireCondition(
        !(await provider.find(d.hostname)),
        "Provider cleanup is still pending.",
        503,
      );
      await update({
        status: "REMOVED",
        removedAt: new Date(),
        providerStatus: "deleted",
        certificateStatus: "deleted",
        checkedAt: new Date(),
      });
      await db.auditEvent.create({
        data: { action: "domain.removed", resourceType: "CustomDomain", resourceId: id },
      });
      return;
    }
    if (!configured) {
      await update({ status: "PENDING", checkedAt: null });
      return;
    }
    const proof =
      !d.verifiedAt && d.challengeExpiresAt < new Date()
        ? false
        : await verifyDNS(d.hostname, d.challenge, dns);
    if (!proof) {
      await update({ status: d.verifiedAt ? "SUSPENDED" : "PENDING", checkedAt: null });
      return;
    }
    // Record external intent before creating so removal never releases an uncertain provider claim.
    const intent = await db.customDomain.updateMany({
      where: { id, version: d.version, status: d.status },
      data: { providerStatus: "provisioning" },
    });
    if (!intent.count) return;
    const remote = (await provider.find(d.hostname)) || (await provider.create(d.hostname));
    requireCondition(remote.hostname === d.hostname, "Provider hostname mismatch.", 503);
    const active = remote.status === "active" && remote.certificateStatus === "active";
    const applied = await update({
      providerId: remote.id,
      providerStatus: remote.status,
      certificateStatus: remote.certificateStatus,
      dnsRecords: remote.records,
      status: active ? "ACTIVE" : "TLS_PENDING",
      verifiedAt: new Date(),
      checkedAt: new Date(),
    });
    if (applied.count && active && d.status !== "ACTIVE")
      await db.auditEvent.create({
        data: { action: "domain.activated", resourceType: "CustomDomain", resourceId: id },
      });
  } catch {
    await update({ status: d.status === "REMOVING" ? "REMOVING" : "SUSPENDED", checkedAt: null });
  } finally {
    await db.customDomain.updateMany({
      where: { id, version: d.version },
      data: { leaseUntil: null },
    });
  }
}
export async function enqueueDomains(boss: PgBoss) {
  const rows = await db.customDomain.findMany({
    where: {
      removedAt: null,
      nextCheckAt: { lte: new Date() },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    select: { id: true },
    take: 100,
  });
  for (const row of rows)
    await transaction(async (tx) => {
      const claimed = await tx.customDomain.updateMany({
        where: { id: row.id, removedAt: null, nextCheckAt: { lte: new Date() } },
        data: { nextCheckAt: new Date(Date.now() + 5 * 60000) },
      });
      if (claimed.count)
        await boss.send(DOMAIN_QUEUE, { domainId: row.id }, { db: queueDatabase(tx) });
    });
}
