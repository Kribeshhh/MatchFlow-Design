import type { Tx } from "../../database/client.js";
// Selected-event integrations learn creation when an existing event is explicitly granted.
// Reuse the original outbox event/version; never invent creation for legacy records.
export async function replayCreationEvents(tx: Tx, integrationId: string, tournamentIds: string[]) {
  if (!tournamentIds.length) return;
  const endpoints = await tx.webhookEndpoint.findMany({
    where: {
      integrationId,
      disabledAt: null,
      events: { has: "tournament.created" },
      integration: { disabledAt: null, scopes: { has: "tournaments:read" } },
    },
    select: { id: true },
  });
  const events = await tx.webhookEvent.findMany({
    where: { tournamentId: { in: tournamentIds }, type: "tournament.created" },
    select: { id: true },
  });
  if (endpoints.length && events.length)
    await tx.webhookDelivery.createMany({
      data: endpoints.flatMap((e) =>
        events.map((event) => ({ endpointId: e.id, eventId: event.id })),
      ),
      skipDuplicates: true,
    });
}
