import { z } from "zod";
import { bracketGenerationSchema } from "../../../../../packages/shared/src/brackets.js";
import { idSchema } from "../../../../../packages/shared/src/validation.js";
import { Router } from "express";
import { role } from "../auth/security.js";
import { generateBracket } from "../brackets/service.js";
const id = idSchema.parse;
export const router = Router();
router.post("/tournaments/:id/bracket", role("ORGANIZER"), async (req, res) =>
  res
    .status(201)
    .json(
      await generateBracket(
        id(req.params.id),
        req.account!.id,
        bracketGenerationSchema.parse(req.body || {}),
        z.string().uuid().optional().parse(req.get("Idempotency-Key")),
      ),
    ),
);
