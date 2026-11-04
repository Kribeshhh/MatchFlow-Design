import { shouldApplyVersion } from "../../../../packages/shared/src/live";
import { io, type Socket } from "socket.io-client";
import { liveSignalSchema } from "../../../../packages/shared/src/notifications";
type Listener = () => void;
let socket: Socket | null = null;
const resources = new Map<string, Set<Listener>>();
const versions = new Map<string, bigint>();
const statusListeners = new Set<(status: string) => void>();
let connectionStatus = "Offline updates";
function status(value: string) {
  connectionStatus = value;
  for (const listener of statusListeners) listener(value);
}
function tournamentId(path: string) {
  return /^\/tournaments\/([^/?]+)/.exec(path)?.[1];
}
function notify(test: (path: string) => boolean) {
  for (const [path, listeners] of resources)
    if (test(path)) for (const listener of listeners) listener();
}
function subscribe(id: string) {
  socket?.emit(
    "subscribe",
    { tournamentId: id, version: String(versions.get(`tournament:${id}`) ?? 0) },
    (reply: { ok: boolean }) => {
      if (!reply.ok) notify((path) => tournamentId(path) === id);
    },
  );
}
export function startLive(userId: string) {
  socket?.disconnect();
  versions.clear();
  socket = io({
    path: "/api/realtime",
    transports: ["websocket"],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  const current = socket;
  current.on("connect", () => {
    status("Live updates connected");
    notify(() => true);
    for (const id of new Set(
      [...resources.keys()].map(tournamentId).filter((id): id is string => Boolean(id)),
    ))
      subscribe(id);
  });
  current.on("disconnect", () => status("Reconnecting · periodic updates active"));
  current.on("connect_error", () => status("Periodic updates active"));
  current.on("sync-unavailable", () => status("Periodic updates active"));
  current.on("changed", (raw: unknown) => {
    const parsed = liveSignalSchema.safeParse(raw);
    if (!parsed.success) return;
    const event = parsed.data;
    if (event.topic === "notifications" && event.id !== userId) return;
    const key = `${event.topic}:${event.id}`,
      version = BigInt(event.version),
      last = versions.get(key);
    if (
      !shouldApplyVersion(
        last === undefined ? undefined : String(last),
        event.version,
        event.resync,
      )
    )
      return;
    versions.set(key, version);
    status("Live updates connected");
    notify((path) =>
      event.topic === "notifications"
        ? path.startsWith("/notifications") || path === "/dashboard"
        : tournamentId(path) === event.id ||
          path.startsWith("/tournaments?") ||
          path === "/dashboard",
    );
  });
  current.on("subscription-revoked", ({ id }: { id: string }) => {
    versions.delete(`tournament:${id}`);
    notify((path) => tournamentId(path) === id);
  });
  current.on("access-revoked", () => {
    versions.clear();
    notify(() => true);
    status("Session ended · sign in again");
  });
  return () => {
    current.disconnect();
    if (socket === current) socket = null;
    status("Periodic updates active");
  };
}
export function watchResource(path: string, listener: Listener) {
  const existing = resources.get(path) || new Set();
  existing.add(listener);
  resources.set(path, existing);
  const id = tournamentId(path);
  if (id && socket?.connected) subscribe(id);
  return () => {
    existing.delete(listener);
    if (!existing.size) resources.delete(path);
    if (id && ![...resources.keys()].some((path) => tournamentId(path) === id))
      socket?.emit("unsubscribe", id);
  };
}
export function watchLiveStatus(listener: (status: string) => void) {
  statusListeners.add(listener);
  listener(connectionStatus);
  return () => {
    statusListeners.delete(listener);
  };
}
