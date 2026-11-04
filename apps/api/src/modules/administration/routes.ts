import { caseContext } from "./cases.js";
import { env } from "../../config/env.js";
import { resetFactor } from "./staff-auth.js";
import { accountExport } from "./privacy.js";
import { Router } from "express";
import { z } from "zod";
import { db } from "../../database/client.js";
import { requireAuth, recentAuth, platform } from "../auth/policy.js";
import {
  adminQuery,
  caseInput,
  reviewInput,
  otpInput,
} from "../../../../../packages/shared/src/administration.js";
import { createCase, ownCases, reviewCase, caseProjection } from "./cases.js";
import { factorStatus, enroll, verifyFactor, staffGate } from "./staff-auth.js";
import { overview, transferOrganization, setHold } from "./operations.js";
import { throttle } from "../auth/throttle.js";
import { previewCorrection, dismissDispute } from "../matches/disputes.js";
import { applyCorrection } from "../matches/corrections.js";
import { resultSchema } from "../../../../../packages/shared/src/matches.js";
import { battleResultsSchema } from "../../../../../packages/shared/src/battle.js";
const correctionSchema = z
  .object({
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledgement: z.literal("VOID_AND_REPLAY"),
    reason: z.string().trim().min(10).max(2000),
    result: z.union([resultSchema, battleResultsSchema]),
  })
  .strict();
const id = z.string().min(1).max(100),
  reason = z.string().trim().min(10).max(2000);
