import { staffAccess } from "./staff-auth.js";
import { adminQuery } from "../../../../../packages/shared/src/administration.js";
import { Router } from "express";
import { z } from "zod";
import { db, transaction, requireCondition } from "../../database/client.js";
import { platform, recentAuth } from "../auth/policy.js";
import { audit } from "./audit.js";
export const router = Router();
router.get("/admin/security-events", platform("MODERATOR"), async (req, res) =>
  res.json(
    await db.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      skip: (adminQuery.parse(req.query).page - 1) * 25,
      select: {
        id: true,
        actorId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        createdAt: true,
      },
    }),
  ),
);
router.get("/admin/deletion-requests", platform("ADMIN"), async (_req, res) =>
  res.json(await db.accountDeletion.findMany({ orderBy: { requestedAt: "desc" }, take: 100 })),
);
router.patch("/admin/users/:id/role", platform("ADMIN"), recentAuth, async (req, res) => {
  const id = z.string().max(100).parse(req.params.id);
  const { platformRole } = z
    .object({ platformRole: z.enum(["NONE", "MODERATOR", "ADMIN"]) })
    .strict()
    .parse(req.body);
  await transaction(async (tx) => {
    await staffAccess(tx, req.account!.id, req.sessionId!, true, true);
    const actor = await tx.user.findUnique({ where: { id: req.account!.id } });
    requireCondition(
      actor?.status === "ACTIVE" && actor.platformRole === "ADMIN" && actor.emailVerifiedAt,
      "Administrator access required.",
      403,
    );
    const user = await tx.user.findUnique({ where: { id } });
    requireCondition(
      user?.status === "ACTIVE" && user.emailVerifiedAt,
      "Select a verified active account.",
    );
    if (user.platformRole === "ADMIN" && platformRole !== "ADMIN")
      requireCondition(
        (await tx.user.count({ where: { platformRole: "ADMIN", status: "ACTIVE" } })) > 1,
        "The last administrator cannot be removed.",
      );
    await tx.user.update({ where: { id }, data: { platformRole } });
    await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, req.account!.id, "identity.platform_role.changed", "User", id);
  });
  res.json({ ok: true });
});
