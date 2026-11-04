import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/env.js";
import { digest } from "./tokens.js";
import { deleteSession, findSession } from "./repository.js";
export const cookieName = "matchflow_session";
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
};
export type Account = {
  id: string;
  username: string;
  email: string;
  role: "PLAYER" | "ORGANIZER";
  roles: ("PLAYER" | "ORGANIZER")[];
  platformRole: "NONE" | "MODERATOR" | "ADMIN";
  emailVerifiedAt: Date | null;
  verificationRequired: boolean;
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "DELETION_PENDING" | "DELETED";
  displayName: string;
  bio: string;
};
declare global {
  namespace Express {
    interface Request {
      account?: Account;
      sessionHash?: string;
      sessionId?: string;
      authenticatedAt?: Date | null;
    }
  }
}
export async function removeSession(req: Request, res: Response) {
  const token = req.cookies[cookieName];
  if (typeof token === "string") await deleteSession(digest(token));
  res.clearCookie(cookieName, cookieOptions);
}
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies[cookieName];
  if (typeof token === "string" && token.length === 64) {
    const session = await findSession(digest(token));
    if (session && session.expiresAt > new Date() && session.user.status === "ACTIVE") {
      req.account = session.user;
      req.sessionHash = session.tokenHash;
      req.sessionId = session.id;
      req.authenticatedAt = session.authenticatedAt;
    }
  }
  next();
}

export { hashPassword, verifyPassword } from "./password.js";
export { requireAuth, role } from "./policy.js";
