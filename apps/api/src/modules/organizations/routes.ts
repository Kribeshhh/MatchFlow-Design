import { Router } from "express";
import { z } from "zod";
import { db } from "../../database/client.js";
import { requireAuth, role } from "../auth/security.js";
import { recentAuth } from "../auth/policy.js";
import { throttle } from "../auth/throttle.js";
import { organizationAccess, workspaceAccess } from "./policy.js";
import {
  profileSelect,
  createOrganization,
  updateOrganization,
  publicOrganization,
} from "./profiles.js";
import {
  organizationProfileSchema,
  organizationInviteSchema,
  staffRoleSchema,
  analyticsQuerySchema,
} from "../../../../../packages/shared/src/organizations.js";
import {
  inviteStaff,
  myInvitations,
  answerInvitation,
  cancelInvitation,
  changeMember,
  removeMember,
} from "./staff.js";
import { organizationAnalytics, exportAnalytics } from "./analytics.js";
import { manageableBy } from "../tournaments/policy.js";
import { mailDelivery } from "../auth/mail.js";
const id = (v: unknown) => z.string().cuid().parse(v);
export const router = Router();
router.get("/organization-invitations", requireAuth, async (req, res) =>
  res.json(await myInvitations(req.account!.id)),
);
router.post("/organization-invitations/:id/respond", role("PLAYER"), async (req, res) =>
  res.json(
    await answerInvitation(
      id(req.params.id),
      req.account!.id,
      z.object({ accept: z.boolean() }).strict().parse(req.body).accept,
    ),
  ),
);
router.get("/organizations/:id/public", async (req, res) =>
  res.json(await publicOrganization(id(req.params.id))),
);
router.get("/organizations", requireAuth, async (req, res) => {
  const userId = req.account!.id;
  const rows = await db.organization.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    select: {
      ...profileSelect,
      ownerId: true,
      members: { where: { userId }, select: { role: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json(
    rows.map((o) => ({
      ...o,
      members: undefined,
      access: o.ownerId === userId ? "OWNER" : o.members[0].role,
    })),
  );
});
router.post("/organizations", role("ORGANIZER"), async (req, res) => {
  await throttle("organization-create", req.account!.id, 10, 86400000);
  res
    .status(201)
    .json(await createOrganization(req.account!.id, organizationProfileSchema.parse(req.body)));
});
router.get("/organizations/:id", requireAuth, async (req, res) => {
  const o = await workspaceAccess(id(req.params.id), req.account!.id);
  const events = await db.tournament.findMany({
    where: { organizationId: o.id, ...manageableBy(req.account!.id) },
    select: {
      id: true,
      name: true,
      game: true,
      phase: true,
      startsAt: true,
      permissions: { select: { userId: true, canManage: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 100,
  });
  res.json({
    id: o.id,
    name: o.name,
    description: o.description,
    region: o.region,
    website: o.website,
    publicProfile: o.publicProfile,
    logoId: o.logoId,
    version: o.version,
    ownerId: o.ownerId,
    access: o.access,
    tournaments: events.map((t) => ({
      ...t,
      permissions: ["OWNER", "ADMIN"].includes(o.access) ? t.permissions : undefined,
    })),
    emailAvailable: mailDelivery.available,
  });
});
router.patch("/organizations/:id", role("ORGANIZER"), async (req, res) => {
  const input = organizationProfileSchema
    .extend({ expectedVersion: z.number().int().nonnegative() })
    .parse(req.body);
  const { expectedVersion, ...profile } = input;
  res.json(await updateOrganization(id(req.params.id), req.account!.id, profile, expectedVersion));
});
router.get("/organizations/:id/analytics", requireAuth, async (req, res) =>
  res.json(
    await organizationAnalytics(
      id(req.params.id),
      req.account!.id,
      analyticsQuerySchema.parse(req.query).days,
    ),
  ),
);
router.get("/organizations/:id/export.csv", requireAuth, async (req, res) => {
  await throttle("organization-export", req.account!.id, 20, 60000);
  res
    .type("text/csv")
    .set("Content-Disposition", 'attachment; filename="matchflow-organization.csv"')
    .send(
      await exportAnalytics(
        id(req.params.id),
        req.account!.id,
        analyticsQuerySchema.parse(req.query).days,
      ),
    );
});
router.get("/organizations/:id/members", requireAuth, async (req, res) => {
  const o = await workspaceAccess(id(req.params.id), req.account!.id);
  const owner = await db.user.findUniqueOrThrow({
    where: { id: o.ownerId },
    select: { id: true, username: true },
  });
  const members = await db.organizationMember.findMany({
    where: { organizationId: o.id, userId: { not: o.ownerId } },
    select: { userId: true, role: true, user: { select: { id: true, username: true } } },
    orderBy: { userId: "asc" },
  });
  res.json([{ userId: owner.id, role: "OWNER", user: owner }, ...members]);
});
router.get("/organizations/:id/invitations", requireAuth, async (req, res) => {
  const o = await organizationAccess(id(req.params.id), req.account!.id);
  res.json(
    await db.organizationInvitation.findMany({
      where: { organizationId: o.id },
      select: {
        id: true,
        label: true,
        role: true,
        status: true,
        expiresAt: true,
        emailState: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
});
router.post("/organizations/:id/invitations", role("ORGANIZER"), recentAuth, async (req, res) => {
  await throttle("organization-invite", req.account!.id, 20, 3600000);
  res
    .status(201)
    .json(
      await inviteStaff(
        id(req.params.id),
        req.account!.id,
        organizationInviteSchema.parse(req.body),
      ),
    );
});
router.delete(
  "/organizations/:id/invitations/:invitationId",
  role("ORGANIZER"),
  recentAuth,
  async (req, res) =>
    res.json(
      await cancelInvitation(id(req.params.id), id(req.params.invitationId), req.account!.id),
    ),
);
router.put("/organizations/:id/members/:userId", role("ORGANIZER"), recentAuth, async (req, res) =>
  res.json(
    await changeMember(
      id(req.params.id),
      req.account!.id,
      id(req.params.userId),
      z.object({ role: staffRoleSchema }).strict().parse(req.body).role,
    ),
  ),
);
router.delete("/organizations/:id/members/:userId", role("PLAYER"), recentAuth, async (req, res) =>
  res.json(await removeMember(id(req.params.id), req.account!.id, id(req.params.userId))),
);