export const administrationRouter = Router();
const r = administrationRouter;
r.get("/support/contact", (_req, res) => res.json({ email: env.SUPPORT_CONTACT_EMAIL || null }));
r.get("/account/export", requireAuth, recentAuth, async (req, res) =>
  res.json(await accountExport(req.account!.id, adminQuery.parse(req.query).page)),
);
r.post("/account/staff-factor/reset", requireAuth, recentAuth, async (req, res) =>
  res.json(await resetFactor(req.account!.id, req.sessionId!, otpInput.parse(req.body).otp)),
);
r.get("/account/staff-factor", requireAuth, async (req, res) =>
  res.json(await factorStatus(req.account!.id, req.sessionId!)),
);
r.post("/account/staff-factor/enroll", requireAuth, recentAuth, async (req, res) =>
  res.json(await enroll(req.account!.id)),
);
r.post("/account/staff-factor/activate", requireAuth, recentAuth, async (req, res) =>
  res.json(await verifyFactor(req.account!.id, req.sessionId!, otpInput.parse(req.body).otp, true)),
);
r.post("/account/staff-factor/verify", requireAuth, async (req, res) =>
  res.json(await verifyFactor(req.account!.id, req.sessionId!, otpInput.parse(req.body).otp)),
);
r.post("/support/cases", requireAuth, async (req, res) =>
  res
    .status(201)
    .json(await createCase(req.account!.id, caseInput.parse(req.body), req.eventAccessIds)),
);
r.get("/support/cases", requireAuth, async (req, res) =>
  res.json(await ownCases(req.account!.id, adminQuery.parse(req.query).page)),
);
r.use("/admin", staffGate, async (req, _res, next) => {
  await throttle("admin-requests", req.account!.id, 120, 60000);
  next();
});
r.get("/admin/overview", async (_req, res) => res.json(await overview()));
r.get("/admin/users", async (req, res) => {
  const q = adminQuery.parse(req.query);
  res.json(
    await db.user.findMany({
      where: { username: { contains: q.q, mode: "insensitive" } },
      select: {
        id: true,
        username: true,
        displayName: true,
        platformRole: true,
        status: true,
        createdAt: true,
        emailVerifiedAt: true,
      },
      orderBy: { id: "asc" },
      skip: (q.page - 1) * 25,
      take: 25,
    }),
  );
});
r.get("/admin/organizations", async (req, res) => {
  const q = adminQuery.parse(req.query);
  res.json(
    await db.organization.findMany({
      where: { name: { contains: q.q, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        ownerId: true,
        restrictedAt: true,
        _count: { select: { members: true, tournaments: true } },
      },
      orderBy: { id: "asc" },
      skip: (q.page - 1) * 25,
      take: 25,
    }),
  );
});
r.get("/admin/tournaments", async (req, res) => {
  const q = adminQuery.parse(req.query);
  res.json(
    await db.tournament.findMany({
      where: { name: { contains: q.q, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        organizationId: true,
        phase: true,
        visibility: true,
        restrictedAt: true,
      },
      orderBy: { id: "asc" },
      skip: (q.page - 1) * 25,
      take: 25,
    }),
  );
});
r.post("/admin/cases", recentAuth, async (req, res) =>
  res
    .status(201)
    .json(await createCase(req.account!.id, caseInput.parse(req.body), [], req.sessionId)),
);
r.get("/admin/cases", async (req, res) => {
  const q = adminQuery.parse(req.query);
  res.json(
    await db.moderationCase.findMany({
      where: { status: q.status, ...(q.q ? { id: q.q } : {}) },
      select: { ...caseProjection, reporterId: true, legalHold: true },
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * 25,
      take: 25,
    }),
  );
});
r.get("/admin/cases/:id/context", async (req, res) =>
  res.json(await caseContext(req.account!.id, req.sessionId!, id.parse(req.params.id))),
);
r.get("/admin/cases/:id/history", async (req, res) =>
  res.json(
    await db.moderationAction.findMany({
      where: { caseId: id.parse(req.params.id) },
      select: { id: true, actorId: true, action: true, reason: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ),
);
r.post("/admin/cases/:id/review", recentAuth, async (req, res) =>
  res.json(
    await reviewCase(
      req.account!.id,
      req.sessionId!,
      id.parse(req.params.id),
      reviewInput.parse(req.body),
    ),
  ),
);
r.post("/admin/organizations/:id/owner", platform("ADMIN"), recentAuth, async (req, res) => {
  const v = z.object({ newOwnerId: id, reason }).strict().parse(req.body);
  res.json(
    await transferOrganization(
      req.account!.id,
      req.sessionId!,
      id.parse(req.params.id),
      v.newOwnerId,
      v.reason,
    ),
  );
});
r.post("/admin/retention-holds", platform("ADMIN"), recentAuth, async (req, res) => {
  const v = z
    .object({
      resourceType: z.enum(["ModerationCase", "AuditEvent", "ApiRequest"]),
      resourceId: id,
      hold: z.boolean(),
    })
    .strict()
    .parse(req.body);
  res.json(await setHold(req.account!.id, req.sessionId!, v.resourceType, v.resourceId, v.hold));
});
r.get("/admin/api-usage", platform("ADMIN"), async (req, res) => {
  const q = adminQuery.parse(req.query);
  res.json(
    await db.apiRequest.findMany({
      select: { id: true, integrationId: true, operation: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * 25,
      take: 25,
    }),
  );
});
r.get("/admin/disputes", async (req, res) => {
  const q = adminQuery.parse(req.query);
  res.json(
    await db.matchDispute.findMany({
      where: { status: "OPEN" },
      select: {
        id: true,
        tournamentId: true,
        matchId: true,
        battleRoundId: true,
        reason: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      skip: (q.page - 1) * 25,
      take: 25,
    }),
  );
});
r.get(
  "/admin/tournaments/:id/disputes/:disputeId/preview",
  platform("ADMIN"),
  recentAuth,
  async (req, res) => {
    const tournamentId = id.parse(req.params.id),
      disputeId = id.parse(req.params.disputeId);
    const preview = await previewCorrection(
      tournamentId,
      disputeId,
      req.account!.id,
      req.sessionId,
    );
    const dispute = await db.matchDispute.findUniqueOrThrow({ where: { id: disputeId } });
    const event = await db.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      select: { format: true, engineRules: true },
    });
    const match = dispute.matchId
      ? await db.match.findFirst({
          where: { id: dispute.matchId, tournamentId },
          select: {
            version: true,
            teamA: { select: { id: true, name: true } },
            teamB: { select: { id: true, name: true } },
          },
        })
      : null;
    const round = dispute.battleRoundId
      ? await db.battleRound.findFirst({
          where: { id: dispute.battleRoundId, tournamentId },
          include: { results: true },
        })
      : null;
    const participants = round
      ? await db.team.findMany({
          where: { id: { in: round.participantIds } },
          select: { id: true, name: true },
        })
      : [];
    res.json({ ...preview, event, match, round, participants });
  },
);
r.post(
  "/admin/tournaments/:id/disputes/:disputeId/dismiss",
  platform("ADMIN"),
  recentAuth,
  async (req, res) =>
    res.json(
      await dismissDispute(
        id.parse(req.params.id),
        id.parse(req.params.disputeId),
        req.account!.id,
        z.object({ reason }).strict().parse(req.body).reason,
        req.sessionId,
      ),
    ),
);
r.post(
  "/admin/tournaments/:id/disputes/:disputeId/correct",
  platform("ADMIN"),
  recentAuth,
  async (req, res) => {
    const v = correctionSchema.parse(req.body);
    res.json(
      await applyCorrection(
        id.parse(req.params.id),
        id.parse(req.params.disputeId),
        req.account!.id,
        v.previewHash,
        v.reason,
        v.result,
        undefined,
        req.sessionId,
      ),
    );
  },
);
