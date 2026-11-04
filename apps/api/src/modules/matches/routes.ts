import { publishLiveScore } from "./live-score.js";
import type { Request } from "express";
import { reportResult, reviewReport } from "./reports.js";
import {
  openDispute,
  previewCorrection,
  dismissDispute,
  matchHistory,
  ownReports,
} from "./disputes.js";
import { applyCorrection } from "./corrections.js";
import { changeMatchFormat, swapAssignments, resetBracket } from "./operations.js";
import { battleDetail, confirmBattle, scheduleBattle } from "../brackets/battle.js";
import { battleResultsSchema } from "../../../../../packages/shared/src/battle.js";
import { recentAuth } from "../auth/policy.js";
import { throttle } from "../auth/throttle.js";
const key = (req: Request) => z.string().uuid().optional().parse(req.get("Idempotency-Key"));
const reason = (input: unknown) =>
  z
    .object({ reason: z.string().trim().min(10).max(2000) })
    .strict()
    .parse(input).reason;
import { z } from "zod";
import { Router } from "express";
import * as schema from "../../../../../packages/shared/src/validation.js";
import { role } from "../auth/security.js";
import { confirmResult, scheduleMatch } from "../matches/service.js";
const id = schema.idSchema.parse;
export const router = Router();
router.patch("/tournaments/:id/matches/:matchId/schedule", role("ORGANIZER"), async (req, res) => {
  const input = schema.scheduleSchema.parse(req.body);
  res.json(
    await scheduleMatch(
      id(req.params.id),
      id(req.params.matchId),
      req.account!.id,
      input.scheduledAt,
      input.venue,
      input.slotMinutes,
    ),
  );
});
router.post("/tournaments/:id/matches/:matchId/result", role("ORGANIZER"), async (req, res) => {
  const input = schema.resultSchema.parse(req.body);
  res.json(
    await confirmResult(
      id(req.params.id),
      id(req.params.matchId),
      req.account!.id,
      input,
      z.string().uuid().optional().parse(req.get("Idempotency-Key")),
    ),
  );
});

