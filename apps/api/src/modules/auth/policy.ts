import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../../database/client.js";
import type { Account } from "./security.js";
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.account) throw new ApiError(401, "Please log in to continue.");
  next();
}
export function role(required: Account["role"]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.account) throw new ApiError(401, "Please log in to continue.");
    if (!req.account.roles.includes(required))
      throw new ApiError(403, `This action requires a ${required.toLowerCase()} account.`);
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.account.verificationRequired &&
      !req.account.emailVerifiedAt
    )
      throw new ApiError(403, "Verify your email before continuing.");
    next();
  };
}

export function recentAuth(req: Request, _res: Response, next: NextFunction) {
  if (
    !req.account ||
    !req.authenticatedAt ||
    Date.now() - req.authenticatedAt.getTime() > 5 * 60000
  )
    throw new ApiError(403, "Please reauthenticate before this action.");
  next();
}
export function platform(required: "MODERATOR" | "ADMIN") {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.account) throw new ApiError(401, "Please log in to continue.");
    if (
      !req.account.emailVerifiedAt ||
      (req.account.platformRole !== "ADMIN" && req.account.platformRole !== required)
    )
      throw new ApiError(403, "Permission denied.");
    next();
  };
}
