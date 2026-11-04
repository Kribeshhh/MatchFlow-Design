import { db, requireCondition, type Tx } from "../../database/client.js";
import { digest } from "../auth/tokens.js";
import type { ApiScope } from "../../../../../packages/shared/src/developer.js";
export async function credentialAccess(token: string, tx: Tx = db) {
  requireCondition(/^mf_live_[a-f0-9]{64}$/.test(token), "Invalid API credential.", 401);
  const key = await tx.apiCredential.findUnique({
    where: { tokenHash: digest(token) },
    include: { integration: true },
  });
  requireCondition(
    key && !key.revokedAt && key.expiresAt > new Date() && !key.integration.disabledAt,
    "Invalid API credential.",
    401,
  );
  return key.integration;
}
export async function eventAccess(tx: Tx, token: string, tournamentId: string, scope: ApiScope) {
  const app = await credentialAccess(token, tx);
  requireCondition(app.scopes.includes(scope), "Required API scope is missing.", 403);
  const t = await tx.tournament.findFirst({
    where: {
      id: tournamentId,
      restrictedAt: null,
      organizationId: app.organizationId,
      integrationGrants: { some: { integrationId: app.id } },
    },
  });
  requireCondition(t, "Tournament not found.", 404);
  return { app, tournament: t };
}
