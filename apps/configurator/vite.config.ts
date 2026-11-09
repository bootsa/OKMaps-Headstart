import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	// Relative, so the page works wherever it is put (Pages: /<repo>/configure/).
	base: process.env.APP_BASE ?? "./",
	build: { target: "es2022" },
	server: { fs: { allow: [resolve(__dirname, "../..")] } },
});
