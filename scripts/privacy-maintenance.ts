import { cleanupRetention } from "../apps/api/src/modules/administration/privacy.js";
import { db } from "../apps/api/src/database/client.js";
try {
  console.log(JSON.stringify(await cleanupRetention(process.argv.includes("--apply"))));
} finally {
  await db.$disconnect();
}
