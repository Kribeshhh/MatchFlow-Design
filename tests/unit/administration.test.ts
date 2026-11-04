import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caseInput,
  reviewInput,
  otpInput,
  adminQuery,
} from "../../packages/shared/src/administration.js";
test("moderation contracts reject mass assignment, unbounded inputs and mismatched support targets", () => {
  const report = {
    targetType: "SUPPORT",
    category: "SUPPORT",
    description: "A support request for the operator",
  };
  assert.equal(caseInput.safeParse(report).success, true);
  for (const body of [
    { ...report, reporterId: "other" },
    { ...report, targetId: "other" },
    { ...report, targetType: "USER" },
    { ...report, description: "x".repeat(4001) },
  ])
    assert.equal(caseInput.safeParse(body).success, false);
  assert.equal(
    reviewInput.safeParse({ action: "SUSPEND", reason: "Reviewed evidence", expectedVersion: 0 })
      .success,
    true,
  );
  assert.equal(
    reviewInput.safeParse({
      action: "GRANT_ADMIN",
      reason: "Reviewed evidence",
      expectedVersion: 0,
    }).success,
    false,
  );
  assert.equal(adminQuery.safeParse({ page: 0 }).success, false);
  assert.equal(adminQuery.safeParse({ page: 1001 }).success, false);
  assert.equal(otpInput.safeParse({ otp: "123456", userId: "other" }).success, false);
  assert.equal(otpInput.safeParse({ otp: "123456" }).success, true);
});
