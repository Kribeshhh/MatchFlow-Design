import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/security.js";
import { preferenceSchema } from "../../../../../packages/shared/src/notifications.js";
import { listNotifications, markRead, preferences, savePreferences } from "./service.js";
export const router = Router();
router.use("/notifications", requireAuth);
router.get("/notifications", async (req, res) =>
  res.json(
    await listNotifications(
      req.account!.id,
      z.string().max(100).optional().parse(req.query.cursor),
    ),
  ),
);
router.get("/notifications/preferences", async (req, res) =>
  res.json(await preferences(req.account!.id)),
);
router.put("/notifications/preferences", async (req, res) =>
  res.json(await savePreferences(req.account!.id, preferenceSchema.parse(req.body))),
);
router.post("/notifications/read-all", async (req, res) =>
  res.json(await markRead(req.account!.id)),
);
router.post("/notifications/:id/read", async (req, res) =>
  res.json(await markRead(req.account!.id, z.string().min(1).max(100).parse(req.params.id))),
);
