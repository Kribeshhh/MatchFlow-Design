import argon2 from "argon2";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export async function legacyHashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyLegacyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !/^[a-f0-9]{128}$/.test(hex || "")) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(key, Buffer.from(hex, "hex"));
}

const options = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const hashPassword = (password: string) => argon2.hash(password, options);
export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  try {
    return stored.startsWith("$argon2id$")
      ? await argon2.verify(stored, password)
      : await verifyLegacyPassword(password, stored);
  } catch {
    return false;
  }
}
export const needsUpgrade = (stored: string) =>
  !stored.startsWith("$argon2id$") || argon2.needsRehash(stored, options);
