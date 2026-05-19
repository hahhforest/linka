import { fileURLToPath } from "node:url";

import { resolvePort } from "../config/src/index.ts";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const defaultDaemonTarget = `http://127.0.0.1:${resolvePort()}`;
const daemonTarget =
  process.env.VITE_LINKA_DAEMON_URL ?? process.env.LINKA_DAEMON_URL ?? defaultDaemonTarget;

const sharedSourceEntry = fileURLToPath(new URL("../shared/src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@linka/shared": sharedSourceEntry,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/linka": {
        target: daemonTarget,
        changeOrigin: true,
      },
    },
  },
});
