import * as oidc from "openid-client";
import { randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { db, transaction, requireCondition, ApiError } from "../../database/client.js";
import { audit } from "../administration/audit.js";
import { digest } from "./tokens.js";
import { selfUser, rotateSession } from "./repository.js";
import { sessionData } from "./service.js";
export type GoogleIdentity = { subject: string; email: string };
export type GoogleProvider = {
  available: boolean;
  start: (state: string, nonce: string, verifier: string) => Promise<string>;
  finish: (url: URL, state: string, nonce: string, verifier: string) => Promise<GoogleIdentity>;
};
let configuration: Promise<oidc.Configuration> | undefined;
const config = () =>
  (configuration ??= oidc
    .discovery(
      new URL("https://accounts.google.com"),
      env.GOOGLE_CLIENT_ID!,
      env.GOOGLE_CLIENT_SECRET!,
    )
    .then((c) => {
      oidc.enableNonRepudiationChecks(c);
      return c;
    })
    .catch((error) => {
      configuration = undefined;
      throw error;
    }));
const callback = () => `${env.APP_ORIGIN}/api/auth/google/callback`;
export function createGoogleProvider(
  getConfig: () => Promise<oidc.Configuration>,
  redirectUri: string,
  available = true,
): GoogleProvider {
  return {
    available,
    async start(state, nonce, verifier) {
      return oidc.buildAuthorizationUrl(await getConfig(), {
        redirect_uri: redirectUri,
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
        prompt: "select_account",
      }).href;
    },
    async finish(url, state, nonce, verifier) {
      const tokens = await oidc.authorizationCodeGrant(await getConfig(), url, {
        pkceCodeVerifier: verifier,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      requireCondition(
        claims &&
          claims.email_verified === true &&
          typeof claims.email === "string" &&
          claims.email.length <= 254 &&
          typeof claims.sub === "string",
        "Google identity could not be verified.",
        401,
      );
      return { subject: claims.sub, email: claims.email.trim().toLowerCase() };
    },
  };
}
export const googleProvider = createGoogleProvider(
  config,
  callback(),
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
);
export async function beginGoogle(provider: GoogleProvider, userId?: string, sessionHash?: string) {
  if (!provider.available) throw new ApiError(503, "Google sign-in is not configured.");
  const state = oidc.randomState(),
    nonce = oidc.randomNonce(),
    verifier = oidc.randomPKCECodeVerifier(),
    browser = randomBytes(32).toString("hex");
  const url = await provider.start(state, nonce, verifier);
  await db.oAuthFlow.create({
    data: {
      stateHash: digest(state),
      browserHash: digest(browser),
      nonce,
      verifier,
      userId,
      sessionHash,
      expiresAt: new Date(Date.now() + 10 * 60000),
    },
  });
  return { url, browser };
}
export async function finishGoogle(
  provider: GoogleProvider,
  url: URL,
  browser: string | undefined,
  currentHash?: string,
) {
  requireCondition(provider.available && browser, "Google sign-in could not be completed.", 401);
  const state = url.searchParams.get("state");
  requireCondition(state, "Google sign-in could not be completed.", 401);
  const flow = await transaction(async (tx) => {
    const f = await tx.oAuthFlow.findUnique({ where: { stateHash: digest(state) } });
    requireCondition(
      f && f.browserHash === digest(browser) && f.expiresAt > new Date(),
      "Google sign-in could not be completed.",
      401,
    );
    requireCondition(
      !f.userId || f.sessionHash === currentHash,
      "Please sign in again before linking.",
      401,
    );
    await tx.oAuthFlow.delete({ where: { stateHash: f.stateHash } });
    return f;
  });
  const identity = await provider.finish(url, state, flow.nonce, flow.verifier);
  return acceptGoogleIdentity(identity, flow.userId, flow.sessionHash, currentHash);
}
// Called only after openid-client validates issuer, signature, audience, nonce, state and PKCE.
export async function acceptGoogleIdentity(
  identity: GoogleIdentity,
  linkUserId: string | null,
  linkSessionHash: string | null,
  currentHash?: string,
) {
  return transaction(async (tx) => {
    const linked = await tx.oAuthAccount.findUnique({
      where: { provider_subject: { provider: "google", subject: identity.subject } },
      include: { user: true },
    });
    let user;
    if (linkUserId) {
      const session = linkSessionHash
        ? await tx.session.findUnique({ where: { tokenHash: linkSessionHash } })
        : null;
      requireCondition(
        session &&
          session.userId === linkUserId &&
          session.tokenHash === currentHash &&
          session.expiresAt > new Date() &&
          session.authenticatedAt &&
          Date.now() - session.authenticatedAt.getTime() < 5 * 60000,
        "Please reauthenticate before linking.",
        401,
      );
      user = await tx.user.findUniqueOrThrow({ where: { id: linkUserId } });
      requireCondition(
        user.status === "ACTIVE" && user.emailVerifiedAt,
        "Verify your account email before linking.",
        403,
      );
      requireCondition(
        !linked || linked.userId === user.id,
        "This Google account cannot be linked.",
        409,
      );
      if (!linked)
        await tx.oAuthAccount.create({
          data: { userId: user.id, provider: "google", subject: identity.subject },
        });
    } else if (linked) {
      user = linked.user;
    } else {
      // Never merge accounts using an email claim. Existing users must authenticate and explicitly link.
      requireCondition(
        !(await tx.user.findUnique({ where: { email: identity.email } })),
        "Sign in with your existing account, then link Google in account settings.",
        409,
      );
      user = await tx.user.create({
        data: {
          email: identity.email,
          username: `player_${randomBytes(8).toString("hex")}`,
          role: "PLAYER",
          emailVerifiedAt: new Date(),
          oauthAccounts: { create: { provider: "google", subject: identity.subject } },
        },
      });
    }
    requireCondition(user.status === "ACTIVE", "Unable to sign in.", 401);
    const session = sessionData(user.id);
    await rotateSession(tx, session.data, currentHash);
    await audit(
      tx,
      user.id,
      linkUserId ? "identity.google.linked" : "identity.google.login",
      "User",
      user.id,
    );
    return {
      user: await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: selfUser }),
      token: session.token,
      expiresAt: session.data.expiresAt,
    };
  });
}
export async function unlinkGoogle(userId: string) {
  return transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    requireCondition(user.passwordHash, "Set a password before unlinking Google.");
    await tx.oAuthAccount.deleteMany({ where: { userId, provider: "google" } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.oAuthFlow.deleteMany({ where: { userId } });
    await audit(tx, userId, "identity.google.unlinked", "User", userId);
    return { ok: true };
  });
}
