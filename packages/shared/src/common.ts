import { z } from "zod";
export const gameSchema = z.enum(["pubg", "ml", "ff", "cs2", "valorant", "dota"]);
export const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const idSchema = z.string().min(1).max(100);
