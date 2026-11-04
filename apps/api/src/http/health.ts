import { Router } from "express";
import { db } from "../database/client.js";
export function healthRouter(
  isShuttingDown: () => boolean = () => false,
  probe: () => Promise<unknown> = () => db.$queryRaw`SELECT 1`,
) {
  const router = Router();
  router.get("/live", (_req, res) => res.json({ status: "ok" }));
  router.get(["/health", "/ready"], async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (isShuttingDown()) {
      res.status(503).json({ status: "unavailable" });
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        probe(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), 2000);
        }),
      ]);
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    } finally {
      clearTimeout(timer);
    }
  });
  return router;
}
