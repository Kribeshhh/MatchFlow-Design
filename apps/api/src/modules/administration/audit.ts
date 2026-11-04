import type { Tx } from "../../database/client.js";
export function audit(
  tx: Tx,
  actorId: string | null,
  action: string,
  resourceType: string,
  resourceId: string,
) {
  return tx.auditEvent.create({ data: { actorId, action, resourceType, resourceId } });
}
