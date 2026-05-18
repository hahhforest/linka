import { serve, type ServerType } from "@hono/node-server";
import type { Hono } from "hono";

type FetchHandler = (request: Request) => Response | Promise<Response>;

export interface DaemonServerOptions {
  readonly app: Hono;
  readonly port: number;
  readonly hostname?: string;
  readonly serveImpl?: typeof serve;
}

export interface DaemonServer {
  readonly port: number;
  readonly hostname?: string;
  readonly serveHTTP: FetchHandler;
  readonly start: () => ServerType;
  readonly shutdown: () => Promise<void>;
}

export function createDaemonServer(options: DaemonServerOptions): DaemonServer {
  let nodeServer: ServerType | null = null;
  const serveImpl = options.serveImpl ?? serve;

  const shutdown = async (): Promise<void> => {
    if (!nodeServer) {
      return;
    }

    const server = nodeServer;
    nodeServer = null;

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  };

  return {
    port: options.port,
    hostname: options.hostname,
    serveHTTP: (request) => options.app.fetch(request),
    start: () => {
      if (nodeServer) {
        return nodeServer;
      }

      nodeServer = serveImpl({
        fetch: options.app.fetch,
        port: options.port,
        hostname: options.hostname,
      });
      return nodeServer;
    },
    shutdown,
  };
}
