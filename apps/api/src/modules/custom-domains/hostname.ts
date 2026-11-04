import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import { env } from "../../config/env.js";
import { requireCondition } from "../../database/client.js";
export function hostname(value: string) {
  requireCondition(
    !/[\s/:@?#*\\%]/.test(value),
    "Enter a hostname without a scheme, path or port.",
  );
  const name = domainToASCII(value.toLowerCase());
  requireCondition(
    name.length <= 253 &&
      name.includes(".") &&
      /[a-z]/.test(name.split(".").at(-1) || "") &&
      !isIP(name) &&
      name.split(".").every((p) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p)),
    "Invalid public hostname.",
  );
  requireCondition(
    !/\.(localhost|local|internal|invalid|test|example|onion)$/.test(name),
    "Use a public domain you control.",
  );
  return name;
}
export function claimHostname(value: string) {
  const name = hostname(value);
  const reserved = [
    new URL(env.APP_ORIGIN).hostname,
    ...env.CLIENT_ORIGIN.map((v) => new URL(v).hostname),
    env.PORTAL_CNAME_TARGET,
  ].filter((v): v is string => Boolean(v));
  requireCondition(
    !reserved.some((base) => name === base || name.endsWith(`.${base}`)),
    "Platform hostnames cannot be claimed.",
  );
  return name;
}
export function requestHostname(value: string | undefined) {
  if (!value || /[\s,@/#?\\%]/.test(value)) return null;
  try {
    const u = new URL(`http://${value}`);
    if (u.host.toLowerCase() !== value.toLowerCase()) return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}
export function canonicalHost(host: string | undefined) {
  const name = requestHostname(host);
  return Boolean(
    name &&
    ([
      new URL(env.APP_ORIGIN).hostname,
      ...env.CLIENT_ORIGIN.map((v) => new URL(v).hostname),
    ].includes(name) ||
      (env.NODE_ENV !== "production" && ["127.0.0.1", "localhost", "[::1]"].includes(name))),
  );
}
