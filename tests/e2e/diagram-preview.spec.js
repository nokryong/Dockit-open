import { expect, test } from "@playwright/test";
import { createServer, transformWithEsbuild } from "vite";

let vite;
let fixtureUrl;

test.beforeAll(async () => {
  vite = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "error",
    esbuild: { jsx: "automatic" },
    optimizeDeps: {
      entries: ["tests/e2e/fixtures/diagram-preview-fixture.html"],
      esbuildOptions: { loader: { ".js": "jsx" } },
      include: ["react", "react-dom", "react-dom/client", "@tiptap/react", "@tiptap/core", "antd", "@excalidraw/excalidraw"]
    },
    css: { postcss: { plugins: [] } },
    plugins: [{
      name: "diagram-browser-fixture",
      enforce: "pre",
      resolveId(source) {
        if (source === "@/desktop/dynamic") return "\0diagram-dynamic";
        if (source.endsWith("/context/SettingContext")) return "\0diagram-setting";
        if (source.endsWith("/context/DarkModeContext")) return "\0diagram-dark-mode";
        return null;
      },
      load(id) {
        if (id === "\0diagram-dynamic") return 'import { lazy, Suspense, createElement } from "react"; export default function dynamic(loader) { const Component = lazy(loader); return function(props) { return createElement(Suspense, {fallback: null}, createElement(Component, props)); }; }';
        if (id === "\0diagram-setting") return 'export const useSetting = () => ({ setting: { theme: "mint" } });';
        if (id === "\0diagram-dark-mode") return 'export const useDarkMode = () => ({ isDarkMode: new URLSearchParams(location.search).has("dark"), currentColors: { mint: Array(10).fill("#167c68") } });';
        return null;
      },
      transform(code, id) {
        const normalized = id.replaceAll("\\", "/");
        if (normalized.includes("/app/") && normalized.endsWith(".js")) {
          return transformWithEsbuild(code, id, { loader: "jsx", jsx: "automatic" });
        }
        return null;
      }
    }],
    server: { host: "127.0.0.1", port: 0 }
  });
  await vite.listen();
  fixtureUrl = new URL("tests/e2e/fixtures/diagram-preview-fixture.html", vite.resolvedUrls.local[0]).href;
});

test.afterAll(async () => { await vite?.close(); });

const open = async (page, suffix = "") => {
  await page.goto(fixtureUrl + suffix);
  await expect(page.locator("body")).toHaveAttribute("data-fixture-status", "ready");
  await expect(page.locator(".diagram-preview-image")).toHaveCount(3);
  await expect.poll(() => page.locator(".diagram-preview-image").first().evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
};

test("cached diagrams render without the editor runtime in read-only and print views", async ({ page }, testInfo) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, "?readonly&dark");
  await expect(page.locator(".excalidraw")).toHaveCount(0);
  await expect(page.locator(".diagram-edit-trigger")).toHaveCount(0);
  expect(requests.filter((url) => /excalidraw|DiagramEditorModal|diagramPreviewRuntime/.test(url))).toEqual([]);
  const before = await page.evaluate(() => window.__diagramFixture.snapshot());
  await page.locator(".diagram-preview").first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.__diagramFixture.snapshot())).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem("dockit-diagram-preview-fixture"))).toBeNull();
  await page.emulateMedia({ media: "print" });
  expect(await page.locator(".diagram-preview-image").first().evaluate((img) => getComputedStyle(img).filter)).toBe("none");
  await page.screenshot({ path: testInfo.outputPath("diagram-print.png"), fullPage: true });
  await page.pdf({ path: testInfo.outputPath("diagram-print.pdf"), printBackground: true });
});

test("one editor applies changes, preserves neighboring content, and reopens from HTML", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  const before = await page.evaluate(() => window.__diagramFixture.snapshot());
  await page.getByRole("button", { name: "다이어그램 편집", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".excalidraw")).toHaveCount(1);
  await expect(page.locator(".excalidraw canvas.interactive")).toBeVisible();
  await expect.poll(() => page.getByRole("dialog").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await page.screenshot({ path: testInfo.outputPath("diagram-editor-desktop.png") });
  await page.locator(".excalidraw canvas.interactive").click({ position: { x: 200, y: 200 } });
  await page.keyboard.press("r");
  const bounds = await page.locator(".excalidraw canvas.interactive").boundingBox();
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.85, bounds.y + bounds.height * 0.8);
  await page.mouse.up();
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".excalidraw")).toHaveCount(0);
  const edited = await page.evaluate(() => window.__diagramFixture.scene());
  expect(edited.elements.filter((element) => !element.isDeleted)).toHaveLength(3);
  expect(edited.originalMetadata).toEqual({ preserved: true });
  expect(edited.dockitPreview.svg).toContain("<svg");
  const after = await page.evaluate(() => window.__diagramFixture.snapshot());
  expect(after.json.content.slice(2)).toEqual(before.json.content.slice(2));
  expect(after.json.content[0]).toEqual(before.json.content[0]);
  expect(await page.evaluate(() => window.__diagramFixture.undo())).toBe(true);
  expect((await page.evaluate(() => window.__diagramFixture.snapshot())).json).toEqual(before.json);
  expect(await page.evaluate(() => window.__diagramFixture.redo())).toBe(true);
  expect(await page.evaluate(() => window.__diagramFixture.scene())).toEqual(edited);
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.reload();
  await expect(page.locator(".diagram-preview-image")).toHaveCount(3);
  expect(await page.evaluate(() => window.__diagramFixture.scene())).toEqual(edited);
  expect(requests.filter((url) => /excalidraw|DiagramEditorModal|diagramPreviewRuntime/.test(url))).toEqual([]);
});

