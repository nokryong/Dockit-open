import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { createServer, transformWithEsbuild } from "vite";

let vite;
let fixtureUrl;

test.beforeAll(async () => {
  vite = await createServer({
    configFile: false, root: process.cwd(), logLevel: "error",
    cacheDir: ".cache/vite-tests/diagram-preview",
    esbuild: { jsx: "automatic" },
    optimizeDeps: {
      entries: ["tests/e2e/fixtures/diagram-preview-fixture.html"],
      esbuildOptions: { loader: { ".js": "jsx" } },
      include: ["react", "react-dom", "react-dom/client", "@tiptap/react", "@tiptap/core", "sud-ui"],
    },
    css: { postcss: { plugins: [] } },
    plugins: [{
      name: "diagram-browser-fixture", enforce: "pre",
      resolveId(source) {
        if (source.endsWith("/context/SettingContext")) return "\0diagram-setting";
        if (source.endsWith("/context/DarkModeContext")) return "\0diagram-dark-mode";
        return null;
      },
      load(id) {
        if (id === "\0diagram-setting") return 'export const useSetting = () => ({ setting: { theme: "mint" } });';
        if (id === "\0diagram-dark-mode") return 'export const useDarkMode = () => ({ isDarkMode: new URLSearchParams(location.search).has("dark"), currentColors: { mint: Array(10).fill("#167c68") } });';
        return null;
      },
      transform(code, id) {
        if (id.replaceAll("\\", "/").includes("/app/") && id.endsWith(".js"))
          return transformWithEsbuild(code, id, { loader: "jsx", jsx: "automatic" });
        return null;
      },
    }],
    server: { host: "127.0.0.1", port: 0 },
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
const first = page => page.locator(".diagram-edit-trigger").first();
const codeEditor = page => page.getByRole("textbox", { name: "Mermaid 코드", exact: true });

test("diagram margins are included in the node height measured by pagination", async ({ page }) => {
  await open(page);
  await page.addStyleTag({ content: fs.readFileSync("app/LIB/css/tiptap.css", "utf8") });
  await page.locator(".ProseMirror").evaluate(element => element.classList.add("prose"));
  for (const media of ["screen", "print"]) {
    await page.emulateMedia({ media });
    const sizes = await page.locator(".node-diagramBlock").evaluateAll(nodes => nodes.map(node => {
      const frame = node.querySelector(".diagram-frame-container");
      const styles = getComputedStyle(frame);
      return { measured: node.getBoundingClientRect().height,
        content: frame.getBoundingClientRect().height,
        margin: parseFloat(styles.marginTop) + parseFloat(styles.marginBottom) };
    }));
    for (const size of sizes) {
      expect(size.margin).toBe(8);
      expect(size.measured).toBeGreaterThanOrEqual(size.content + size.margin - 0.1);
    }
  }
});

test("selected diagram font regenerates its SVG, embeds web fonts, persists and supports undo", async ({ page }) => {
  await open(page);
  await page.addStyleTag({ content: '@font-face {font-family: "DiagramTestFont";src:url("/node_modules/katex/dist/fonts/KaTeX_Typewriter-Regular.woff2") format("woff2");}' });
  await page.evaluate(() => window.__diagramFixture.updateCode(0, "flowchart LR\n A[WWW iii 123] --> B[MMM 456]"));
  await expect.poll(() => page.evaluate(() => window.__diagramFixture.attrs().previewCode)).toContain("WWW iii 123");
  const before = await page.evaluate(() => window.__diagramFixture.snapshot());
  await first(page).click();
  expect(await page.evaluate(() => window.__diagramFixture.setFont("DiagramTestFont"))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__diagramFixture.attrs().previewFontFamily)).toBe("DiagramTestFont");
  const changed = await page.evaluate(() => window.__diagramFixture.snapshot());
  const diagram = changed.json.content.find(node => node.type === "diagramBlock");
  expect(diagram.attrs.previewSvg).toContain("DiagramTestFont");
  expect(diagram.attrs.previewSvg).toMatch(/@font-face\{[^}]*src:url\("data:/);
  const changedPixels = await page.evaluate(async svg => {
    const withoutFont = svg.replace(/<style>\s*@font-face[\s\S]*?<\/style>/, "");
    const render = async content => {
      const url = URL.createObjectURL(new Blob([content], { type: "image/svg+xml" }));
      try {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      } finally { URL.revokeObjectURL(url); }
    };
    const [embedded, fallback] = await Promise.all([render(svg), render(withoutFont)]);
    return embedded.reduce((count, value, index) => count + (value !== fallback[index] ? 1 : 0), 0);
  }, diagram.attrs.previewSvg);
  expect(changedPixels).toBeGreaterThan(100);
  expect(changed.json.content.filter(node => node.type === "diagramBlock").slice(1))
    .toEqual(before.json.content.filter(node => node.type === "diagramBlock").slice(1));
  await page.evaluate(() => window.__diagramFixture.undo());
  await expect.poll(() => page.evaluate(() => window.__diagramFixture.attrs().fontFamily)).toBe("");
  await page.evaluate(() => window.__diagramFixture.redo());
  await expect.poll(() => page.evaluate(() => window.__diagramFixture.attrs().fontFamily)).toBe("DiagramTestFont");
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-fixture-status", "ready");
  expect((await page.evaluate(() => window.__diagramFixture.attrs())).fontFamily).toBe("DiagramTestFont");
  expect((await page.evaluate(() => window.__diagramFixture.attrs())).previewSvg).toMatch(/@font-face/);
});

test("single click selects, double click edits inline, outside click saves, and HTML reopens", async ({ page }, testInfo) => {
  await open(page);
  const before = await page.evaluate(() => window.__diagramFixture.snapshot());
  await first(page).click();
  expect((await page.evaluate(() => window.__diagramFixture.selection())).type).toMatch(/NodeSelection$/);
  await expect(codeEditor(page)).toHaveCount(0);
  await expect(page.getByText("코드 복사", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.locator("[data-diagram-handle=x]").first().evaluate(el=>getComputedStyle(el).opacity)).toBe("1");
  await first(page).dblclick();
  await expect(codeEditor(page)).toBeFocused();
  const code = "flowchart LR\n  A[입력] --> B{검사}\n  B -->|통과| C[완료]";
  await codeEditor(page).fill(code);
  await page.screenshot({ path: testInfo.outputPath("diagram-inline-editor.png") });
  await page.getByText("다이어그램 뒤 문단", { exact: true }).click();
  await expect(codeEditor(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__diagramFixture.attrs().previewCode)).toBe(code);
  const attrs = await page.evaluate(() => window.__diagramFixture.attrs());
  expect(attrs.code).toBe(code);
  expect(attrs.previewSvg).toContain("<svg");
  const after = await page.evaluate(() => window.__diagramFixture.snapshot());
  expect(after.json.content[0]).toEqual(before.json.content[0]);
  expect(after.json.content.slice(2)).toEqual(before.json.content.slice(2));
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__diagramFixture?.attrs().code)).toBe(code);
  await expect(page.locator(".diagram-preview-image")).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("diagram-object.png"), fullPage: true });
});

test("right, bottom, and corner handles persist dimensions and preserve selection", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1000 });
  await open(page);
  await first(page).click();
  for (const axis of ["x", "y", "xy"]) {
    const frame = page.locator(".diagram-frame-container").first();
    const before = await frame.boundingBox();
    const handle = await page.locator("[data-diagram-handle=" + axis + "]").first().boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + (axis === "y" ? 0 : -60), handle.y + handle.height / 2 + (axis === "x" ? 0 : 40));
    await page.mouse.up();
    const after = await frame.boundingBox();
    expect(Math.round(after.width)).toBe(Math.round(before.width) - (axis === "y" ? 0 : 60));
    expect(Math.round(after.height)).toBe(Math.round(before.height) + (axis === "x" ? 0 : 40));
    const attrs = await page.evaluate(() => window.__diagramFixture.attrs());
    expect(attrs.width).toBe(Math.round(after.width));
    expect(attrs.height).toBe(Math.round(after.height));
    expect((await page.evaluate(() => window.__diagramFixture.selection())).type).toMatch(/NodeSelection$/);
  }
});

