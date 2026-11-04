import { responseContract, announcementDto, scheduleDto } from "./response-contracts.js";
import { z } from "zod";
import {
  apiAnnouncementSchema,
  apiScheduleSchema,
} from "../../../../../packages/shared/src/developer.js";
const response = (path: string) => ({
  description:
    "Successful response. Cursor-paged lists use data and nextCursor. Standings are bounded by competition limits.",
  content: { "application/json": { schema: z.toJSONSchema(responseContract(path)) } },
});
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 429, 500, 503].map((s) => [
    s,
    {
      description: (
        {
          400: "Invalid input",
          401: "Invalid or expired credential",
          403: "Missing scope",
          404: "Resource unavailable",
          409: "Conflicting version or idempotency key",
          413: "Request too large",
          429: "Rate limit exceeded",
          500: "Internal failure",
          503: "Integration unavailable",
        } as Record<number, string>
      )[s],
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
    },
  ]),
);
const paging = [
  { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 50, default: 25 } },
  { in: "query", name: "after", schema: { type: "string" } },
];
const parameter = (name: string) => ({
  in: "path",
  name,
  required: true,
  schema: { type: "string" },
});
const paths: Record<string, unknown> = {};
for (const prefix of ["/public", ""]) {
  for (const [path, scope] of [
    ["/tournaments", "tournaments:read"],
    ["/tournaments/{id}", "tournaments:read"],
    ...[
      "matches",
      "bracket",
      "schedule",
      "results",
      "standings",
      "rounds",
      "teams",
      "announcements",
      ...(prefix ? [] : ["registrations"]),
    ].map((k) => [
      `/tournaments/{id}/${k}`,
      k === "registrations"
        ? "registrations:read"
        : ["teams", "announcements"].includes(k)
          ? "tournaments:read"
          : "matches:read",
    ]),
  ]) {
    paths[prefix + path] = {
      get: {
        summary: `Read ${path.split("/").at(-1) === "{id}" ? "tournament" : path.split("/").at(-1)}`,
        description: prefix
          ? "Public published resources only. Cookies and keys do not grant additional visibility."
          : `Required scope: ${scope}. Only explicitly selected organization tournaments.`,
        security: prefix ? [] : [{ apiKey: [] }],
        parameters: [...(path.includes("{id}") ? [parameter("id")] : []), ...paging],
        responses: { 200: response(path), ...errors },
      },
    };
  }
}
paths["/public/organizations"] = {
  get: {
    summary: "Public organizer profiles",
    security: [],
    parameters: paging,
    responses: { 200: response("/organizations"), ...errors },
  },
};
paths["/organization"] = {
  get: {
    summary: "Integration organization profile",
    description: "Requires tournaments:read. Excludes staff and account data.",
    security: [{ apiKey: [] }],
    responses: { 200: response("/organization"), ...errors },
  },
};
for (const [path, method, schema, scope] of [
  ["/tournaments/{id}/announcements", "post", apiAnnouncementSchema, "announcements:write"],
  ["/tournaments/{id}/matches/{matchId}/schedule", "put", apiScheduleSchema, "schedules:write"],
  ["/tournaments/{id}/rounds/{roundId}/schedule", "put", apiScheduleSchema, "schedules:write"],
] as const) {
  const old = (paths[path] || {}) as object;
  paths[path] = {
    ...old,
    [method]: {
      summary: method === "post" ? "Publish announcement" : "Schedule a match or battle round",
      description: `Requires ${scope}. Idempotency receipts persist; reusing a key with different content returns 409. Scheduling uses expectedVersion and all competition constraints.`,
      security: [{ apiKey: [] }],
      parameters: [
        parameter("id"),
        ...(path.includes("{matchId}")
          ? [parameter("matchId")]
          : path.includes("{roundId}")
            ? [parameter("roundId")]
            : []),
        {
          in: "header",
          name: "Idempotency-Key",
          required: true,
          schema: { type: "string", pattern: "^[a-zA-Z0-9_-]{8,100}$" },
        },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: z.toJSONSchema(schema) } },
      },
      responses: {
        [method === "post" ? 201 : 200]: {
          description: "Write committed (or prior idempotent response)",
          content: {
            "application/json": {
              schema: z.toJSONSchema(method === "post" ? announcementDto : scheduleDto),
            },
          },
        },
        ...errors,
      },
    },
  };
}
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "MatchFlow Developer API",
    version: "1.0.0",
    description:
      "Server-to-server Bearer credentials. Public endpoints support browser reads. 120 requests/minute per integration and 600 per organization; public/IP limit 300/minute, plus shared application IP protection. No private player data. Webhook delivery is at least once; consumers verify timestamps/signatures and deduplicate delivery IDs.",
  },
  servers: [{ url: "/api/v1" }],
  paths,
  components: {
    securitySchemes: {
      apiKey: {
        type: "http",
        scheme: "bearer",
        description: "mf_live_ credential. Never embed in a public client.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error", "requestId"],
        properties: { error: { type: "string" }, requestId: { type: "string" } },
      },
    },
  },
};
