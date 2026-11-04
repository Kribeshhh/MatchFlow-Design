import { playerProfile } from "./profile.js";
import { Router } from "express";
import { z } from "zod";
import { role } from "../auth/security.js";
import { searchPlayers } from "./repository.js";
export const router = Router();
router.get("/users", role("PLAYER"), async (req, res) =>
  res.json(await searchPlayers(z.string().trim().min(2).max(24).parse(req.query.q))),
);
router.get("/players/:username", async (req, res) =>
  res.json(
    await playerProfile(
      z
        .string()
        .regex(/^[a-z0-9_]{3,24}$/)
        .parse(req.params.username),
      req.account?.id,
    ),
  ),
);
