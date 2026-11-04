import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
export const apiLimit = rateLimit({
  windowMs: 60000,
  limit: env.NODE_ENV === "test" ? 10000 : 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a minute." },
});
export const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: env.NODE_ENV === "test" ? 1000 : 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
});
