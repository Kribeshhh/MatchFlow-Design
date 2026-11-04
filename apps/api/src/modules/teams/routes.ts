import { competitionHistory } from "../users/history.js";
import * as invitations from "./invitations.js";
import * as management from "./management.js";
import { recentAuth } from "../auth/policy.js";
import { Router } from "express";
import { z } from "zod";
import {
  idSchema,
  memberSchema,
  teamSchema,
} from "../../../../../packages/shared/src/validation.js";
import { requireAuth, role } from "../auth/security.js";
import * as service from "./service.js";
export const router = Router();
router.get("/teams", requireAuth, async (req, res) =>
  res.json(
    await service.listTeams(
      req.account!.id,
      req.query.eligibleFor ? idSchema.parse(req.query.eligibleFor) : undefined,
      z
        .string()
        .max(60)
        .parse(req.query.q || ""),
    ),
  ),
);
router.post("/teams", role("PLAYER"), async (req, res) =>
  res.status(201).json(await service.createTeam(req.account!.id, teamSchema.parse(req.body))),
);
router.get("/teams/:id", requireAuth, async (req, res) =>
  res.json(await service.getTeam(idSchema.parse(req.params.id), req.account!.id)),
);
router.post("/teams/:id/members", role("PLAYER"), async (req, res) =>
  res
    .status(201)
    .json(
      await service.addMember(
        idSchema.parse(req.params.id),
        req.account!.id,
        memberSchema.parse(req.body).userId,
      ),
    ),
);
router.delete("/teams/:id/members/:userId", role("PLAYER"), async (req, res) =>
  res.json(
    await service.removeMember(
      idSchema.parse(req.params.id),
      req.account!.id,
      idSchema.parse(req.params.userId),
    ),
  ),
);

router.get("/team-invitations", requireAuth, async (req, res) =>
  res.json(await invitations.inbox(req.account!.id)),
);
router.post("/team-invitations/:invitationId/respond", role("PLAYER"), async (req, res) =>
  res.json(
    await invitations.respond(
      idSchema.parse(req.params.invitationId),
      req.account!.id,
      z.object({ accept: z.boolean() }).strict().parse(req.body).accept,
    ),
  ),
);
router.get("/teams/:id/invitations", requireAuth, async (req, res) =>
  res.json(await invitations.sent(idSchema.parse(req.params.id), req.account!.id)),
);
router.delete("/teams/:id/invitations/:invitationId", role("PLAYER"), async (req, res) =>
  res.json(
    await invitations.cancel(
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.invitationId),
      req.account!.id,
    ),
  ),
);
router.patch("/teams/:id/members/:userId", role("PLAYER"), async (req, res) =>
  res.json(
    await management.setMember(
      idSchema.parse(req.params.id),
      req.account!.id,
      idSchema.parse(req.params.userId),
      z
        .object({ manager: z.boolean().optional(), substitute: z.boolean().optional() })
        .strict()
        .parse(req.body),
    ),
  ),
);
router.post("/teams/:id/leave", role("PLAYER"), async (req, res) =>
  res.json(await management.leave(idSchema.parse(req.params.id), req.account!.id)),
);
router.post("/teams/:id/archive", role("PLAYER"), recentAuth, async (req, res) =>
  res.json(await management.archive(idSchema.parse(req.params.id), req.account!.id)),
);
router.post("/teams/:id/transfer", role("PLAYER"), recentAuth, async (req, res) =>
  res.json(
    await management.requestTransfer(
      idSchema.parse(req.params.id),
      req.account!.id,
      memberSchema.parse(req.body).userId,
    ),
  ),
);
router.post("/teams/:id/transfer/respond", role("PLAYER"), recentAuth, async (req, res) =>
  res.json(
    await management.respondTransfer(
      idSchema.parse(req.params.id),
      req.account!.id,
      z.object({ accept: z.boolean() }).strict().parse(req.body).accept,
    ),
  ),
);

router.get("/teams/:id/history", requireAuth, async (req, res) => {
  const teamId = idSchema.parse(req.params.id);
  await service.getTeam(teamId, req.account!.id);
  res.json(await competitionHistory({ teamId }, req.account!.id));
});

router.delete("/teams/:id/transfer", role("PLAYER"), recentAuth, async (req, res) =>
  res.json(await management.cancelTransfer(idSchema.parse(req.params.id), req.account!.id)),
);

router.patch("/teams/:id", role("PLAYER"), async (req, res) =>
  res.json(
    await service.updateTeam(
      idSchema.parse(req.params.id),
      req.account!.id,
      teamSchema.parse(req.body),
    ),
  ),
);
