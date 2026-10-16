import { defineConfig } from "vitest/config";
import { transformWithEsbuild } from "vite";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

const jsxInAppJs = () => ({
  name: "jsx-in-app-js",
  enforce: "pre",
  transform(code, id) {
    const normalizedId = id.replace(/\\/g, "/");

    if (!normalizedId.includes("/app/") || !normalizedId.endsWith(".js")) {
      return null;
    }

    return transformWithEsbuild(code, id, {
      jsx: "automatic",
      loader: "jsx"
    });
  }
});

export default defineConfig({
  plugins: [jsxInAppJs()],
  resolve: {
    alias: {
      "@": rootDir
    }
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.js"],
    // Keep the native `canvas` addon out of worker forks: it segfaults
    // (0xC0000005) at process exit and fails the release gate despite a
    // fully green suite. See tests/helpers/blockNativeCanvas.cjs.
    execArgv: [
      "--require",
      fileURLToPath(new URL("./tests/helpers/blockNativeCanvas.cjs", import.meta.url))
    ]
  }
});
