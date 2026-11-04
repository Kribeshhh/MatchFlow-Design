import { administrationRouter } from "./modules/administration/routes.js";
import { tenantBoundary } from "./modules/custom-domains/context.js";
import { publicPortalRouter, portalManagementRouter } from "./modules/portals/routes.js";
import { managementRouter, versionedRouter } from "./modules/api-access/routes.js";
import { router as notificationRouter } from "./modules/notifications/routes.js";
import { sharedAccess } from "./modules/tournaments/sharing.js";
import { mediaRouter } from "./modules/media/routes.js";
import type { ObjectStorage } from "./modules/media/storage.js";
import { router as organizationRouter } from "./modules/organizations/routes.js";
import { router as identityAdminRouter } from "./modules/administration/identity-routes.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { resolve } from "node:path";
import { env } from "./config/env.js";
import { ApiError } from "./database/client.js";
import { requestContext } from "./http/context.js";
import { errorHandler } from "./http/errors.js";
import { healthRouter } from "./http/health.js";
import { apiLimit } from "./http/limits.js";
import { createAuthRouter } from "./modules/auth/routes.js";
import { authenticate } from "./modules/auth/security.js";
import { router as bracketsRouter } from "./modules/brackets/routes.js";
import { router as dashboardRouter } from "./modules/dashboard/routes.js";
import { router as matchesRouter } from "./modules/matches/routes.js";
import { router as registrationsRouter } from "./modules/registrations/routes.js";
import { router as teamsRouter } from "./modules/teams/routes.js";
import { router as tournamentsRouter } from "./modules/tournaments/routes.js";
import { router as usersRouter } from "./modules/users/routes.js";
export function createApp(
  isShuttingDown: () => boolean = () => false,
  mail?: import("./modules/auth/mail.js").MailDelivery,
  google?: import("./modules/auth/google.js").GoogleProvider,
  storage?: ObjectStorage,
) {
  const app = express();
  app.set("trust proxy", env.TRUSTED_PROXIES.length ? env.TRUSTED_PROXIES : false);
  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(tenantBoundary);
  app.use(
    helmet({
      contentSecurityPolicy:
        env.NODE_ENV === "production"
          ? {
              directives: {
                "img-src": ["'self'", "data:", "https:"],
                "style-src": ["'self'", "'unsafe-inline'"],
              },
            }
          : false,
    }),
  );
  app.use("/api", publicPortalRouter(storage));
  app.use("/api", (req, _res, next) => {
    if (req.tenantOrganizationId) throw new ApiError(404, "Portal route not found.");
    next();
  });
  app.use(
    "/api/v1/public",
    cors({ origin: "*", credentials: false, methods: ["GET", "HEAD", "OPTIONS"] }),
  );
  const sessionCors = cors({
    origin: (origin, callback) =>
      callback(
        origin && !env.CLIENT_ORIGIN.includes(origin)
          ? new ApiError(403, "Request origin could not be verified.")
          : null,
        true,
      ),
    credentials: true,
  });
  app.use((req, res, next) =>
    req.tenantOrganizationId || req.path.startsWith("/api/v1/public/")
      ? next()
      : sessionCors(req, res, next),
  );
  app.use("/api", healthRouter(isShuttingDown));
  app.use("/api", apiLimit, (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api/v1", express.json({ limit: "64kb" }), versionedRouter);
  app.use("/api", (req, _res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.get("X-MatchFlow") !== "1" ||
        (req.get("Origin") && !env.CLIENT_ORIGIN.includes(req.get("Origin")!)))
    )
      throw new ApiError(403, "Request origin could not be verified.");
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.use("/api", authenticate, sharedAccess);
  app.use("/api", createAuthRouter(mail, google));
  app.use(
    "/api",
    organizationRouter,
    administrationRouter,
    identityAdminRouter,
    managementRouter,
    portalManagementRouter(storage),
  );
  app.use("/api", usersRouter);
  app.use("/api", mediaRouter(storage));
  app.use("/api", teamsRouter);
  app.use("/api", tournamentsRouter);
  app.use("/api", registrationsRouter);
  app.use("/api", bracketsRouter);
  app.use("/api", matchesRouter);
  app.use("/api", dashboardRouter, notificationRouter);
  app.use("/api", (_req, _res, next) => next(new ApiError(404, "API route not found.")));
  if (env.NODE_ENV === "production") {
    app.use(express.static(resolve("apps/web/dist")));
    app.get("/{*path}", (_req, res) => res.sendFile(resolve("apps/web/dist/index.html")));
  }
  app.use(errorHandler);
  return app;
}
export const app = createApp();
