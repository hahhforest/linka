import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const daemonTarget =
  process.env.VITE_LINKA_DAEMON_URL ?? process.env.LINKA_DAEMON_URL ?? "http://127.0.0.1:4510";

export default defineConfig({
  plugins: [react()],
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
