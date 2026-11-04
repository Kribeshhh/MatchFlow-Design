import { logger } from "../../http/logger.js";
import { Router } from "express";
import { z } from "zod";
import * as schema from "../../../../../packages/shared/src/auth.js";
import { authLimit } from "../../http/limits.js";
import { cookieName, cookieOptions, removeSession, requireAuth } from "./security.js";
import { recentAuth } from "./policy.js";
import * as service from "./service.js";
import * as account from "./account.js";
import { mailDelivery, type MailDelivery } from "./mail.js";
import { requestLink, consumeLink } from "./recovery.js";
import {
  googleProvider,
  beginGoogle,
  finishGoogle,
  unlinkGoogle,
  type GoogleProvider,
} from "./google.js";
import { env } from "../../config/env.js";
import { db } from "../../database/client.js";
export function createAuthRouter(
  mail: MailDelivery = mailDelivery,
  google: GoogleProvider = googleProvider,
) {
  const router = Router();
  router.get("/auth/options", (_req, res) =>
    res.json({ email: mail.available, google: google.available }),
  );
  router.get("/auth/me", (req, res) => res.json({ user: req.account || null }));
  router.post("/auth/register", authLimit, async (req, res) => {
    const input = schema.registerSchema.parse(req.body);
    const result = await service.register(
      input,
      typeof req.cookies[cookieName] === "string" ? req.cookies[cookieName] : undefined,
    );
    res.cookie(cookieName, result.token, { ...cookieOptions, expires: result.expiresAt });
    if (mail.available)
      await requestLink(input.email, "VERIFY_EMAIL", mail).catch(() =>
        logger.error("Registration verification delivery failed"),
      );
    res.status(201).json({ user: result.user });
  });
  router.post("/auth/login", authLimit, async (req, res) => {
    const result = await service.login(
      schema.loginSchema.parse(req.body),
      typeof req.cookies[cookieName] === "string" ? req.cookies[cookieName] : undefined,
    );
    res.cookie(cookieName, result.token, { ...cookieOptions, expires: result.expiresAt });
    res.json({ user: result.user });
  });
  router.post("/auth/logout", async (req, res) => {
    await removeSession(req, res);
    res.json({ ok: true });
  });
  for (const [path, purpose] of [
    ["forgot-password", "RESET_PASSWORD"],
    ["reactivation", "REACTIVATE"],
  ] as const)
    router.post(`/auth/${path}`, authLimit, async (req, res) =>
      res.json(await requestLink(schema.emailSchema.parse(req.body).email, purpose, mail)),
    );
  router.post("/auth/verification", authLimit, requireAuth, async (req, res) =>
    res.json(await requestLink(req.account!.email, "VERIFY_EMAIL", mail)),
  );
  router.post("/auth/verify-email", authLimit, async (req, res) =>
    res.json(await consumeLink(schema.tokenSchema.parse(req.body).token, "VERIFY_EMAIL")),
  );
  router.post("/auth/reactivate", authLimit, async (req, res) =>
    res.json(await consumeLink(schema.tokenSchema.parse(req.body).token, "REACTIVATE")),
  );
  router.post("/auth/reset-password", authLimit, async (req, res) => {
    const input = schema.resetSchema.parse(req.body);
    const result = await consumeLink(input.token, "RESET_PASSWORD", input.password);
    res.clearCookie(cookieName, cookieOptions);
    res.json(result);
  });
  router.post("/auth/reauthenticate", authLimit, requireAuth, async (req, res) =>
    res.json(
      await account.reauthenticate(
        req.account!.id,
        req.sessionHash!,
        schema.reauthenticateSchema.parse(req.body).password,
      ),
    ),
  );
  router.get("/account", requireAuth, async (req, res) =>
    res.json({
      user: await account.profile(req.account!.id),
      googleLinked: Boolean(
        await db.oAuthAccount.findUnique({
          where: { userId_provider: { userId: req.account!.id, provider: "google" } },
        }),
      ),
    }),
  );
  router.patch("/account", requireAuth, async (req, res) =>
    res.json({
      user: await account.updateProfile(req.account!.id, schema.profileSchema.parse(req.body)),
    }),
  );
  router.post("/account/password", authLimit, requireAuth, recentAuth, async (req, res) => {
    const input = schema.passwordChangeSchema.parse(req.body);
    const result = await account.changePassword(
      req.account!.id,
      input.password,
      input.currentPassword,
    );
    res.clearCookie(cookieName, cookieOptions);
    res.json(result);
  });
  router.get("/account/sessions", requireAuth, async (req, res) =>
    res.json(await account.sessions(req.account!.id, req.sessionId!)),
  );
  router.delete("/account/sessions/:id", requireAuth, recentAuth, async (req, res) =>
    res.json(
      await account.revokeSession(req.account!.id, z.string().min(1).max(100).parse(req.params.id)),
    ),
  );
  router.post("/account/sessions/revoke-others", requireAuth, recentAuth, async (req, res) =>
    res.json(await account.revokeOthers(req.account!.id, req.sessionHash!)),
  );
  for (const [path, deletion] of [
    ["deactivate", false],
    ["deletion", true],
  ] as const)
    router.post(`/account/${path}`, authLimit, requireAuth, recentAuth, async (req, res) => {
      const result = await account.deactivate(req.account!.id, deletion);
      res.clearCookie(cookieName, cookieOptions);
      res.json(result);
    });
  router.post("/auth/google/start", authLimit, async (_req, res) => {
    const flow = await beginGoogle(google);
    res.cookie("matchflow_oauth", flow.browser, { ...cookieOptions, maxAge: 10 * 60000 });
    res.json({ url: flow.url });
  });
  router.post("/account/google/link", authLimit, requireAuth, recentAuth, async (req, res) => {
    const flow = await beginGoogle(google, req.account!.id, req.sessionHash);
    res.cookie("matchflow_oauth", flow.browser, { ...cookieOptions, maxAge: 10 * 60000 });
    res.json({ url: flow.url });
  });
  router.delete("/account/google", authLimit, requireAuth, recentAuth, async (req, res) => {
    const result = await unlinkGoogle(req.account!.id);
    res.clearCookie(cookieName, cookieOptions);
    res.json(result);
  });
  router.get("/auth/google/callback", authLimit, async (req, res) => {
    res.clearCookie("matchflow_oauth", cookieOptions);
    try {
      const result = await finishGoogle(
        google,
        new URL(req.originalUrl, env.APP_ORIGIN),
        req.cookies.matchflow_oauth,
        req.sessionHash,
      );
      res.cookie(cookieName, result.token, { ...cookieOptions, expires: result.expiresAt });
      res.redirect(`${env.APP_ORIGIN}/account`);
    } catch {
      res.redirect(`${env.APP_ORIGIN}/login?oauth=failed`);
    }
  });
  return router;
}
