import type { MiddlewareHandler } from "hono";

const CORS_ALLOW_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const CORS_ALLOW_HEADERS = "Content-Type";
const LOCAL_ORIGIN_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const normalizeHostname = (hostname: string): string =>
  hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

export const isLocalBrowserOrigin = (origin: string | null): origin is string => {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return LOCAL_ORIGIN_HOSTS.has(normalizeHostname(url.hostname));
  } catch {
    return false;
  }
};

const applyCorsHeaders = (headers: Headers, origin: string): void => {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
  headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
  headers.append("Vary", "Origin");
};

export const createLocalDevCorsMiddleware = (): MiddlewareHandler => async (c, next) => {
  const origin = c.req.header("Origin") ?? null;

  if (c.req.method === "OPTIONS") {
    const headers = new Headers();
    if (isLocalBrowserOrigin(origin)) applyCorsHeaders(headers, origin);
    return new Response(null, { status: 204, headers });
  }

  await next();

  if (isLocalBrowserOrigin(origin)) applyCorsHeaders(c.res.headers, origin);
};
