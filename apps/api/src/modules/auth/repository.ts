import type { Role } from "@prisma/client";
import { db, publicUser, type Tx } from "../../database/client.js";
export const selfUser = {
  ...publicUser,
  email: true,
  roles: true,
  platformRole: true,
  emailVerifiedAt: true,
  verificationRequired: true,
  displayName: true,
  bio: true,
  region: true,
  gamesPlayed: true,
  socialLinks: true,
  profilePublic: true,
  showHistory: true,
  showTeams: true,
  avatarId: true,
  status: true,
} as const;
export const findLogin = (email: string) => db.user.findUnique({ where: { email } });
export const insertAccount = (
  tx: Tx,
  input: { username: string; email: string; role: Role; passwordHash: string },
) => tx.user.create({ data: input, select: selfUser });
export async function rotateSession(
  tx: Tx,
  data: { userId: string; tokenHash: string; expiresAt: Date; authenticatedAt?: Date },
  previousHash?: string,
) {
  if (previousHash) await tx.session.deleteMany({ where: { tokenHash: previousHash } });
  await tx.session.create({ data });
}
export const deleteSession = (tokenHash: string) => db.session.deleteMany({ where: { tokenHash } });
export const findSession = (tokenHash: string) =>
  db.session.findUnique({
    where: { tokenHash },
    include: { user: { select: selfUser } },
  });
