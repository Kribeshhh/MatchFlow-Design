import { z } from "zod";
import { text } from "./common.js";
export const idBody = z.object({ teamId: text(1, 100) }).strict();
export const memberSchema = z.object({ userId: text(1, 100) }).strict();
export const reviewSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) }).strict();
