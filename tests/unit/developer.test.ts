import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Webhook } from "standardwebhooks";
import {
  publicAddress,
  destination,
  resolveDestination,
} from "../../apps/api/src/modules/api-access/webhook-transport.js";
import { sealSecret, openSecret } from "../../apps/api/src/modules/api-access/webhook-secrets.js";
import { env } from "../../apps/api/src/config/env.js";
test("SSRF rejects nonpublic IPv4/IPv6, mapped IPs, metadata, credentials and alternate ports", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.2",
    "169.254.169.254",
    "0.0.0.0",
    "100.100.100.200",
    "224.1.1.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "192.0.2.1",
  ]) {
    assert.equal(publicAddress(address), false, address);
  }
  for (const url of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com:8443",
    "https://localhost",
    "https://example.com/?token=secret",
    "https://example.com/#fragment",
  ])
    assert.throws(() => destination(url), url);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  const resolver = (async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]) as unknown as Parameters<typeof resolveDestination>[1];
  await assert.rejects(resolveDestination("https://example.com/hooks", resolver));
});
test("Standard Webhooks rejects tampering and expired timestamps; encrypted signing keys bind endpoint", () => {
  const secret = `whsec_${randomBytes(32).toString("base64")}`,
    webhook = new Webhook(secret),
    body = '{"type":"match.completed"}',
    now = new Date(),
    id = "delivery_1";
  const headers = {
    "webhook-id": id,
    "webhook-timestamp": Math.floor(now.getTime() / 1000).toString(),
    "webhook-signature": webhook.sign(id, now, body),
  };
  assert.deepEqual(webhook.verify(body, headers), { type: "match.completed" });
  assert.throws(() => webhook.verify(body + " ", headers));
  assert.throws(() => webhook.verify(body, { ...headers, "webhook-id": "different" }));
  const old = new Date(Date.now() - 600000);
  assert.throws(() =>
    webhook.verify(body, {
      ...headers,
      "webhook-timestamp": Math.floor(old.getTime() / 1000).toString(),
      "webhook-signature": webhook.sign(id, old, body),
    }),
  );
  const previous = env.WEBHOOK_ENCRYPTION_KEY;
  env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  try {
    const sealed = sealSecret(secret, "endpoint_1");
    assert.ok(!sealed.includes(secret));
    assert.equal(openSecret(sealed, "endpoint_1"), secret);
    assert.throws(() => openSecret(sealed, "endpoint_2"));
  } finally {
    env.WEBHOOK_ENCRYPTION_KEY = previous;
  }
});
