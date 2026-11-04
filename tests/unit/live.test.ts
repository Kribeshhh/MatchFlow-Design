import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldApplyVersion } from "../../packages/shared/src/live.js";
import { preferenceSchema, subscribeSchema } from "../../packages/shared/src/notifications.js";
test("live versions reject duplicates and out-of-order messages without losing integer precision", () => {
  assert(shouldApplyVersion(undefined, "1"));
  assert(!shouldApplyVersion("4", "4"));
  assert(!shouldApplyVersion("5", "4"));
  assert(shouldApplyVersion("9007199254740992", "9007199254740993"));
  assert(shouldApplyVersion("4", "4", true));
  assert(!shouldApplyVersion("1", "not-a-version"));
});
test("notification contracts reject impersonation and duplicate preferences", () => {
  assert(!subscribeSchema.safeParse({ tournamentId: "event", userId: "victim" }).success);
  assert(!subscribeSchema.safeParse({ tournamentId: "event", version: "-1" }).success);
  assert(
    !preferenceSchema.safeParse({ inApp: true, email: true, mutedKinds: ["RESULT", "RESULT"] })
      .success,
  );
  assert(preferenceSchema.safeParse({ inApp: true, email: false, mutedKinds: ["RESULT"] }).success);
});
