import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

type ErrorDetails = Record<string, unknown>;

export interface DaemonErrorBody {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: ErrorDetails;
  };
}

export function errorResponse(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: ErrorDetails,
): Response {
  const body: DaemonErrorBody = {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };

  return c.json(body, status as never);
}

export function handleDaemonError(error: Error, c: Context): Response {
  if (error instanceof HTTPException) {
    return errorResponse(c, error.status, "HTTP_ERROR", error.message || "HTTP error");
  }

  return errorResponse(c, 500, "INTERNAL_ERROR", "Internal daemon error");
}
