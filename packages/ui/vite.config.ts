import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import inject from "@rollup/plugin-inject";

export default defineConfig({
  plugins: [
    react(),
    inject({
      $: ["jquery", "*"],
      jQuery: "jquery",
    }),
  ],
  assetsInclude: ["**/*.csl"],
  resolve: {
    alias: {
      "@": "/src/",
      "@js": "/src/js/",

      "lib": "/src/lib",
      "markjs": "mark.js/dist/jquery.mark.js",
      // hypher: "hypher/dist/jquery.hypher.js",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setupTests.js",
    include: ["src/test/**/*.test.{ts,tsx,js,jsx}"],
  },
});
