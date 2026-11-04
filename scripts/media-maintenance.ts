import { db } from "../apps/api/src/database/client.js";
import { createStorage } from "../apps/api/src/modules/media/storage.js";
import { cleanupMedia } from "../apps/api/src/modules/media/service.js";
try {
  const storage = createStorage();
  if (!storage) throw Error("Storage not configured");
  console.log(
    `Removed ${await cleanupMedia(storage)} unreferenced media objects older than 24 hours.`,
  );
} catch {
  console.error("Media cleanup failed. Check storage configuration and access.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
