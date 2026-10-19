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
    // 네이티브 `canvas` 애드온은 워커 프로세스에서 제외
    // (종료 시 0xC0000005로 죽어서 테스트가 다 통과해도 릴리즈 검사가 실패함, tests/helpers/blockNativeCanvas.cjs 참고)
    execArgv: [
      "--require",
      fileURLToPath(new URL("./tests/helpers/blockNativeCanvas.cjs", import.meta.url))
    ]
  }
});
