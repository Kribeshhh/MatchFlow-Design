import { db } from "../apps/api/src/database/client.js";
const now = new Date();
try {
  const rows = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.identityToken.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.oAuthFlow.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.authThrottle.deleteMany({ where: { resetsAt: { lte: now } } }),
  ]);
  console.log(
    "Expired identity records removed:",
    rows.reduce((sum, r) => sum + r.count, 0),
  );
} finally {
  await db.$disconnect();
}
