import { generateBattle } from "./battle.js";
import { generateLeague } from "./league.js";
import { generateGroups } from "./groups.js";
import { history, replay, remember } from "./commands.js";
import { seedParticipants, type Seeding } from "./seeding.js";
import type { Prisma } from "@prisma/client";
import { requireCondition, transaction } from "../../database/client.js";
import { audit } from "../administration/audit.js";
import { owned } from "../tournaments/policy.js";
import { doubleElimination } from "./double-elimination.js";
import { createPairRound, resolveDouble } from "./format-progression.js";
import { roundRobin, swissPairs } from "./formats.js";
import { seedOrder } from "./domain.js";
import { advance } from "./progression.js";
import * as repository from "./repository.js";
export async function generateBracket(
  tournamentId: string,
  owner: string,
  options: Seeding = {},
  requestKey?: string,
) {
  return transaction(async (tx) => {
    const t = await owned(tx, tournamentId, owner);
    const payload = { operation: "generate", tournamentId, options };
    const previous = await replay<Awaited<ReturnType<typeof repository.bracketMatches>>>(
      tx,
      owner,
      requestKey,
      payload,
    );
    if (previous) return previous;
    requireCondition(
      ["REGISTRATION", "PUBLISHED", "CHECK_IN"].includes(t.phase),
      "A bracket already exists.",
    );
    requireCondition(
      (await repository.matchCount(tx, tournamentId)) === 0,
      "A bracket already exists.",
    );
    const registrations = await repository.entries(tx, tournamentId);
    requireCondition(
      !registrations.some((r) => r.status === "PENDING"),
      "Approve or reject all pending registrations before generating the bracket.",
    );
    const teams = seedParticipants(
      registrations.filter((r) => r.status === "APPROVED"),
      options,
    );
    requireCondition(teams.length >= 2, "At least two approved teams are required.");
    if (t.checkInRequired) {
      requireCondition(
        t.phase === "CHECK_IN" && new Date() >= t.startsAt,
        "Start after the check-in window closes.",
      );
      requireCondition(
        teams.every((r) => r.checkedInAt),
        "Remove or resolve participants who have not checked in.",
      );
    }
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { seedOrder: teams.map((r) => r.teamId) },
    });
    if (["GROUPS", "LEAGUE", "BATTLE_ROYALE"].includes(t.format)) {
      if (t.format === "GROUPS")
        await generateGroups(
          tx,
          t,
          teams.map((r) => r.teamId),
        );
      else if (t.format === "LEAGUE")
        await generateLeague(
          tx,
          t,
          teams.map((r) => r.teamId),
        );
      else
        await generateBattle(
          tx,
          t,
          teams.map((r) => r.teamId),
        );
      await tx.tournament.update({ where: { id: tournamentId }, data: { phase: "ONGOING" } });
      const result = await repository.bracketMatches(tx, tournamentId);
      await history(tx, tournamentId, owner, "bracket.generated", {
        seeding: options.seeding || "REGISTRATION",
        teamIds: teams.map((r) => r.teamId),
      });
      await remember(tx, tournamentId, owner, requestKey, payload, result);
      return result;
    }
    if (t.format !== "SINGLE_ELIMINATION") {
      const stage = await tx.tournamentStage.create({
        data: {
          tournamentId,
          position: 0,
          format: t.format,
          participants: { create: teams.map((r, i) => ({ teamId: r.teamId, seed: i + 1 })) },
        },
      });
      const ids = teams.map((r) => r.teamId);
      if (t.format === "DOUBLE_ELIMINATION") {
        await tx.match.createMany({ data: doubleElimination(tournamentId, stage.id, ids) });
        await resolveDouble(tx, tournamentId);
      } else {
        const rounds = t.format === "ROUND_ROBIN" ? roundRobin(ids) : [swissPairs(ids, [])];
        for (const [r, pairs] of rounds.entries())
          await createPairRound(tx, tournamentId, stage.id, r + 1, t.format, pairs);
      }
      await tx.tournament.update({ where: { id: tournamentId }, data: { phase: "ONGOING" } });
      await audit(tx, owner, "bracket.generated", "Tournament", tournamentId);
      const result = await repository.bracketMatches(tx, tournamentId);
      await history(tx, tournamentId, owner, "bracket.generated", {
        seeding: options.seeding || "REGISTRATION",
        teamIds: teams.map((r) => r.teamId),
      });
      await remember(tx, tournamentId, owner, requestKey, payload, result);
      return result;
    }
    const size = 2 ** Math.ceil(Math.log2(teams.length));
    const order = seedOrder(size);
    const stage = await repository.createStage(tx, tournamentId);
    await tx.stageParticipant.createMany({
      data: teams.map((r, i) => ({ stageId: stage.id, teamId: r.teamId, seed: i + 1 })),
    });
    const rows: Prisma.MatchCreateManyInput[] = [];
    for (let round = 1, count = size / 2; count >= 1; round++, count /= 2) {
      for (let position = 0; position < count; position++) {
        const teamAId = round === 1 ? (teams[order[position * 2] - 1]?.teamId ?? null) : null;
        const teamBId = round === 1 ? (teams[order[position * 2 + 1] - 1]?.teamId ?? null) : null;
        const isBye = round === 1 && (!teamAId || !teamBId);
        rows.push({
          stageId: stage.id,
          tournamentId,
          round,
          position,
          teamAId,
          teamBId,
          isBye,
          status: isBye ? "COMPLETED" : "PENDING",
          winnerId: isBye ? teamAId || teamBId : null,
          completedAt: isBye ? new Date() : null,
        });
      }
    }
    const byes = await repository.persistBracket(tx, tournamentId, rows);
    for (const bye of byes) await advance(tx, bye);
    await audit(tx, owner, "bracket.generated", "Tournament", tournamentId);
    const result = await repository.bracketMatches(tx, tournamentId);
    await history(tx, tournamentId, owner, "bracket.generated", {
      seeding: options.seeding || "REGISTRATION",
      teamIds: teams.map((r) => r.teamId),
    });
    await remember(tx, tournamentId, owner, requestKey, payload, result);
    return result;
  });
}
