import { defineConfig } from "vite";

export default defineConfig({
  root: process.cwd(),
  css: { postcss: { plugins: [] } },
  server: { host: "127.0.0.1" }
});