router.post("/tournaments/:id/matches/:matchId/reports", role("PLAYER"), async (req, res) =>
  res
    .status(201)
    .json(
      await reportResult(
        id(req.params.id),
        id(req.params.matchId),
        req.account!.id,
        schema.resultSchema.parse(req.body),
        req.eventAccessIds,
        key(req),
      ),
    ),
);
router.post("/tournaments/:id/reports/:reportId/review", role("ORGANIZER"), async (req, res) => {
  const input = z
    .object({ approve: z.boolean(), reason: z.string().trim().min(10).max(2000) })
    .strict()
    .parse(req.body);
  res.json(
    await reviewReport(
      id(req.params.id),
      id(req.params.reportId),
      req.account!.id,
      input.approve,
      input.reason,
    ),
  );
});
router.post("/tournaments/:id/matches/:matchId/disputes", role("PLAYER"), async (req, res) => {
  await throttle("result-dispute", req.account!.id, 10, 3600000);
  res
    .status(201)
    .json(
      await openDispute(
        id(req.params.id),
        id(req.params.matchId),
        req.account!.id,
        reason(req.body),
        false,
        req.eventAccessIds,
      ),
    );
});
router.get("/tournaments/:id/engine-history", role("ORGANIZER"), async (req, res) =>
  res.json(
    await matchHistory(
      id(req.params.id),
      req.account!.id,
      z.string().max(100).optional().parse(req.query.cursor),
    ),
  ),
);
router.get("/tournaments/:id/disputes/:disputeId/preview", role("ORGANIZER"), async (req, res) =>
  res.json(await previewCorrection(id(req.params.id), id(req.params.disputeId), req.account!.id)),
);
router.post("/tournaments/:id/disputes/:disputeId/dismiss", role("ORGANIZER"), async (req, res) =>
  res.json(
    await dismissDispute(
      id(req.params.id),
      id(req.params.disputeId),
      req.account!.id,
      reason(req.body),
    ),
  ),
);
router.post(
  "/tournaments/:id/disputes/:disputeId/correct",
  role("ORGANIZER"),
  recentAuth,
  async (req, res) => {
    const input = z
      .object({
        previewHash: z.string().regex(/^[a-f0-9]{64}$/),
        acknowledgement: z.literal("VOID_AND_REPLAY"),
        reason: z.string().trim().min(10).max(2000),
        result: z.union([schema.resultSchema, battleResultsSchema]),
      })
      .strict()
      .parse(req.body);
    res.json(
      await applyCorrection(
        id(req.params.id),
        id(req.params.disputeId),
        req.account!.id,
        input.previewHash,
        input.reason,
        input.result,
        key(req),
      ),
    );
  },
);
router.patch("/tournaments/:id/matches/:matchId/format", role("ORGANIZER"), async (req, res) =>
  res.json(
    await changeMatchFormat(
      id(req.params.id),
      id(req.params.matchId),
      req.account!.id,
      z
        .object({ matchFormat: z.enum(["SCORE", "BO1", "BO3", "BO5"]) })
        .strict()
        .parse(req.body).matchFormat,
    ),
  ),
);
router.post("/tournaments/:id/assignments/swap", role("ORGANIZER"), async (req, res) => {
  const slot = z.object({ matchId: schema.idSchema, side: z.enum(["A", "B"]) }).strict();
  const input = z.object({ first: slot, second: slot }).strict().parse(req.body);
  res.json(await swapAssignments(id(req.params.id), req.account!.id, input.first, input.second));
});
router.post("/tournaments/:id/bracket/reset", role("ORGANIZER"), async (req, res) =>
  res.json(await resetBracket(id(req.params.id), req.account!.id, reason(req.body))),
);
router.get("/tournaments/:id/battle", async (req, res) =>
  res.json(await battleDetail(id(req.params.id), req.account?.id, req.eventAccessIds)),
);
router.patch("/tournaments/:id/battle/:roundId/schedule", role("ORGANIZER"), async (req, res) => {
  const input = schema.scheduleSchema.parse(req.body);
  res.json(
    await scheduleBattle(
      id(req.params.id),
      id(req.params.roundId),
      req.account!.id,
      input.scheduledAt,
      input.venue,
      input.slotMinutes,
    ),
  );
});
router.post("/tournaments/:id/battle/:roundId/result", role("ORGANIZER"), async (req, res) =>
  res.json(
    await confirmBattle(
      id(req.params.id),
      id(req.params.roundId),
      req.account!.id,
      battleResultsSchema.parse(req.body),
      key(req),
    ),
  ),
);
router.post("/tournaments/:id/battle/:roundId/disputes", role("PLAYER"), async (req, res) => {
  await throttle("result-dispute", req.account!.id, 10, 3600000);
  res
    .status(201)
    .json(
      await openDispute(
        id(req.params.id),
        id(req.params.roundId),
        req.account!.id,
        reason(req.body),
        true,
        req.eventAccessIds,
      ),
    );
});

router.get("/tournaments/:id/my-reports", role("PLAYER"), async (req, res) =>
  res.json(await ownReports(id(req.params.id), req.account!.id, req.eventAccessIds)),
);

router.patch(
  "/tournaments/:id/matches/:matchId/live-score",
  role("ORGANIZER"),
  async (req, res) => {
    await throttle("live-score", req.account!.id, 60, 60000);
    const input = z
      .object({
        scoreA: z.number().int().min(0).max(999),
        scoreB: z.number().int().min(0).max(999),
        expectedVersion: z.number().int().min(0),
      })
      .strict()
      .parse(req.body);
    res.json(
      await publishLiveScore(id(req.params.id), id(req.params.matchId), req.account!.id, input),
    );
  },
);
