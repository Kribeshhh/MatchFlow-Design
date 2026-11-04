import { z } from "zod";
import { proposeRoster, reviewRoster } from "./roster-changes.js";
import { Router } from "express";
import * as schema from "../../../../../packages/shared/src/validation.js";
import { role } from "../auth/security.js";
import {
  registerTeam,
  reviewRegistration,
  registerIndividual,
  withdraw,
  checkIn,
} from "../registrations/service.js";
const id = schema.idSchema.parse;
export const router = Router();
router.post("/tournaments/:id/registrations", role("PLAYER"), async (req, res) => {
  const { teamId } = schema.idBody.parse(req.body);
  res
    .status(201)
    .json(
      await registerTeam(id(req.params.id), teamId, req.account!.id, false, req.eventAccessIds),
    );
});
router.post("/tournaments/:id/manual-registration", role("ORGANIZER"), async (req, res) => {
  const { teamId } = schema.idBody.parse(req.body);
  res
    .status(201)
    .json(await registerTeam(id(req.params.id), teamId, req.account!.id, true, req.eventAccessIds));
});
router.patch(
  "/tournaments/:id/registrations/:registrationId",
  role("ORGANIZER"),
  async (req, res) => {
    const { status } = schema.reviewSchema.parse(req.body);
    res.json(
      await reviewRegistration(
        id(req.params.id),
        id(req.params.registrationId),
        req.account!.id,
        status,
      ),
    );
  },
);
router.delete(
  "/tournaments/:id/registrations/:registrationId",
  role("ORGANIZER"),
  async (req, res) =>
    res.json(
      await reviewRegistration(
        id(req.params.id),
        id(req.params.registrationId),
        req.account!.id,
        "REMOVE",
      ),
    ),
);

router.post(
  "/tournaments/:id/registrations/:registrationId/roster",
  role("PLAYER"),
  async (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(
      await proposeRoster(
        id(req.params.id),
        id(req.params.registrationId),
        req.account!.id,
        req.eventAccessIds,
      ),
    );
  },
);
router.patch(
  "/tournaments/:id/registrations/:registrationId/roster",
  role("ORGANIZER"),
  async (req, res) =>
    res.json(
      await reviewRoster(
        id(req.params.id),
        id(req.params.registrationId),
        req.account!.id,
        z.object({ approve: z.boolean() }).strict().parse(req.body).approve,
      ),
    ),
);

router.post("/tournaments/:id/individual-registration", role("PLAYER"), async (req, res) => {
  z.object({}).strict().parse(req.body);
  res
    .status(201)
    .json(await registerIndividual(id(req.params.id), req.account!.id, req.eventAccessIds));
});
router.post(
  "/tournaments/:id/registrations/:registrationId/withdraw",
  role("PLAYER"),
  async (req, res) =>
    res.json(
      await withdraw(
        id(req.params.id),
        id(req.params.registrationId),
        req.account!.id,
        req.eventAccessIds,
      ),
    ),
);
router.post(
  "/tournaments/:id/registrations/:registrationId/check-in",
  role("PLAYER"),
  async (req, res) =>
    res.json(
      await checkIn(
        id(req.params.id),
        id(req.params.registrationId),
        req.account!.id,
        req.eventAccessIds,
      ),
    ),
);
