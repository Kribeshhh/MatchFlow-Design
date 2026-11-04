import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { env } from "../../config/env.js";
import { requireCondition } from "../../database/client.js";
export const webhookAvailable = () => Boolean(env.WEBHOOK_ENCRYPTION_KEY);
function master() {
  requireCondition(env.WEBHOOK_ENCRYPTION_KEY, "Webhook signing is not configured.", 503);
  return Buffer.from(env.WEBHOOK_ENCRYPTION_KEY, "hex");
}
export function sealSecret(secret: string, endpointId: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", master(), iv);
  cipher.setAAD(Buffer.from(endpointId));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64")).join(".");
}
export function openSecret(value: string, endpointId: string) {
  const [iv, tag, data] = value.split(".").map((s) => Buffer.from(s, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", master(), iv);
  cipher.setAAD(Buffer.from(endpointId));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export const newSigningSecret = () => `whsec_${randomBytes(32).toString("base64")}`;
