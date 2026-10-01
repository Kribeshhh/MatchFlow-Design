import { app } from "./app.js";
import { db } from "./db.js";
const server = app.listen(Number(process.env.PORT || 3001), "127.0.0.1", () =>
  console.log("MatchFlow API ready at http://localhost:3001"),
);
async function stop() {
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
