import { expect, test } from "@playwright/test";
import { createServer, transformWithEsbuild } from "vite";

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

let vite;
let fixtureUrl;

test.beforeAll(async () => {
  vite = await createServer({
    cacheDir: ".cache/vite-tests/pdf-output-preflight",
    configFile: false,
    root: process.cwd(),
    logLevel: "error",
    plugins: [jsxInAppJs()],
    resolve: {
      alias: {
        "@": process.cwd()
      }
    },
    optimizeDeps: {
      entries: ["tests/e2e/fixtures/pdf-output-preflight-fixture.html"],
      esbuildOptions: {
        loader: {
          ".js": "jsx"
        }
      }
    },
    css: { postcss: { plugins: [] } },
    server: { host: "127.0.0.1", port: 0 }
  });
  await vite.listen();
  const baseUrl = vite.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error("Vite fixture URL was not created");
  fixtureUrl = new URL(
    "tests/e2e/fixtures/pdf-output-preflight-fixture.html",
    baseUrl
  ).href;
});

test.afterAll(async () => {
  await vite?.close();
});

const snapshot = (page) => page.evaluate(
  () => window.__pdfOutputPreflightFixture.snapshot()
);

test("G1c re-audits warning confirmation before native print", async ({
  page
}, testInfo) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(fixtureUrl);
  await expect(page.locator("body")).toHaveAttribute(
    "data-fixture-status",
    "ready"
  );

  await page.getByTestId("fixture-print").click();
  const modal = page.getByTestId("pdf-output-preflight-modal");
  await expect(modal).toBeVisible();
  await expect(page.getByRole("dialog", {
    name: "PDF 출력 전에 확인해 주세요"
  })).toHaveCount(1);
  await expect(modal).toContainText("PDF 출력 전에 확인해 주세요");
  await expect(modal).toContainText("불러오는 중인 이미지");
  await expect.poll(() => snapshot(page)).toMatchObject({
    printCount: 0,
    reportStatus: "warning",
    issueCodes: ["image-load-pending"]
  });

  const warningScreenshot = testInfo.outputPath("g1c-warning-preflight.png");
  await modal.screenshot({ path: warningScreenshot });
  await testInfo.attach("g1c-warning-preflight", {
    path: warningScreenshot,
    contentType: "image/png"
  });

  await page.evaluate(() => {
    window.__pdfOutputPreflightFixture.addTableBlocker();
  });
  await page.getByRole("button", { name: "경고 확인 후 인쇄" }).click();
  await expect(modal).toContainText("PDF 출력 전에 해결해 주세요");
  await expect(page.getByRole("dialog", {
    name: "PDF 출력 전에 해결해 주세요"
  })).toHaveCount(1);
  await expect(modal).toContainText("한 페이지보다 큰 표 행");
  await expect(
    page.getByRole("button", { name: "경고 확인 후 인쇄" })
  ).toHaveCount(0);
  await expect.poll(() => snapshot(page)).toMatchObject({
    printCount: 0,
    reportStatus: "blocked",
    issueCodes: ["table-row-too-tall", "image-load-pending"]
  });

  const blockedScreenshot = testInfo.outputPath("g1c-blocked-preflight.png");
  await modal.screenshot({ path: blockedScreenshot });
  await testInfo.attach("g1c-blocked-preflight", {
    path: blockedScreenshot,
    contentType: "image/png"
  });

  await page.evaluate(() => {
    window.__pdfOutputPreflightFixture.resolveAllRisks();
  });
  await page.getByRole("button", { name: "다시 확인" }).click();
  await expect(modal).toHaveCount(0);
  await expect.poll(() => snapshot(page)).toEqual({
    imageState: "ready",
    printCount: 1,
    reportStatus: "closed",
    issueCodes: []
  });
  expect(browserErrors).toEqual([]);
});
