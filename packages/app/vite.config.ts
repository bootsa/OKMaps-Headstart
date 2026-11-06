import { resolve } from "node:path";
import { defineConfig } from "vite";
import { serviceWorker } from "./scripts/sw-plugin.ts";

export default defineConfig({
  base: process.env.APP_BASE ?? "/",
  build: {
    target: "es2022",
    rollupOptions: {
      input: { index: resolve(__dirname, "index.html"), map: resolve(__dirname, "map.html") },
    },
  },
  worker: { format: "es" },
  server: { fs: { allow: [resolve(__dirname, "..")] } },
  plugins: [serviceWorker(resolve(__dirname, "sw/sw.js"))],
});
