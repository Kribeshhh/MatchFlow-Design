import type { z } from "zod";
import type { ResultInput } from "../../../../../packages/shared/src/matches.js";
import { battleResultsSchema } from "../../../../../packages/shared/src/battle.js";
import { requireCondition, transaction } from "../../database/client.js";

import { history, replay, remember } from "../brackets/commands.js";
import { finishBattle } from "../brackets/battle.js";
import { correctionAccess, correctionState } from "./disputes.js";
import { recordConfirmed } from "./service.js";
const cleared = {
  liveScoreA: null,
  liveScoreB: null,
  scoreA: null,
  scoreB: null,
  winnerId: null,
  completedAt: null,
  killsA: null,
  deathsA: null,
  assistsA: null,
  killsB: null,
  deathsB: null,
  assistsB: null,
  durationSeconds: null,
  outcome: "PLAYED",
  isBye: false,
};
export async function applyCorrection(
  tournamentId: string,
  disputeId: string,
  actor: string,
  previewHash: string,
  reason: string,
  input: ResultInput | z.infer<typeof battleResultsSchema>,
  key?: string,
  staffSession?: string,
) {
  return transaction(async (tx) => {
    await correctionAccess(tx, tournamentId, actor, staffSession);
    const payload = { operation: "correct", tournamentId, disputeId, previewHash, reason, input };
    const previous = await replay<{ ok: true }>(tx, actor, key, payload);
    if (previous) return previous;
    const state = await correctionState(tx, tournamentId, disputeId, actor, staffSession);
    requireCondition(
      state.hash === previewHash,
      "The tournament changed since this preview. Review a fresh rollback preview.",
      409,
    );
    requireCondition(reason.trim().length >= 10, "Record a correction reason.");
    await history(
      tx,
      tournamentId,
      actor,
      "correction.rollback",
      {
        dispute: state.dispute,
        target: state.target || state.battle,
        voidedMatches: state.affected,
        voidedRounds: state.affectedRounds,
        stages: state.stages,
      },
      state.target?.id || state.battle?.id,
      reason,
    );
    const ids = [...(state.target ? [state.target.id] : []), ...state.affected.map((m) => m.id)];
    const roundIds = [
      ...(state.battle ? [state.battle.id] : []),
      ...state.affectedRounds.map((r) => r.id),
    ];
    await tx.matchDispute.updateMany({
      where: {
        tournamentId,
        status: "OPEN",
        OR: [{ matchId: { in: ids } }, { battleRoundId: { in: roundIds } }],
      },
      data: {
        status: "VOIDED",
        resolution: "Affected by reviewed rollback; the result must be replayed or was corrected.",
        resolvedAt: new Date(),
      },
    });
    await tx.matchDispute.update({
      where: { id: disputeId },
      data: { status: "CORRECTED", resolution: reason, resolvedAt: new Date() },
    });
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { phase: "ONGOING", championId: null },
    });
    if (state.target) {
      requireCondition(!("results" in input), "Use a head-to-head result for this dispute.");
      const target = state.target;
      const remove = state.affected.filter(
        (m) =>
          (state.event.format === "SWISS" && target.bracket !== "TIEBREAK") ||
          (["ROUND_ROBIN", "LEAGUE"].includes(state.event.format) &&
            target.bracket !== "TIEBREAK" &&
            state.stages.find((s) => s.id === target.stageId)?.kind !== "PLAYOFF") ||
          (state.event.format === "GROUPS" && m.stageId !== target.stageId) ||
          (state.event.format === "DOUBLE_ELIMINATION" && m.bracket === "FINAL_RESET"),
      );
      const removeIds = remove.map((m) => m.id),
        reset = state.affected.filter((m) => !removeIds.includes(m.id));
      const all = await tx.match.findMany({ where: { tournamentId } });
      await tx.matchResult.deleteMany({ where: { matchId: { in: ids } } });
      await tx.matchReport.updateMany({
        where: { matchId: { in: ids }, status: "PENDING" },
        data: { status: "VOIDED" },
      });
      const affectedStages = [
        ...new Set(
          [target.stageId, ...state.affected.map((m) => m.stageId)].filter((id): id is string =>
            Boolean(id),
          ),
        ),
      ];
      await tx.tournamentStage.updateMany({
        where: { id: { in: affectedStages } },
        data: { completed: false },
      });
      for (const match of reset) {
        const legacy = state.event.format === "SINGLE_ELIMINATION" || match.bracket === "TIEBREAK";
        const a =
          match.sourceAId ||
          (legacy
            ? all.find(
                (p) =>
                  p.stageId === match.stageId &&
                  p.round === match.round - 1 &&
                  p.position === match.position * 2,
              )?.id
            : undefined);
        const b =
          match.sourceBId ||
          (legacy
            ? all.find(
                (p) =>
                  p.stageId === match.stageId &&
                  p.round === match.round - 1 &&
                  p.position === match.position * 2 + 1,
              )?.id
            : undefined);
        await tx.match.update({
          where: { id: match.id },
          data: {
            ...cleared,
            status: match.scheduledAt ? "SCHEDULED" : "PENDING",
            version: { increment: 1 },
            teamAId: a && ids.includes(a) ? null : match.teamAId,
            teamBId: b && ids.includes(b) ? null : match.teamBId,
          },
        });
      }
      if (removeIds.length) {
        await tx.match.updateMany({
          where: { id: { in: removeIds } },
          data: { sourceAId: null, sourceBId: null },
        });
        await tx.match.deleteMany({ where: { id: { in: removeIds } } });
        await tx.tournamentStage.deleteMany({
          where: {
            id: { in: affectedStages.filter((id) => id !== target.stageId) },
            matches: { none: {} },
          },
        });
      }
      const restored = await tx.match.update({
        where: { id: target.id },
        data: {
          ...cleared,
          status: target.scheduledAt ? "SCHEDULED" : "PENDING",
          version: { increment: 1 },
        },
      });
      const event = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
      const resultInput = { ...input, expectedVersion: undefined };
      await recordConfirmed(tx, event, restored, actor, resultInput);
    } else {
      requireCondition("results" in input, "Submit the corrected complete lobby results.");
      battleResultsSchema.parse(input);
      const target = state.battle!;
      requireCondition(
        input.results.length === target.participantIds.length &&
          input.results.every((r) => target.participantIds.includes(r.teamId)),
        "Correct every participant in the disputed round.",
      );
      await tx.battleRoundResult.deleteMany({ where: { roundId: { in: roundIds } } });
      for (const round of state.affectedRounds) {
        if (round.isTiebreak) await tx.battleRound.delete({ where: { id: round.id } });
        else
          await tx.battleRound.update({
            where: { id: round.id },
            data: {
              status: round.scheduledAt ? "SCHEDULED" : "PENDING",
              completedAt: null,
              version: { increment: 1 },
            },
          });
      }
      await tx.battleRoundResult.createMany({
        data: input.results.map((r) => ({ ...r, roundId: target.id })),
      });
      await tx.battleRound.update({
        where: { id: target.id },
        data: { status: "COMPLETED", completedAt: new Date(), version: { increment: 1 } },
      });
      await tx.tournamentStage.updateMany({ where: { tournamentId }, data: { completed: false } });
      await finishBattle(
        tx,
        await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } }),
      );
      await history(
        tx,
        tournamentId,
        actor,
        "battle.result.corrected",
        { roundId: target.id, results: input.results },
        target.id,
        reason,
      );
    }
    const result = { ok: true as const };
    await remember(tx, tournamentId, actor, key, payload, result);
    return result;
  });
}