test("Escape cancels, editing switches objects, and undo restores code", async ({ page }) => {
  await open(page);
  const original = (await page.evaluate(() => window.__diagramFixture.attrs())).code;
  await first(page).dblclick();
  await codeEditor(page).fill("flowchart LR\n A --> B");
  await page.keyboard.press("Escape");
  await expect(codeEditor(page)).toHaveCount(0);
  expect((await page.evaluate(() => window.__diagramFixture.attrs())).code).toBe(original);
  await first(page).dblclick();
  await codeEditor(page).fill("flowchart LR\n A[변경] --> B");
  await page.locator(".diagram-edit-trigger").nth(1).dblclick();
  await expect(codeEditor(page)).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__diagramFixture.attrs().code)).toContain("변경");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__diagramFixture.undo());
  await expect.poll(() => page.evaluate(() => window.__diagramFixture.attrs().code)).toBe(original);
  await page.evaluate(() => window.__diagramFixture.redo());
  await expect.poll(() => page.evaluate(() => window.__diagramFixture.attrs().code)).toContain("변경");
});

test("read-only and print show only cached diagrams without editing or mutation", async ({ page }, testInfo) => {
  const requests = [];
  page.on("request", request => requests.push(request.url()));
  await open(page, "?readonly&dark");
  const before = await page.evaluate(() => window.__diagramFixture.snapshot());
  await page.locator(".diagram-preview").first().dblclick();
  await expect(codeEditor(page)).toHaveCount(0);
  await expect(page.locator(".diagram-edit-trigger")).toHaveCount(0);
  expect(await page.evaluate(() => window.__diagramFixture.snapshot())).toEqual(before);
  expect(requests.filter(url => /excalidraw|mermaid.*\\.js/.test(url))).toEqual([]);
  await page.emulateMedia({ media: "print" });
  expect(await page.locator(".diagram-preview-image").first().evaluate(img=>getComputedStyle(img).filter)).toBe("none");
  await page.screenshot({ path: testInfo.outputPath("diagram-print.png"), fullPage: true });
});

test("invalid code remains editable, and narrow layouts keep the object inside the document", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await open(page);
  await first(page).dblclick();
  await codeEditor(page).fill("not valid mermaid");
  await page.getByText("다이어그램 뒤 문단", { exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Mermaid 문법을 확인해주세요.");
  expect((await page.evaluate(() => window.__diagramFixture.attrs())).code).toBe("not valid mermaid");
  await first(page).dblclick();
  await codeEditor(page).fill("flowchart TD\n A[복구] --> B[완료]");
  await page.getByText("다이어그램 뒤 문단", { exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__diagramFixture.attrs().previewCode)).toContain("복구");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
