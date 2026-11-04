import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { requireCondition } from "../../database/client.js";
export function destination(value: string) {
  const u = new URL(value);
  requireCondition(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.hash &&
      (!u.port || u.port === "443"),
    "Webhook destinations require HTTPS on port 443 without credentials or fragments.",
  );
  requireCondition(
    !u.search,
    "Webhook URLs cannot contain query credentials. Use the signing secret for authentication.",
  );
  requireCondition(
    !u.hostname.endsWith(".") && !["localhost", "metadata.google.internal"].includes(u.hostname),
    "Webhook destination is not allowed.",
  );
  return u;
}
export function publicAddress(address: string) {
  try {
    return ipaddr.parse(address).range() === "unicast";
  } catch {
    return false;
  }
}
export async function resolveDestination(value: string, resolve = lookup) {
  const u = destination(value);
  const hostname = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = await Promise.race([
    resolve(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(Error("DNS timeout")), 3000);
      timer.unref();
    }),
  ]);
  requireCondition(
    addresses.length > 0 &&
      addresses.length <= 16 &&
      addresses.every((a) => publicAddress(a.address)),
    "Webhook destination must resolve only to public addresses.",
  );
  return { url: u, address: addresses[0] };
}
// No redirects or ambient proxy. Pin the checked address while retaining TLS hostname verification.
export async function postWebhook(url: string, body: string, headers: Record<string, string>) {
  const target = await resolveDestination(url);
  return new Promise<number>((resolve, reject) => {
    const req = request(
      target.url,
      {
        method: "POST",
        agent: false,
        servername: target.url.hostname,
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "MatchFlow-Webhooks/1",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [target.address]);
          else callback(null, target.address.address, target.address.family);
        },
        signal: AbortSignal.timeout(8000),
        maxHeaderSize: 8192,
      },
      (res) => {
        const status = res.statusCode || 500;
        res.destroy(); // Response bodies are never retained or logged; redirects are not followed.
        resolve(status);
      },
    );
    req.on("error", () => reject(Error("Webhook delivery failed")));
    req.end(body);
  });
}
