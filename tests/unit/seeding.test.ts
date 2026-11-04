import { test } from "node:test";
import assert from "node:assert/strict";
import { seedParticipants } from "../../apps/api/src/modules/brackets/seeding.js";
test("manual seeding validates an exact approved field and preserves registration input", () => {
  const entries = [{ teamId: "a" }, { teamId: "b" }, { teamId: "c" }];
  assert.deepEqual(seedParticipants(entries), entries);
  assert.deepEqual(
    seedParticipants(entries, { seeding: "MANUAL", teamIds: ["c", "a", "b"] }).map((e) => e.teamId),
    ["c", "a", "b"],
  );
  for (const ids of [
    ["a", "a", "b"],
    ["a", "b", "outsider"],
    ["a", "b"],
  ])
    assert.throws(() => seedParticipants(entries, { seeding: "MANUAL", teamIds: ids }));
  assert.throws(() => seedParticipants(entries, { teamIds: ["a", "b", "c"] }));
  assert.deepEqual(
    entries.map((e) => e.teamId),
    ["a", "b", "c"],
  );
});
test("random seeding is a permutation for every supported field size", () => {
  for (let n = 2; n <= 64; n++) {
    const entries = Array.from({ length: n }, (_, i) => ({ teamId: String(i) }));
    const result = seedParticipants(entries, { seeding: "RANDOM" });
    assert.deepEqual(result.map((e) => e.teamId).sort(), entries.map((e) => e.teamId).sort());
  }
});
