import { db, transaction, requireCondition } from "../apps/api/src/database/client.js";
const index = process.argv.indexOf("--email"),
  email = index >= 0 ? process.argv[index + 1]?.trim().toLowerCase() : undefined;
try {
  requireCondition(
    email && process.argv.includes("--confirm"),
    "Provide --email and --confirm. This is an operator-only administrator grant.",
  );
  await transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email } });
    requireCondition(
      user?.status === "ACTIVE" && user.emailVerifiedAt,
      "Select an existing, verified active account.",
    );
    await tx.user.update({ where: { id: user.id }, data: { platformRole: "ADMIN" } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditEvent.create({
      data: {
        action: "identity.platform_admin.bootstrap",
        resourceType: "User",
        resourceId: user.id,
      },
    });
  });
  console.log("Administrator granted; existing sessions revoked. Sign in again.");
} catch {
  console.error(
    "Grant failed. Supply a verified active account and explicit confirmation; no credentials are printed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
