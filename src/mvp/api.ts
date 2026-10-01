import { useCallback, useEffect, useState } from "react";
import type { GameId } from "../data";
export type User = {
  id: string;
  username: string;
  email?: string;
  role: "PLAYER" | "ORGANIZER";
};
export type Team = {
  id: string;
  name: string;
  game: GameId;
  captainId: string;
  captain: User;
  description: string;
  logoUrl?: string;
  locked?: boolean;
  members: { userId: string; user: User }[];
};
export type Registration = {
  id: string;
  teamId: string;
  team: Team;
  status: "PENDING" | "APPROVED" | "REJECTED";
  roster: { id: string; username: string }[];
  createdAt: string;
};
export type Match = {
  id: string;
  tournamentId: string;
  round: number;
  position: number;
  teamAId: string | null;
  teamBId: string | null;
  teamA: Team | null;
  teamB: Team | null;
  winner: Team | null;
  winnerId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: "PENDING" | "SCHEDULED" | "COMPLETED";
  isBye: boolean;
  scheduledAt: string | null;
  completedAt: string | null;
  venue: string;
  tournament?: { id: string; name: string };
};
export type Event = {
  id: string;
  name: string;
  game: GameId;
  organizerId: string;
  organizer: User;
  teamSize: number;
  maxTeams: number;
  opensAt: string;
  closesAt: string;
  startsAt: string;
  phase: string;
  status: string;
  format: string;
  description: string;
  rules: string;
  registeredCount: number;
  registrations: Registration[];
  matches: Match[];
  champion: Team | null;
};
export type Dashboard = {
  teams: Team[];
  tournaments: Event[];
  totalRegistrations: number;
  upcomingMatches: Match[];
  recentResults: Match[];
};
export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-MatchFlow": "1",
      ...options.headers,
    },
  });
  const data = await response
    .json()
    .catch(() => ({
      error: "The API could not be reached. Check that the backend is running.",
    }));
  if (!response.ok)
    throw new RequestError(response.status, data.error || "Request failed.");
  return data;
}
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
    setLoading(true);
    setError("");
    api<T>(path, { signal: abort.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
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
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
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
