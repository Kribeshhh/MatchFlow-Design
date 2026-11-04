import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { db, ApiError } from "../../database/client.js";
import { env } from "../../config/env.js";
import { canonicalHost, requestHostname } from "./hostname.js";
declare global {
  namespace Express {
    interface Request {
      tenantOrganizationId?: string;
    }
  }
}
export const tenantBoundary: RequestHandler = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (canonicalHost(req.headers.host)) {
    next();
    return;
  }
  const name = requestHostname(req.headers.host),
    secret = req.get("X-MatchFlow-Origin");
  if (
    !name ||
    !env.PORTAL_ORIGIN_SECRET ||
    !/^[a-f0-9]{64}$/.test(secret || "") ||
    !secret ||
    secret.length !== env.PORTAL_ORIGIN_SECRET.length ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(env.PORTAL_ORIGIN_SECRET))
  )
    throw new ApiError(421, "This hostname is not available.");
  const domain = await db.customDomain.findFirst({
    where: {
      hostname: name,
      removedAt: null,
      status: "ACTIVE",
      providerStatus: "active",
      certificateStatus: "active",
      verifiedAt: { not: null },
      checkedAt: { gt: new Date(Date.now() - 15 * 60000) },
      organization: { portal: { enabled: true } },
    },
    select: { organizationId: true },
  });
  if (!domain) throw new ApiError(421, "This hostname is not available.");
  req.tenantOrganizationId = domain.organizationId;
  res.set("Referrer-Policy", "no-referrer");
  // Cookies/Bearer/tenant-ID headers never reach global account or developer routes here.
  if (
    !["GET", "HEAD"].includes(req.method) ||
    (req.path.toLowerCase().startsWith("/api") &&
      !(req.path === "/api/portal" || req.path.startsWith("/api/portal/")))
  )
    throw new ApiError(404, "Portal route not found.");
  if (req.get("Origin") && req.get("Origin") !== `https://${name}`)
    throw new ApiError(403, "Request origin could not be verified.");
  next();
};
