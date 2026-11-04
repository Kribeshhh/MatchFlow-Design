import { organizerProfile } from "./organizer.js";
import { viewable } from "./policy.js";
import {
  createTournament,
  editTournament,
  changeLifecycle,
  announce,
  exportEntries,
} from "./management.js";
import { rotateShareLink, redeemShareLink } from "./sharing.js";
import { cookieOptions } from "../auth/security.js";
import { announcementSchema } from "../../../../../packages/shared/src/tournaments.js";
import { throttle } from "../auth/throttle.js";
import { z } from "zod";
import { requireAuth } from "../auth/security.js";
import { recentAuth } from "../auth/policy.js";
import { transaction, requireCondition } from "../../database/client.js";
import { organizationAccess } from "../organizations/policy.js";
import { audit } from "../administration/audit.js";
import { Router } from "express";
import { idSchema, tournamentSchema } from "../../../../../packages/shared/src/validation.js";
import { role } from "../auth/security.js";
import { tournamentDetail } from "./detail.js";
import { discover, discoverySchema } from "./service.js";
export const router = Router();
router.get("/tournaments", async (req, res) =>
  res.json(await discover(discoverySchema.parse(req.query))),
);
router.post("/tournaments", role("ORGANIZER"), async (req, res) =>
  res.status(201).json(await createTournament(req.account!.id, tournamentSchema.parse(req.body))),
);
router.get("/tournaments/:id", async (req, res) =>
  res.json(await tournamentDetail(idSchema.parse(req.params.id), req.account, req.eventAccessIds)),
);

router.put("/tournaments/:id/permissions/:userId", requireAuth, recentAuth, async (req, res) => {
  const tournamentId = idSchema.parse(req.params.id),
    userId = idSchema.parse(req.params.userId);
  const { canManage } = z.object({ canManage: z.boolean() }).strict().parse(req.body);
  await transaction(async (tx) => {
    const t = await viewable(tx, tournamentId, req.account!.id);
    requireCondition(t, "Tournament not found.", 404);
    if (t.organizationId) {
      await organizationAccess(t.organizationId, req.account!.id, false, tx);
      requireCondition(
        userId ===
          (await tx.organization.findUniqueOrThrow({ where: { id: t.organizationId } })).ownerId ||
          Boolean(
            await tx.organizationMember.findUnique({
              where: { organizationId_userId: { organizationId: t.organizationId, userId } },
            }),
          ),
        "Assign an accepted organization member.",
        403,
      );
    } else requireCondition(t.organizerId === req.account!.id, "Permission denied.", 403);
    const target = await tx.user.findUnique({ where: { id: userId } });
    requireCondition(
      target?.status === "ACTIVE" && target.emailVerifiedAt,
      "Select a verified active account.",
    );
    await tx.tournamentPermission.upsert({
      where: { tournamentId_userId: { tournamentId, userId } },
      create: { tournamentId, userId, canManage },
      update: { canManage },
    });
    await audit(tx, req.account!.id, "tournament.permission.changed", "Tournament", tournamentId);
  });
  res.json({ ok: true });
});

router.patch("/tournaments/:id", role("ORGANIZER"), async (req, res) =>
  res.json(
    await editTournament(
      idSchema.parse(req.params.id),
      req.account!.id,
      tournamentSchema.parse(req.body),
    ),
  ),
);
router.post("/tournaments/:id/lifecycle", role("ORGANIZER"), async (req, res) => {
  const input = z
    .object({
      action: z.enum(["PUBLISH", "CHECK_IN", "CANCEL", "POSTPONE"]),
      reason: z.string().trim().max(2000).default(""),
    })
    .strict()
    .parse(req.body);
  res.json(
    await changeLifecycle(
      idSchema.parse(req.params.id),
      req.account!.id,
      input.action,
      input.reason,
    ),
  );
});
router.post("/tournaments/:id/announcements", role("ORGANIZER"), async (req, res) =>
  res
    .status(201)
    .json(
      await announce(
        idSchema.parse(req.params.id),
        req.account!.id,
        announcementSchema.parse(req.body),
      ),
    ),
);
router.post("/tournaments/:id/share-link", role("ORGANIZER"), recentAuth, async (req, res) =>
  res.json(await rotateShareLink(idSchema.parse(req.params.id), req.account!.id)),
);
router.post("/tournaments/:id/access", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  await throttle("event-link", req.ip || "unknown", 30, 60000);
  const { token } = z
    .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .parse(req.body);
  await redeemShareLink(id, token);
  const previous = Object.keys(req.cookies || {}).filter(
    (name) => /^mf_event_c[a-z0-9]+$/.test(name) && name !== `mf_event_${id}`,
  );
  for (const name of previous.slice(0, Math.max(0, previous.length - 9)))
    res.clearCookie(name, cookieOptions);
  res.cookie(`mf_event_${id}`, token, { ...cookieOptions, maxAge: 7 * 86400000 });
  res.json({ ok: true });
});
router.get("/tournaments/:id/export", role("ORGANIZER"), async (req, res) =>
  res
    .type("text/csv")
    .set("Content-Disposition", 'attachment; filename="matchflow-participants.csv"')
    .send(await exportEntries(idSchema.parse(req.params.id), req.account!.id)),
);

router.get("/organizers/:username", async (req, res) =>
  res.json(
    await organizerProfile(
      z.string().trim().toLowerCase().min(3).max(24).parse(req.params.username),
    ),
  ),
);
