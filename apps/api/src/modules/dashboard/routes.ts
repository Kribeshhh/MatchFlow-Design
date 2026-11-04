import { Router } from "express";
import { requireAuth } from "../auth/security.js";
import { dashboard } from "./service.js";
export const router = Router();
router.get("/dashboard", requireAuth, async (req, res) => res.json(await dashboard(req.account!)));
