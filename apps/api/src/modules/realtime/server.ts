import { canonicalHost } from "../custom-domains/hostname.js";
import { Server as SocketServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { env } from "../../config/env.js";
import { db } from "../../database/client.js";
import { digest } from "../auth/tokens.js";
import { throttle } from "../auth/throttle.js";
import { visibleTo } from "../tournaments/policy.js";
import { subscribeSchema } from "../../../../../packages/shared/src/notifications.js";
import { logger } from "../../http/logger.js";
type State = {
  hash: string;
  userId: string;
  cookies: Record<string, string>;
  topics: Map<string, string>;
  notificationVersion: string;
  messages: number;
  windowStart: number;
};
function cookies(header = "") {
  if (header.length > 8192) throw Error("Invalid connection");
  return Object.fromEntries(
    header
      .split(";")
      .map((v) => v.trim().split("="))
      .filter(([k, v]) => k && /^[a-f0-9]{64}$/.test(v || "")),
  );
}
async function active(state: State) {
  const session = await db.session.findUnique({
    where: { tokenHash: state.hash },
    include: { user: { select: { status: true } } },
  });
  return Boolean(
    session &&
    session.userId === state.userId &&
    session.expiresAt > new Date() &&
    session.user.status === "ACTIVE",
  );
}
async function permitted(state: State, id: string) {
  const token = state.cookies[`mf_event_${id}`];
  const shared =
    token &&
    (await db.tournament.findFirst({
      where: { id, shareTokenHash: digest(token), visibility: "PRIVATE", phase: { not: "DRAFT" } },
      select: { id: true },
    }))
      ? [id]
      : [];
  return Boolean(
    await db.tournament.findFirst({
      where: { id, ...visibleTo(state.userId, shared) },
      select: { id: true },
    }),
  );
}
export function attachRealtime(server: HttpServer, options: { intervalMs?: number } = {}) {
  const io = new SocketServer(server, {
    path: "/api/realtime",
    transports: ["websocket"],
    maxHttpBufferSize: 2048,
    pingInterval: 20000,
    pingTimeout: 10000,
    allowRequest: (req, done) => {
      if (
        !canonicalHost(req.headers.host) ||
        !req.headers.origin ||
        !env.CLIENT_ORIGIN.includes(req.headers.origin)
      ) {
        done(null, false);
        return;
      }
      void throttle("live-handshake", req.socket.remoteAddress || "unknown", 180, 60000).then(
        () => done(null, true),
        () => done(null, false),
      );
    },
  });
  const states = new Map<Socket, State>();
  let polling = false;
  io.use(async (socket, next) => {
    try {
      if (states.size >= 500) throw Error("Busy");
      const values = cookies(socket.request.headers.cookie);
      const token = values.matchflow_session;
      if (!token) throw Error("Login");
      const hash = digest(token);
      const session = await db.session.findUnique({
        where: { tokenHash: hash },
        include: { user: { select: { status: true } } },
      });
      if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE")
        throw Error("Login");
      await throttle("live-connect", session.userId, 60, 60000);
      socket.data.state = {
        hash,
        userId: session.userId,
        cookies: values,
        topics: new Map(),
        notificationVersion: "",
        messages: 0,
        windowStart: Date.now(),
      } satisfies State;
      next();
    } catch {
      next(new Error("Live connection unavailable. Sign in and try again."));
    }
  });
  io.on("connection", (socket) => {
    const state = socket.data.state as State;
    states.set(socket, state);
    let packets = 0,
      packetWindow = Date.now();
    socket.onAny(() => {
      if (Date.now() - packetWindow > 60000) {
        packets = 0;
        packetWindow = Date.now();
      }
      if (++packets > 60) socket.disconnect(true);
    });
    socket.on("subscribe", async (raw: unknown, ack: unknown) => {
      if (typeof ack !== "function") return;
      try {
        if (Date.now() - state.windowStart > 60000) {
          state.windowStart = Date.now();
          state.messages = 0;
        }
        if (++state.messages > 30) throw Error("Rate");
        const input = subscribeSchema.parse(raw);
        if (state.topics.size >= 8 && !state.topics.has(input.tournamentId)) throw Error("Limit");
        if (!(await active(state)) || !(await permitted(state, input.tournamentId)))
          throw Error("Denied");
        const revision = await db.liveRevision.findUnique({
          where: { tournamentId: input.tournamentId },
        });
        const version = String(revision?.version ?? 0);
        if (!socket.connected || (state.topics.size >= 8 && !state.topics.has(input.tournamentId)))
          throw Error("Limit");
        state.topics.set(input.tournamentId, version);
        await socket.join(`tournament:${input.tournamentId}`);
        ack({ ok: true, version });
        socket.emit("changed", {
          topic: "tournament",
          id: input.tournamentId,
          version,
          resync: true,
        });
      } catch {
        ack({ ok: false, error: "Subscription unavailable." });
      }
    });
    socket.on("unsubscribe", (id: unknown) => {
      if (typeof id === "string" && id.length <= 100) {
        state.topics.delete(id);
        void socket.leave(`tournament:${id}`);
      }
    });
    socket.on("disconnect", () => states.delete(socket));
  });
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      await Promise.all(
        [...states].map(async ([socket, state]) => {
          try {
            if (!(await active(state))) {
              socket.emit("access-revoked");
              socket.disconnect(true);
              return;
            }
            const preference = await db.notificationPreference.findUnique({
              where: { userId: state.userId },
              select: { revision: true },
            });
            const notificationVersion = String(preference?.revision ?? 0);
            if (notificationVersion !== state.notificationVersion) {
              state.notificationVersion = notificationVersion;
              socket.emit("changed", {
                topic: "notifications",
                id: state.userId,
                version: notificationVersion,
                resync: true,
              });
            }
            for (const [id, last] of state.topics) {
              if (!(await permitted(state, id))) {
                state.topics.delete(id);
                await socket.leave(`tournament:${id}`);
                socket.emit("subscription-revoked", { id });
                continue;
              }
              const row = await db.liveRevision.findUnique({ where: { tournamentId: id } });
              const version = String(row?.version ?? 0);
              if (version !== last) {
                state.topics.set(id, version);
                socket.emit("changed", { topic: "tournament", id, version });
              }
            }
          } catch {
            socket.emit("sync-unavailable");
          }
        }),
      );
    } catch {
      logger.warn("Live polling unavailable");
    } finally {
      polling = false;
    }
  }
  const timer = setInterval(() => void poll(), options.intervalMs ?? 1000);
  timer.unref();
  return {
    io,
    poll,
    close: async () => {
      clearInterval(timer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
