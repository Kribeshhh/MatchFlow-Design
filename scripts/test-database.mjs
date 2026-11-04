// Shared guard for every command that mutates disposable test data.
export function testDatabase(input = process.env) {
  const target = new URL(input.TEST_DATABASE_URL || "file:///missing");
  const working = input.DATABASE_URL ? new URL(input.DATABASE_URL) : undefined;
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    !target.pathname.endsWith("_test")
  )
    throw new Error("Tests require an explicit loopback PostgreSQL database ending in _test.");
  if (
    working &&
    (target.port || "5432") === (working.port || "5432") &&
    target.pathname === working.pathname
  )
    throw new Error("Test database must differ from the working database.");
  return target;
}
