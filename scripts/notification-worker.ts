import { startNotifications } from "../apps/api/src/modules/notifications/worker.js";
import { db } from "../apps/api/src/database/client.js";
import { drainMail } from "../apps/api/src/modules/auth/mail.js";
import { logger } from "../apps/api/src/http/logger.js";
const worker = startNotifications();
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 20000);
  deadline.unref();
  try {
    await (await worker.catch(() => null))?.stop();
    await drainMail();
    await db.$disconnect();
    clearTimeout(deadline);
    process.exitCode = code;
  } catch {
    logger.error("Notification worker shutdown failed");
    process.exitCode = 1;
  }
}
worker.catch(() => {
  logger.error("Notification worker startup failed");
  void stop(1);
});
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
