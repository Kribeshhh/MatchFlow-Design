import express, { Router } from "express";
import { z } from "zod";
import { db, requireCondition } from "../../database/client.js";
import { role } from "../auth/security.js";
import { throttle } from "../auth/throttle.js";
import { owned } from "../tournaments/policy.js";
import { editableTeam } from "../teams/policy.js";
import { createStorage, type ObjectStorage } from "./storage.js";
import { uploadImage, removeImage, readImage } from "./service.js";
import { organizationAccess } from "../organizations/policy.js";
export function mediaRouter(storage: ObjectStorage | undefined = createStorage()) {
  const router = Router();
  router.get("/media/options", (_req, res) => res.json({ available: Boolean(storage) }));
  for (const kind of ["avatar", "logo", "cover", "organization"] as const) {
    const path =
      kind === "avatar"
        ? "/account/avatar"
        : kind === "logo"
          ? "/teams/:id/logo"
          : kind === "organization"
            ? "/organizations/:id/logo"
            : "/tournaments/:id/cover";
    router.post(
      path,
      role("PLAYER"),
      async (req, _res, next) => {
        requireCondition(storage, "Image storage is not configured yet.", 503);
        await throttle("media-upload", req.account!.id, 10, 3600000);
        if (kind === "logo")
          await editableTeam(db, z.string().cuid().parse(req.params.id), req.account!.id);
        if (kind === "cover")
          await owned(db, z.string().cuid().parse(req.params.id), req.account!.id);
        if (kind === "organization")
          await organizationAccess(z.string().cuid().parse(req.params.id), req.account!.id);
        next();
      },
      express.raw({
        type: ["image/png", "image/jpeg", "image/webp", "application/octet-stream"],
        limit: "2mb",
      }),
      async (req, res) => {
        res
          .status(201)
          .json(
            await uploadImage(
              req.account!.id,
              kind === "avatar"
                ? { userId: req.account!.id }
                : kind === "cover"
                  ? { tournamentId: z.string().cuid().parse(req.params.id) }
                  : kind === "organization"
                    ? { organizationId: z.string().cuid().parse(req.params.id) }
                    : { teamId: z.string().cuid().parse(req.params.id) },
              req.body,
              storage!,
            ),
          );
      },
    );
    router.delete(path, role("PLAYER"), async (req, res) =>
      res.json(
        await removeImage(
          req.account!.id,
          kind === "avatar"
            ? { userId: req.account!.id }
            : kind === "cover"
              ? { tournamentId: z.string().cuid().parse(req.params.id) }
              : kind === "organization"
                ? { organizationId: z.string().cuid().parse(req.params.id) }
                : { teamId: z.string().cuid().parse(req.params.id) },
        ),
      ),
    );
  }
  router.get("/media/:id", async (req, res) =>
    res
      .type("image/webp")
      .set("Content-Disposition", "inline")
      .send(
        await readImage(
          z.string().uuid().parse(req.params.id),
          req.account?.id,
          storage,
          req.eventAccessIds,
        ),
      ),
  );
  return router;
}
