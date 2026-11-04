import { Prisma, PrismaClient } from "@prisma/client";
import "../config/env.js";
export const db = new PrismaClient();
export type Tx = Prisma.TransactionClient;
export async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 3
      )
        continue;
      throw error;
    }
  }
}
export const publicUser = { id: true, username: true, role: true } as const;
export const teamInclude = {
  captain: { select: publicUser },
  members: {
    include: { user: { select: publicUser } },
    orderBy: { joinedAt: "asc" as const },
  },
};
export const publicTeam = {
  id: true,
  name: true,
  game: true,
  captainId: true,
  description: true,
  logoUrl: true,
  region: true,
  archivedAt: true,
} as const;
export const matchInclude = {
  teamA: { select: publicTeam },
  teamB: { select: publicTeam },
  winner: { select: publicTeam },
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireCondition(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new ApiError(status, message);
}
