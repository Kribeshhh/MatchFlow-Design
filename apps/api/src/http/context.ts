import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}
export const requestContext: RequestHandler = (req, res, next) => {
  // Server-owned IDs prevent untrusted correlation data or log injection.
  req.requestId = randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  const start = performance.now();
  res.on("finish", () =>
    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        route: req.route?.path || "unmatched",
        status: res.statusCode,
        durationMs: Math.round(performance.now() - start),
      },
      "request completed",
    ),
  );
  next();
};
