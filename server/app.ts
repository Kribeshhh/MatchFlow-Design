import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";
import { resolve } from "node:path";
import {
  db,
  ApiError,
  transaction,
  requireCondition,
  teamInclude,
  publicUser,
  matchInclude,
} from "./db.js";
import {
  authenticate,
  requireAuth,
  role,
  hashPassword,
  verifyPassword,
  createSession,
  removeSession,
} from "./security.js";
import * as schema from "../shared/validation.js";
import {
  owned,
  editableTeam,
  registerTeam,
  reviewRegistration,
  generateBracket,
  scheduleMatch,
  saveResult,
  tournamentDetail,
  statusOf,
} from "./tournaments.js";
export const app = express();
app.disable("x-powered-by");
const origins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(
  ",",
);
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production"
        ? {
            directives: {
              "img-src": ["'self'", "data:", "https:"],
              "style-src": ["'self'", "'unsafe-inline'"],
            },
          }
        : false,
  }),
);
app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || origins.includes(origin)),
    credentials: true,
  }),
);
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: process.env.NODE_ENV === "test" ? 10000 : 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please wait a minute." },
  }),
);
app.use("/api", (req, _res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (
      req.get("X-MatchFlow") !== "1" ||
      (req.get("Origin") && !origins.includes(req.get("Origin")!))
    )
      throw new ApiError(403, "Request origin could not be verified.");
  }
  next();
});
app.use("/api", authenticate);
const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: process.env.NODE_ENV === "test" ? 1000 : 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
});
const id = (value: unknown) => z.string().min(1).max(100).parse(value);
app.get("/api/health", async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
});
app.get("/api/auth/me", (req, res) => res.json({ user: req.account || null }));
app.post("/api/auth/register", authLimit, async (req, res) => {
  const input = schema.registerSchema.parse(req.body);
  const user = await db.user.create({
    data: {
      username: input.username,
      email: input.email,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    },
    select: { ...publicUser, email: true },
  });
  await removeSession(req, res);
  await createSession(res, user.id);
  res.status(201).json({ user });
});
const dummyPassword = hashPassword("unusable-account-placeholder");
app.post("/api/auth/login", authLimit, async (req, res) => {
  const input = schema.loginSchema.parse(req.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  const valid = await verifyPassword(
    input.password,
    user?.passwordHash || (await dummyPassword),
  );
  requireCondition(user && valid, "Email or password is incorrect.", 401);
  await removeSession(req, res);
  await createSession(res, user.id);
  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  });
});
app.post("/api/auth/logout", async (req, res) => {
  await removeSession(req, res);
  res.json({ ok: true });
});
app.get("/api/users", role("PLAYER"), async (req, res) => {
  const q = z.string().trim().min(2).max(24).parse(req.query.q);
  res.json(
    await db.user.findMany({
      where: {
        role: "PLAYER",
        username: { contains: q.toLowerCase(), mode: "insensitive" },
      },
      select: publicUser,
      take: 15,
      orderBy: { username: "asc" },
    }),
  );
});
app.get("/api/teams", requireAuth, async (req, res) => {
  if (req.query.eligibleFor) {
    const tournamentId = id(req.query.eligibleFor);
    const t = await owned(db, tournamentId, req.account!.id);
    const q = z
      .string()
      .max(60)
      .parse(req.query.q || "");
    const candidates = await db.team.findMany({
      where: {
        game: t.game,
        name: { contains: q, mode: "insensitive" },
        registrations: { none: { tournamentId } },
      },
      include: teamInclude,
      take: 30,
    });
    res.json(candidates.filter((t2) => t2.members.length === t.teamSize));
    return;
  }
  res.json(
    await db.team.findMany({
      where: { members: { some: { userId: req.account!.id } } },
      include: teamInclude,
      orderBy: { createdAt: "desc" },
    }),
  );
});
app.post("/api/teams", role("PLAYER"), async (req, res) => {
  const input = schema.teamSchema.parse(req.body);
  res
    .status(201)
    .json(
      await db.team.create({
        data: {
          ...input,
          captainId: req.account!.id,
          members: { create: { userId: req.account!.id } },
        },
        include: teamInclude,
      }),
    );
});
app.get("/api/teams/:id", requireAuth, async (req, res) => {
  const team = await db.team.findUnique({
    where: { id: id(req.params.id) },
    include: teamInclude,
  });
  requireCondition(team, "Team not found.", 404);
  requireCondition(
    team.members.some((m) => m.userId === req.account!.id),
    "Only team members can view this team page.",
    403,
  );
  const locked = await db.tournamentRegistration.count({
    where: {
      teamId: team.id,
      status: { in: ["PENDING", "APPROVED"] },
      tournament: { phase: { not: "COMPLETED" } },
    },
  });
  res.json({ ...team, locked: locked > 0 });
});
app.post("/api/teams/:id/members", role("PLAYER"), async (req, res) => {
  const input = schema.memberSchema.parse(req.body);
  const teamId = id(req.params.id);
  res.status(201).json(
    await transaction(async (tx) => {
      const team = await editableTeam(tx, teamId, req.account!.id);
      requireCondition(
        team.members.length < 10,
        "MVP teams can have at most 10 members.",
      );
      const user = await tx.user.findUnique({ where: { id: input.userId } });
      requireCondition(
        user?.role === "PLAYER",
        "Select an existing player account.",
      );
      return tx.teamMember.create({ data: { teamId, userId: input.userId } });
    }),
  );
});
app.delete(
  "/api/teams/:id/members/:userId",
  role("PLAYER"),
  async (req, res) => {
    const teamId = id(req.params.id);
    const userId = id(req.params.userId);
    await transaction(async (tx) => {
      const team = await editableTeam(tx, teamId, req.account!.id);
      requireCondition(
        userId !== team.captainId,
        "The captain cannot be removed.",
      );
      await tx.teamMember.deleteMany({ where: { teamId, userId } });
    });
    res.json({ ok: true });
  },
);
app.get("/api/tournaments", async (req, res) => {
  const query = z
    .object({
      q: z.string().max(100).optional(),
      game: schema.gameSchema.optional(),
      status: z
        .enum([
          "UPCOMING",
          "REGISTRATION_OPEN",
          "REGISTRATION_CLOSED",
          "ONGOING",
          "COMPLETED",
        ])
        .optional(),
    })
    .parse(req.query);
  const rows = await db.tournament.findMany({
    where: {
      name: query.q ? { contains: query.q, mode: "insensitive" } : undefined,
      game: query.game,
    },
    include: {
      organizer: { select: publicUser },
      champion: true,
      _count: {
        select: {
          registrations: { where: { status: { in: ["PENDING", "APPROVED"] } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(
    rows
      .map((t) => ({
        ...t,
        status: statusOf(t),
        registeredCount: t._count.registrations,
      }))
      .filter((t) => !query.status || t.status === query.status),
  );
});
app.post("/api/tournaments", role("ORGANIZER"), async (req, res) => {
  const input = schema.tournamentSchema.parse(req.body);
  res
    .status(201)
    .json(
      await db.tournament.create({
        data: { ...input, organizerId: req.account!.id },
      }),
    );
});
app.get("/api/tournaments/:id", async (req, res) =>
  res.json(await tournamentDetail(id(req.params.id), req.account)),
);
app.post(
  "/api/tournaments/:id/registrations",
  role("PLAYER"),
  async (req, res) => {
    const { teamId } = schema.idBody.parse(req.body);
    res
      .status(201)
      .json(await registerTeam(id(req.params.id), teamId, req.account!.id));
  },
);
app.post(
  "/api/tournaments/:id/manual-registration",
  role("ORGANIZER"),
  async (req, res) => {
    const { teamId } = schema.idBody.parse(req.body);
    res
      .status(201)
      .json(
        await registerTeam(id(req.params.id), teamId, req.account!.id, true),
      );
  },
);
app.patch(
  "/api/tournaments/:id/registrations/:registrationId",
  role("ORGANIZER"),
  async (req, res) => {
    const { status } = schema.reviewSchema.parse(req.body);
    res.json(
      await reviewRegistration(
        id(req.params.id),
        id(req.params.registrationId),
        req.account!.id,
        status,
      ),
    );
  },
);
app.delete(
  "/api/tournaments/:id/registrations/:registrationId",
  role("ORGANIZER"),
  async (req, res) =>
    res.json(
      await reviewRegistration(
        id(req.params.id),
        id(req.params.registrationId),
        req.account!.id,
        "REMOVE",
      ),
    ),
);
app.post("/api/tournaments/:id/bracket", role("ORGANIZER"), async (req, res) =>
  res
    .status(201)
    .json(await generateBracket(id(req.params.id), req.account!.id)),
);
app.patch(
  "/api/tournaments/:id/matches/:matchId/schedule",
  role("ORGANIZER"),
  async (req, res) => {
    const input = schema.scheduleSchema.parse(req.body);
    res.json(
      await scheduleMatch(
        id(req.params.id),
        id(req.params.matchId),
        req.account!.id,
        input.scheduledAt,
        input.venue,
      ),
    );
  },
);
app.post(
  "/api/tournaments/:id/matches/:matchId/result",
  role("ORGANIZER"),
  async (req, res) => {
    const input = schema.resultSchema.parse(req.body);
    res.json(
      await saveResult(
        id(req.params.id),
        id(req.params.matchId),
        req.account!.id,
        input.scoreA,
        input.scoreB,
      ),
    );
  },
);
app.get("/api/dashboard", requireAuth, async (req, res) => {
  const user = req.account!;
  const owner = user.role === "ORGANIZER";
  const teamWhere = { members: { some: { userId: user.id } } };
  const teams = owner
    ? []
    : await db.team.findMany({ where: teamWhere, include: teamInclude });
  const tournaments = await db.tournament.findMany({
    where: owner
      ? { organizerId: user.id }
      : { registrations: { some: { teamId: { in: teams.map((t) => t.id) } } } },
    include: {
      organizer: { select: publicUser },
      champion: true,
      registrations: { select: { id: true, status: true, teamId: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const matches = await db.match.findMany({
    where: owner
      ? { tournament: { organizerId: user.id } }
      : {
          OR: [
            { teamAId: { in: teams.map((t) => t.id) } },
            { teamBId: { in: teams.map((t) => t.id) } },
          ],
        },
    include: {
      ...matchInclude,
      tournament: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });
  res.json({
    teams,
    tournaments: tournaments.map((t) => ({
      ...t,
      status: statusOf(t),
      registeredCount: t.registrations.filter((r) => r.status !== "REJECTED")
        .length,
    })),
    totalRegistrations: tournaments.reduce(
      (n, t) => n + t.registrations.length,
      0,
    ),
    upcomingMatches: matches.filter((m) => m.status === "SCHEDULED"),
    recentResults: matches
      .filter((m) => m.status === "COMPLETED" && !m.isBye)
      .sort(
        (a, b) =>
          (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0),
      )
      .slice(0, 10),
  });
});
app.use("/api", (_req, _res, next) =>
  next(new ApiError(404, "API route not found.")),
);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ZodError) {
      res
        .status(400)
        .json({
          error: error.issues
            .map((i) => `${i.path.join(".") || "Input"}: ${i.message}`)
            .join(" "),
          issues: error.flatten(),
        });
      return;
    }
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        res
          .status(409)
          .json({
            error: "This account, membership, or registration already exists.",
          });
        return;
      }
      if (error.code === "P2034") {
        res
          .status(409)
          .json({
            error:
              "This record changed during your request. Refresh and try again.",
          });
        return;
      }
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid JSON request." });
      return;
    }
    console.error(
      "API error:",
      error instanceof Error ? error.name : "unknown",
    );
    res.status(500).json({ error: "Something went wrong. Please try again." });
  },
);