test("narrow-screen editing can be cancelled and a deleted target cannot be saved", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 420, height: 850 });
  await open(page);
  const before = await page.evaluate(() => window.__diagramFixture.snapshot());
  await page.getByRole("button", { name: "다이어그램 편집", exact: true }).first().click();
  await expect(page.locator(".excalidraw")).toHaveCount(1);
  const dialogBounds = await page.getByRole("dialog").boundingBox();
  expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(420);
  await expect.poll(() => page.getByRole("dialog").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await page.screenshot({ path: testInfo.outputPath("diagram-editor-narrow.png") });
  const toolbarMetrics = await page.locator(".App-toolbar--mobile").evaluate((toolbar) => ({
    left: toolbar.getBoundingClientRect().left,
    width: toolbar.getBoundingClientRect().width,
    scrollWidth: toolbar.scrollWidth,
    tools: [...toolbar.querySelectorAll("label.ToolIcon")].map((tool) => ({
      title: tool.title,
      left: tool.getBoundingClientRect().left,
      width: tool.getBoundingClientRect().width
    }))
  }));
  expect(toolbarMetrics.tools[0].left).toBeGreaterThanOrEqual(toolbarMetrics.left);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.__diagramFixture.snapshot())).toEqual(before);
  await expect(page.getByRole("button", { name: "다이어그램 편집", exact: true }).first()).toBeFocused();
  await page.getByRole("button", { name: "다이어그램 편집", exact: true }).first().click();
  await expect(page.locator(".excalidraw")).toHaveCount(1);
  await page.evaluate(() => window.__diagramFixture.removeDiagrams());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".excalidraw")).toHaveCount(0);
});

test("legacy scenes generate a preview without mounting an editor or writing read-only content", async ({ page }) => {
  await open(page, "?legacy&readonly");
  await expect(page.locator(".excalidraw")).toHaveCount(0);
  expect(await page.evaluate(() => window.__diagramFixture.scene())).not.toHaveProperty("dockitPreview");
  expect(await page.evaluate(() => localStorage.getItem("dockit-diagram-preview-fixture"))).toBeNull();
  expect(await page.locator(".diagram-preview-image").first().evaluate(async (img) => (await (await fetch(img.src)).text()))).toContain("자료 확인");
});

test("editable legacy scenes cache SVGs without adding an undo step", async ({ page }) => {
  await open(page, "?legacy");
  await expect.poll(() => page.evaluate(() => window.__diagramFixture.scene().dockitPreview?.version)).toBe(1);
  expect(await page.evaluate(() => window.__diagramFixture.undo())).toBe(false);
  expect((await page.evaluate(() => window.__diagramFixture.scene())).originalMetadata).toEqual({ preserved: true });
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.reload();
  await expect(page.locator(".diagram-preview-image")).toHaveCount(3);
  expect(requests.filter((url) => /excalidraw|diagramPreviewRuntime/.test(url))).toEqual([]);
});

test("concurrent scene changes are preserved when an older edit is completed", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "다이어그램 편집", exact: true }).first().click();
  await expect(page.locator(".excalidraw")).toHaveCount(1);
  await page.evaluate(() => {
    const scene = window.__diagramFixture.scene();
    scene.elements[0].strokeColor = "#ff0000";
    window.__diagramFixture.updateScene(0, scene);
  });
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("다이어그램이 변경됐어요");
  expect((await page.evaluate(() => window.__diagramFixture.scene())).elements[0].strokeColor).toBe("#ff0000");
  await page.getByRole("button", { name: "취소", exact: true }).click();
});

test("saving an edit preserves metadata updated while the editor was open", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "다이어그램 편집", exact: true }).first().click();
  await expect(page.locator(".excalidraw")).toHaveCount(1);
  await page.evaluate(() => {
    const scene = window.__diagramFixture.scene();
    scene.originalMetadata = { preserved: true, updated: "during-edit" };
    window.__diagramFixture.updateScene(0, scene);
  });
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await page.evaluate(() => window.__diagramFixture.scene())).originalMetadata).toEqual({ preserved: true, updated: "during-edit" });
});
