import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  hostname,
  requestHostname,
  canonicalHost,
} from "../../apps/api/src/modules/custom-domains/hostname.js";
import { verifyDNS } from "../../apps/api/src/modules/custom-domains/dns.js";
import { cloudflareProvider } from "../../apps/api/src/modules/custom-domains/provider.js";
import { env } from "../../apps/api/src/config/env.js";
import { portalSchema } from "../../packages/shared/src/portals.js";
test("hostname and theme contracts reject injection, IPs, wildcards and unsafe navigation", () => {
  for (const s of [
    "https://example.org",
    "*.example.org",
    "127.0.0.1",
    "[::1]",
    "localhost",
    "foo.local",
    "foo.example.org:443",
    "foo.example.org/path",
    "foo.example.org.",
    "evil.org@safe.org",
    "127.1",
  ]) {
    assert.throws(() => hostname(s), s);
  }
  assert.equal(hostname("PLAY.Example.org"), "play.example.org");
  assert.equal(hostname("bücher.de"), "xn--bcher-kva.de");
  assert.equal(requestHostname("example.org,evil.org"), null);
  assert.equal(canonicalHost("evil.org"), false);
  const input = {
    slug: "test-club",
    enabled: true,
    title: "Club",
    intro: "",
    accent: "#D3F45D",
    navigation: [],
    hideAttribution: false,
  };
  assert.ok(portalSchema.safeParse(input).success);
  assert.equal(portalSchema.safeParse({ ...input, accent: "#000000" }).success, false);
  assert.equal(
    portalSchema.safeParse({
      ...input,
      navigation: [{ label: "bad", target: "javascript:alert(1)" }],
    }).success,
    false,
  );
});
test("DNS verification requires the fresh TXT challenge and configured routing target", async () => {
  const previous = { target: env.PORTAL_CNAME_TARGET, addresses: env.PORTAL_APEX_ADDRESSES };
  env.PORTAL_CNAME_TARGET = "customers.matchflow.dev";
  const dns = {
    txt: async () => [["matchflow=", "fresh"]],
    cname: async () => ["customers.matchflow.dev."],
    addresses: async () => [],
  };
  try {
    assert.equal(await verifyDNS("events.example.org", "matchflow=fresh", dns), true);
    assert.equal(await verifyDNS("events.example.org", "matchflow=old", dns), false);
    assert.equal(
      await verifyDNS("events.example.org", "matchflow=fresh", {
        ...dns,
        cname: async () => ["attacker.org"],
      }),
      false,
    );
    env.PORTAL_APEX_ADDRESSES = ["127.0.0.1"];
    assert.equal(
      await verifyDNS("example.org", "matchflow=fresh", {
        ...dns,
        cname: async () => [],
        addresses: async () => ["127.0.0.1"],
      }),
      false,
    );
  } finally {
    env.PORTAL_CNAME_TARGET = previous.target;
    env.PORTAL_APEX_ADDRESSES = previous.addresses;
  }
});
test("Cloudflare adapter validates real response shape, TLS state and bounded secret-safe failures", async () => {
  const previous = { ...env };
  env.CLOUDFLARE_ZONE_ID = randomBytes(16).toString("hex");
  env.CLOUDFLARE_API_TOKEN = randomBytes(32).toString("hex");
  env.PORTAL_ORIGIN_SECRET = randomBytes(32).toString("hex");
  env.PORTAL_CNAME_TARGET = "customers.matchflow.dev";
  const id = randomUUID();
  const fixture = {
    id,
    hostname: "events.example.org",
    status: "active",
    ownership_verification: {
      type: "txt",
      name: "_cf-custom-hostname.events.example.org",
      value: "provider-token",
    },
    ssl: {
      status: "pending_validation",
      validation_records: [
        { txt_name: "_acme-challenge.events.example.org", txt_value: "certificate-token" },
      ],
    },
  };
  try {
    const api = cloudflareProvider(async (url, options) => {
      assert.ok(String(url).startsWith("https://api.cloudflare.com/client/v4/zones/"));
      assert.equal(options?.redirect, "error");
      assert.ok(options?.signal);
      return new Response(
        JSON.stringify({ success: true, result: options?.method === "POST" ? fixture : [fixture] }),
      );
    });
    const state = await api.create("events.example.org");
    assert.equal(state.certificateStatus, "pending_validation");
    assert.equal(state.records[0].type, "TXT");
    assert.equal(state.records[1].value, "certificate-token");
    assert.equal((await api.find("events.example.org"))?.id, id);
    const bad = cloudflareProvider(
      async () => new Response("secret internal details", { status: 500 }),
    );
    await assert.rejects(
      bad.find("events.example.org"),
      (e) => e instanceof Error && !e.message.includes("secret internal details"),
    );
    const oversize = cloudflareProvider(async () => new Response("x".repeat(150000)));
    await assert.rejects(oversize.find("events.example.org"));
  } finally {
    Object.assign(env, previous);
  }
});
