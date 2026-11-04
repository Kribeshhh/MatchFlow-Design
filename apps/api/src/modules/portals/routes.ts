import express, { Router } from "express";
import { z } from "zod";
import { db, requireCondition, ApiError } from "../../database/client.js";
import { env } from "../../config/env.js";
import { requireAuth } from "../auth/security.js";
import { recentAuth } from "../auth/policy.js";
import { throttle } from "../auth/throttle.js";
import { organizationAccess } from "../organizations/policy.js";
import {
  portalSchema,
  portalListQuery,
  domainInput,
} from "../../../../../packages/shared/src/portals.js";
import { savePortal, portalBySlug, portalByOrganization, publicPortal } from "./service.js";
import {
  claimDomain,
  requestRemoval,
  renewChallenge,
  reconcileDomain,
} from "../custom-domains/service.js";
import { domainAvailable } from "../custom-domains/provider.js";
import { readResource, tournamentProjection } from "../api-access/resources.js";
import { apiPageSchema } from "../../../../../packages/shared/src/developer.js";
import { createStorage, type ObjectStorage } from "../media/storage.js";
import { uploadImage, removeImage } from "../media/service.js";
const id = (v: unknown) => z.string().cuid().parse(v);
export function portalManagementRouter(storage: ObjectStorage | undefined = createStorage()) {
  const r = Router(),
    root = "/organizations/:orgId/portal",
    domains = "/organizations/:orgId/domains";
  r.get(root, requireAuth, async (req, res) => {
    await organizationAccess(id(req.params.orgId), req.account!.id);
    res.json({
      portal: await db.portal.findUnique({ where: { organizationId: id(req.params.orgId) } }),
      canHideAttribution: env.PORTAL_ALLOW_HIDE_ATTRIBUTION,
    });
  });
  r.put(root, requireAuth, recentAuth, async (req, res) => {
    await throttle("portal-edit", req.account!.id, 30, 60000);
    res.json(await savePortal(id(req.params.orgId), req.account!.id, portalSchema.parse(req.body)));
  });
  r.post(
    `${root}/cover`,
    requireAuth,
    async (req, _res, next) => {
      await organizationAccess(id(req.params.orgId), req.account!.id);
      requireCondition(storage, "Image storage is not configured yet.", 503);
      await throttle("media-upload", req.account!.id, 10, 3600000);
      next();
    },
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp", "application/octet-stream"],
      limit: "2mb",
    }),
    async (req, res) =>
      res
        .status(201)
        .json(
          await uploadImage(
            req.account!.id,
            { portalOrganizationId: id(req.params.orgId) },
            req.body,
            storage!,
          ),
        ),
  );
  r.delete(`${root}/cover`, requireAuth, async (req, res) =>
    res.json(await removeImage(req.account!.id, { portalOrganizationId: id(req.params.orgId) })),
  );
  r.get(domains, requireAuth, async (req, res) => {
    await organizationAccess(id(req.params.orgId), req.account!.id, true);
    res.json({
      configured: domainAvailable(),
      cnameTarget: env.PORTAL_CNAME_TARGET || null,
      apexAddresses: env.PORTAL_APEX_ADDRESSES,
      domains: await db.customDomain.findMany({
        where: { organizationId: id(req.params.orgId) },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          hostname: true,
          status: true,
          challenge: true,
          challengeExpiresAt: true,
          providerStatus: true,
          certificateStatus: true,
          dnsRecords: true,
          verifiedAt: true,
          checkedAt: true,
          removedAt: true,
        },
      }),
    });
  });
  r.post(domains, requireAuth, recentAuth, async (req, res) => {
    await throttle("domain-claim", req.account!.id, 10, 3600000);
    const d = await claimDomain(
      id(req.params.orgId),
      req.account!.id,
      domainInput.parse(req.body).hostname,
    );
    res.status(201).json({ id: d.id });
  });
  r.post(`${domains}/:domainId/check`, requireAuth, recentAuth, async (req, res) => {
    await organizationAccess(id(req.params.orgId), req.account!.id, true);
    requireCondition(
      await db.customDomain.findFirst({
        where: {
          id: id(req.params.domainId),
          organizationId: id(req.params.orgId),
          removedAt: null,
        },
      }),
      "Domain not found.",
      404,
    );
    requireCondition(domainAvailable(), "Custom-domain hosting is not configured.", 503);
    await throttle("domain-check", req.account!.id, 10, 60000);
    await reconcileDomain(id(req.params.domainId));
    res.json({ ok: true });
  });
  r.post(`${domains}/:domainId/challenge`, requireAuth, recentAuth, async (req, res) =>
    res.json(await renewChallenge(id(req.params.orgId), req.account!.id, id(req.params.domainId))),
  );
  r.delete(`${domains}/:domainId`, requireAuth, recentAuth, async (req, res) => {
    await requestRemoval(id(req.params.orgId), req.account!.id, id(req.params.domainId));
    res.json({ ok: true });
  });
  return r;
}
export function publicPortalRouter(storage: ObjectStorage | undefined = createStorage()) {
  const r = Router();
  r.get("/portal/context", async (req, res) =>
    res.json(
      req.tenantOrganizationId
        ? {
            mode: "portal",
            portal: publicPortal(await portalByOrganization(req.tenantOrganizationId)),
          }
        : { mode: "canonical" },
    ),
  );
  const handle = Router({ mergeParams: true });
  handle.use(async (req, res, next) => {
    await throttle("portal-read", req.ip || "unknown", 300, 60000);
    const p = req.tenantOrganizationId
      ? await portalByOrganization(req.tenantOrganizationId)
      : await portalBySlug(z.string().max(50).parse(req.params.slug));
    res.locals.portal = p;
    res.set("Cache-Control", "no-store");
    next();
  });
  handle.get("/", (_req, res) => res.json(publicPortal(res.locals.portal)));
  handle.get("/tournaments", async (req, res) => {
    const p = portalListQuery.parse(req.query),
      org = res.locals.portal.organizationId;
    const rows = await db.tournament.findMany({
      where: {
        organizationId: org,
        organization: { portal: { enabled: true } },
        visibility: "PUBLIC",
        phase: p.completed === "true" ? "COMPLETED" : { not: "DRAFT" },
        ...(p.q ? { name: { contains: p.q, mode: "insensitive" } } : {}),
      },
      select: { ...tournamentProjection, coverId: true },
      orderBy: [{ startsAt: "desc" }, { id: "asc" }],
      skip: (p.page - 1) * 24,
      take: 25,
    });
    res.json({ data: rows.slice(0, 24), hasMore: rows.length > 24 });
  });
  for (const kind of [
    "detail",
    "matches",
    "bracket",
    "results",
    "schedule",
    "standings",
    "rounds",
    "teams",
    "announcements",
  ]) {
    handle.get(`/tournaments/:id${kind === "detail" ? "" : `/${kind}`}`, async (req, res) =>
      res.json(
        await readResource(
          id(req.params.id),
          kind,
          apiPageSchema.parse(req.query),
          undefined,
          res.locals.portal.organizationId,
        ),
      ),
    );
  }
  handle.get("/media/:id", async (req, res) => {
    const assetId = z.string().uuid().parse(req.params.id),
      org = res.locals.portal.organizationId;
    const asset = await db.mediaAsset.findFirst({
      where: {
        id: assetId,
        OR: [
          { portalCovers: { some: { organizationId: org, enabled: true } } },
          { organizationLogos: { some: { id: org, portal: { enabled: true } } } },
          {
            covers: {
              some: {
                organizationId: org,
                visibility: "PUBLIC",
                phase: { not: "DRAFT" },
                organization: { portal: { enabled: true } },
              },
            },
          },
        ],
      },
      select: { key: true },
    });
    requireCondition(asset, "Image not found.", 404);
    requireCondition(storage, "Image storage is unavailable.", 503);
    res.type("image/webp").send(Buffer.from(await storage.get(asset.key)));
  });
  handle.use(() => {
    throw new ApiError(404, "Portal route not found.");
  });
  r.use(
    "/portal",
    (req, _res, next) => {
      if (!req.tenantOrganizationId) throw new ApiError(404, "Portal not found.");
      next();
    },
    handle,
  );
  r.use("/portals/:slug", handle);
  return r;
}
