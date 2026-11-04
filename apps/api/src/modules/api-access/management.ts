import { replayCreationEvents } from "./webhook-initial.js";
import { randomBytes } from "node:crypto";
import { db, requireCondition, transaction, type Tx } from "../../database/client.js";
import { organizationAccess } from "../organizations/policy.js";
import { audit } from "../administration/audit.js";
import { digest } from "../auth/tokens.js";
import type { IntegrationInput } from "../../../../../packages/shared/src/developer.js";
export async function managed(tx: Tx, organizationId: string, id: string, actor: string) {
  await organizationAccess(organizationId, actor, false, tx);
  const app = await tx.integration.findFirst({ where: { id, organizationId } });
  requireCondition(app, "Integration not found.", 404);
  return app;
}
export function saveIntegration(org: string, actor: string, input: IntegrationInput, id?: string) {
  return transaction(async (tx) => {
    await organizationAccess(org, actor, false, tx);
    if (id) await managed(tx, org, id, actor);
    const ids = [...new Set(input.tournamentIds)];
    requireCondition(
      (await tx.tournament.count({ where: { id: { in: ids }, organizationId: org } })) ===
        ids.length,
      "Select tournaments belonging to this organization.",
    );
    requireCondition(
      id || (await tx.integration.count({ where: { organizationId: org } })) < 25,
      "Integration limit reached.",
    );
    const data = { name: input.name, scopes: [...new Set(input.scopes)] };
    const app = id
      ? await tx.integration.update({ where: { id }, data })
      : await tx.integration.create({ data: { ...data, organizationId: org } });
    await tx.integrationTournament.deleteMany({ where: { integrationId: app.id } });
    await tx.integrationTournament.createMany({
      data: ids.map((tournamentId) => ({ integrationId: app.id, tournamentId })),
    });
    await replayCreationEvents(tx, app.id, ids);
    await audit(
      tx,
      actor,
      id ? "integration.updated" : "integration.created",
      "Integration",
      app.id,
    );
    return { id: app.id };
  });
}
export function issueCredential(
  org: string,
  id: string,
  actor: string,
  days: number,
  rotateId?: string,
) {
  return transaction(async (tx) => {
    const app = await managed(tx, org, id, actor);
    requireCondition(!app.disabledAt, "Integration is disabled.");
    if (rotateId) {
      const old = await tx.apiCredential.findFirst({
        where: { id: rotateId, integrationId: id, revokedAt: null },
      });
      requireCondition(old, "Credential not found.", 404);
      await tx.apiCredential.update({ where: { id: rotateId }, data: { revokedAt: new Date() } });
    }
    requireCondition(
      (await tx.apiCredential.count({
        where: { integrationId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      })) < 5,
      "Revoke an existing credential first.",
    );
    const secret = `mf_live_${randomBytes(32).toString("hex")}`;
    const key = await tx.apiCredential.create({
      data: {
        integrationId: id,
        tokenHash: digest(secret),
        prefix: secret.slice(0, 16),
        expiresAt: new Date(Date.now() + days * 86400000),
      },
    });
    await audit(
      tx,
      actor,
      rotateId ? "credential.rotated" : "credential.created",
      "Integration",
      id,
    );
    return { id: key.id, secret, expiresAt: key.expiresAt };
  });
}
export function revokeCredential(org: string, id: string, keyId: string, actor: string) {
  return transaction(async (tx) => {
    await managed(tx, org, id, actor);
    const result = await tx.apiCredential.updateMany({
      where: { id: keyId, integrationId: id },
      data: { revokedAt: new Date() },
    });
    requireCondition(result.count, "Credential not found.", 404);
    await audit(tx, actor, "credential.revoked", "Integration", id);
    return { ok: true };
  });
}
export async function listIntegrations(org: string, actor: string) {
  await organizationAccess(org, actor);
  return db.integration.findMany({
    where: { organizationId: org },
    select: {
      id: true,
      name: true,
      scopes: true,
      disabledAt: true,
      createdAt: true,
      tournaments: { select: { tournamentId: true } },
      credentials: {
        select: { id: true, prefix: true, expiresAt: true, revokedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      webhooks: {
        select: { id: true, url: true, events: true, disabledAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: { select: { requests: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
}
