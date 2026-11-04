import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { db } from "./database/client.js";
import { logger } from "./http/logger.js";
import { drainMail } from "./modules/auth/mail.js";
import { attachRealtime } from "./modules/realtime/server.js";
import { startNotifications } from "./modules/notifications/worker.js";
let stopping = false,
  queueReady = !env.NOTIFICATION_WORKER;
const server = createServer(createApp(() => stopping || !queueReady));
const live = attachRealtime(server);
const worker = env.NOTIFICATION_WORKER
  ? startNotifications().then((value) => {
      queueReady = true;
      return value;
    })
  : Promise.resolve(null);
worker.catch(() => {
  logger.error("Notification worker startup failed");
  void stop(1);
});
server.listen(env.PORT, env.HOST, () =>
  logger.info({ host: env.HOST, port: env.PORT }, "API listening"),
);
server.requestTimeout = 30000;
server.headersTimeout = 15000;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  logger.info("Shutdown started");
  server.close();
  server.closeIdleConnections();
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 20000);
  deadline.unref();
  try {
    await (await worker.catch(() => null))?.stop();
    await live.close();
    await drainMail();
    await db.$disconnect();
    clearTimeout(deadline);
    process.exitCode = code;
  } catch {
    logger.error("Shutdown failed");
    process.exitCode = 1;
  }
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
server.on("error", () => {
  logger.error("Server failed to listen");
  void stop(1);
});
