import { audit } from "../administration/audit.js";
import { throttle } from "./throttle.js";
import { db } from "../../database/client.js";
import { selfUser } from "./repository.js";
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { loginSchema, registerSchema } from "../../../../../packages/shared/src/validation.js";
import { requireCondition, transaction } from "../../database/client.js";
import * as repo from "./repository.js";
import { hashPassword, verifyPassword, needsUpgrade } from "./password.js";
import { digest } from "./tokens.js";
const dummy = hashPassword(randomBytes(32).toString("hex"));
export function sessionData(userId: string) {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    data: {
      userId,
      authenticatedAt: new Date(),
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  };
}
export async function register(input: z.infer<typeof registerSchema>, previous?: string) {
  const passwordHash = await hashPassword(input.password);
  return transaction(async (tx) => {
    const user = await repo.insertAccount(tx, {
      username: input.username,
      email: input.email,
      role: input.role,
      passwordHash,
    });
    const session = sessionData(user.id);
    await repo.rotateSession(tx, session.data, previous ? digest(previous) : undefined);
    await audit(tx, user.id, "identity.registered", "User", user.id);
    return { user, token: session.token, expiresAt: session.data.expiresAt };
  });
}
export async function login(input: z.infer<typeof loginSchema>, previous?: string) {
  await throttle("login", input.email, 20);
  const user = await repo.findLogin(input.email);
  const valid = await verifyPassword(input.password, user?.passwordHash || (await dummy));
  if (!user || !valid || user.status !== "ACTIVE")
    await db.auditEvent.create({
      data: {
        action: "identity.login.failed",
        resourceType: "Authentication",
        resourceId: "login",
      },
    });
  requireCondition(
    user && valid && user.status === "ACTIVE",
    "Email or password is incorrect.",
    401,
  );
  const upgraded =
    user.passwordHash && needsUpgrade(user.passwordHash)
      ? await hashPassword(input.password)
      : undefined;
  const session = sessionData(user.id);
  await transaction(async (tx) => {
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    requireCondition(
      fresh.status === "ACTIVE" && fresh.passwordHash === user.passwordHash,
      "Email or password is incorrect.",
      401,
    );
    if (upgraded)
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: upgraded } });
    await audit(tx, user.id, "identity.login", "User", user.id);
    await repo.rotateSession(tx, session.data, previous ? digest(previous) : undefined);
  });
  return {
    user: await db.user.findUniqueOrThrow({ where: { id: user.id }, select: selfUser }),
    token: session.token,
    expiresAt: session.data.expiresAt,
  };
}
