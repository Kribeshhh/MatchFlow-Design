import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnvironment } from "../../apps/api/src/config/env.js";
test("trusted proxy configuration rejects blanket and malformed trust", () => {
  const base = { DATABASE_URL: "postgresql://localhost/test" };
  for (const value of ["true", "1", "0.0.0.0/0", "::/0", "proxy.example", "10.0.0.0/99"])
    assert.throws(() => parseEnvironment({ ...base, TRUSTED_PROXIES: value }));
  assert.deepEqual(parseEnvironment(base).TRUSTED_PROXIES, []);
  assert.deepEqual(
    parseEnvironment({ ...base, TRUSTED_PROXIES: "127.0.0.1,10.20.0.0/24" }).TRUSTED_PROXIES,
    ["127.0.0.1", "10.20.0.0/24"],
  );
});
