import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import { db, ApiError } from "./db.js";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(key, Buffer.from(hex, "hex"));
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const cookieName = "matchflow_session";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
export type Account = {
  id: string;
  username: string;
  email: string;
  role: "PLAYER" | "ORGANIZER";
};
declare global {
  namespace Express {
    interface Request {
      account?: Account;
    }
  }
}
export async function createSession(res: Response, userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.session.create({
    data: { tokenHash: digest(token), userId, expiresAt },
  });
  res.cookie(cookieName, token, { ...cookieOptions, expires: expiresAt });
}
export async function removeSession(req: Request, res: Response) {
  const token = req.cookies[cookieName];
  if (typeof token === "string")
    await db.session.deleteMany({ where: { tokenHash: digest(token) } });
  res.clearCookie(cookieName, cookieOptions);
}
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = req.cookies[cookieName];
  if (typeof token === "string" && token.length === 64) {
    const session = await db.session.findUnique({
      where: { tokenHash: digest(token) },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
      },
    });
    if (session && session.expiresAt > new Date()) req.account = session.user;
  }
  next();
}
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.account) throw new ApiError(401, "Please log in to continue.");
  next();
}
export function role(required: Account["role"]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.account) throw new ApiError(401, "Please log in to continue.");
    if (req.account.role !== required)
      throw new ApiError(
        403,
        `This action requires a ${required.toLowerCase()} account.`,
      );
    next();
  };
}
