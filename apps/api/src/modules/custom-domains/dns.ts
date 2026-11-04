import { Resolver } from "node:dns/promises";
import { env } from "../../config/env.js";
import { publicAddress } from "../api-access/webhook-transport.js";
export type DomainDNS = {
  txt: (name: string) => Promise<string[][]>;
  cname: (name: string) => Promise<string[]>;
  addresses: (name: string) => Promise<string[]>;
};
const resolver = new Resolver({ timeout: 2500, tries: 1 });
export const domainDNS: DomainDNS = {
  txt: (name) => resolver.resolveTxt(name),
  cname: (name) => resolver.resolveCname(name),
  addresses: async (name) =>
    (await Promise.allSettled([resolver.resolve4(name), resolver.resolve6(name)])).flatMap((r) =>
      r.status === "fulfilled" ? r.value : [],
    ),
};
export async function verifyDNS(name: string, challenge: string, dns = domainDNS) {
  try {
    const txt = await dns.txt(`_matchflow-challenge.${name}`);
    if (txt.length > 100 || !txt.some((record) => record.join("") === challenge)) return false;
    const target = env.PORTAL_CNAME_TARGET;
    if (!target) return false;
    const cnames = await dns.cname(name).catch(() => []);
    if (cnames.length === 1 && cnames[0].toLowerCase().replace(/\.$/, "") === target) return true;
    // Apex flattening is supported only against explicit provider-assigned apex IPs.
    if (!env.PORTAL_APEX_ADDRESSES.length) return false;
    const addresses = await dns.addresses(name);
    return (
      addresses.length > 0 &&
      addresses.every((a) => publicAddress(a) && env.PORTAL_APEX_ADDRESSES.includes(a))
    );
  } catch {
    return false;
  }
}
