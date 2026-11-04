import assert from "node:assert/strict";
import { test } from "node:test";
import { testDatabase } from "../../scripts/test-database.mjs";
test("disposable database guard rejects working aliases, defaults and nonlocal targets", () => {
  for (const input of [
    {},
    { TEST_DATABASE_URL: "postgresql://remote.example/a_test" },
    { TEST_DATABASE_URL: "postgresql://localhost/production" },
    {
      TEST_DATABASE_URL: "postgresql://localhost:5432/a_test",
      DATABASE_URL: "postgresql://127.0.0.1/a_test",
    },
    {
      TEST_DATABASE_URL: "postgresql://localhost/a_test",
      DATABASE_URL: "postgresql://localhost:5432/a_test",
    },
  ])
    assert.throws(() => testDatabase(input));
  assert.equal(
    testDatabase({
      TEST_DATABASE_URL: "postgresql://localhost/a_test",
      DATABASE_URL: "postgresql://localhost/a_dev",
    }).pathname,
    "/a_test",
  );
});
