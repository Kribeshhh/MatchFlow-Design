import { watchResource } from "./live";
import { useCallback, useEffect, useState } from "react";
import { api } from "./http";

export type {
  Dashboard,
  Event,
  EventSummary,
  Match,
  Registration,
  Team,
  User,
} from "../../../../packages/shared/src/contracts";
export { api, RequestError } from "./http";
export const send = <T>(path: string, body: unknown = {}, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((n) => n + 1), []);
  useEffect(() => {
    const abort = new AbortController();
    let running = false,
      queued = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError("");
    async function fetchResource(initial = false) {
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        const result = await api<T>(path, { signal: abort.signal });
        if (!abort.signal.aborted) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (!abort.signal.aborted) {
          setError((e as Error).message);
          if (
            (e as { status?: number }).status === 401 ||
            (e as { status?: number }).status === 403 ||
            (e as { status?: number }).status === 404
          )
            setData(null);
        }
      } finally {
        running = false;
        if (!abort.signal.aborted) {
          if (initial) setLoading(false);
          if (queued) {
            queued = false;
            void fetchResource();
          }
        }
      }
    }
    function changed() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void fetchResource(), 150);
    }
    const unwatch = watchResource(path, changed);
    const fallback = setInterval(() => {
      if (document.visibilityState === "visible") changed();
    }, 15000);
    const focus = () => changed();
    window.addEventListener("focus", focus);
    void fetchResource(true);
    return () => {
      abort.abort();
      unwatch();
      clearInterval(fallback);
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", focus);
    };
  }, [path, version]);
  return { data, error, loading, refresh };
}
export const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not scheduled";
export function localInput(value?: string | null) {
  const d = value ? new Date(value) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export const gameName = (id: string) =>
  ({
    pubg: "PUBG Mobile",
    ml: "Mobile Legends",
    ff: "Free Fire",
    cs2: "Counter-Strike 2",
    valorant: "Valorant",
    dota: "Dota 2",
  })[id] || id;
