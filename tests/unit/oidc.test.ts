import assert from "node:assert/strict";
import { test } from "node:test";
import * as oidc from "openid-client";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createGoogleProvider } from "../../apps/api/src/modules/auth/google.js";

test("Google adapter verifies signed tokens, state, nonce, issuer, audience, expiry and PKCE", async () => {
  const keys = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: "fixture", alg: "RS256", use: "sig" };
  const issuer = "https://accounts.google.com";
  const redirect = "https://matchflow.test/api/auth/google/callback";
  const state = oidc.randomState(),
    nonce = oidc.randomNonce(),
    verifier = oidc.randomPKCECodeVerifier();
  let mode = "valid";
  const config = new oidc.Configuration(
    {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
    },
    "fixture-client",
    "fixture-secret",
  );
  config[oidc.customFetch] = async (url, options) => {
    if (String(url).endsWith("/jwks")) return Response.json({ keys: [jwk] });
    assert.equal(new URLSearchParams(String(options?.body)).get("code_verifier"), verifier);
    const token = await new SignJWT({
      nonce: mode === "nonce" ? "wrong" : nonce,
      email: "fixture@test.invalid",
      email_verified: mode !== "unverified",
    })
      .setProtectedHeader({ alg: "RS256", kid: "fixture" })
      .setIssuer(mode === "issuer" ? "https://attacker.invalid" : issuer)
      .setAudience(mode === "audience" ? "wrong-client" : "fixture-client")
      .setSubject("fixture-subject")
      .setIssuedAt()
      .setExpirationTime(mode === "expired" ? Math.floor(Date.now() / 1000) - 600 : "5m")
      .sign(mode === "signature" ? other.privateKey : keys.privateKey);
    return Response.json({ access_token: "fixture-access", token_type: "Bearer", id_token: token });
  };
  oidc.enableNonRepudiationChecks(config);
  const provider = createGoogleProvider(async () => config, redirect);
  const authorization = new URL(await provider.start(state, nonce, verifier));
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    authorization.searchParams.get("code_challenge"),
    await oidc.calculatePKCECodeChallenge(verifier),
  );
  const callback = new URL(`${redirect}?code=fixture&state=${state}`);
  assert.deepEqual(await provider.finish(callback, state, nonce, verifier), {
    subject: "fixture-subject",
    email: "fixture@test.invalid",
  });
  await assert.rejects(provider.finish(callback, "wrong-state", nonce, verifier));
  for (const failure of ["nonce", "issuer", "audience", "expired", "signature", "unverified"]) {
    mode = failure;
    await assert.rejects(
      provider.finish(callback, state, nonce, verifier),
      `must reject ${failure}`,
    );
  }
});
