import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "../database/client.js";
import { logger } from "./logger.js";
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  let status = 500,
    message = "Something went wrong. Please try again.";
  if (error instanceof ZodError) {
    status = 400;
    message = error.issues.map((i) => `${i.path.join(".") || "Input"}: ${i.message}`).join(" ");
  } else if (error instanceof ApiError) {
    status = error.status;
    message = error.message;
  } else if (
    typeof error === "object" &&
    error &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    status = 413;
    message = "Request body is too large.";
  } else if (error instanceof SyntaxError) {
    status = 400;
    message = "Invalid JSON request.";
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      status = 409;
      message = "This account, membership, or registration already exists.";
    }
    if (error.code === "P2034") {
      status = 409;
      message = "This record changed during your request. Refresh and try again.";
    }
  }
  // Do not serialize exception messages, request URLs, headers or bodies: they can contain secrets.
  if (status >= 500)
    logger.error(
      {
        requestId: req.requestId,
        code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "INTERNAL_ERROR",
      },
      "request failed",
    );
  if (status === 429) res.setHeader("Retry-After", "60");
  res.status(status).json({
    error: message,
    requestId: req.requestId,
    ...(error instanceof ZodError ? { issues: error.flatten() } : {}),
  });
};
