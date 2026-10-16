import { expect, test } from "@playwright/test";
import { createServer, transformWithEsbuild } from "vite";

let vite;
let fixtureUrl;

test.beforeAll(async () => {
  vite = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "error",
    optimizeDeps: {
      entries: ["tests/e2e/fixtures/semantic-labeling-m5-fixture.html"],
      esbuildOptions: { loader: { ".js": "jsx" } },
      include: [
        "@tiptap/core",
        "@tiptap/extension-document",
        "@tiptap/extension-heading",
        "@tiptap/extension-paragraph",
        "@tiptap/extension-text",
        "react",
        "react-dom",
        "react-dom/client",
        "sud-ui"
      ]
    },
    css: { postcss: { plugins: [] } },
    plugins: [
      {
        name: "dockit-m5-jsx-in-js",
        enforce: "pre",
        async transform(code, id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (
            !normalizedId.endsWith(".js") ||
            (!normalizedId.endsWith(
              "/app/LIB/components/common/semantic/SemanticAttributesEditor.js"
            ) &&
              !normalizedId.endsWith(
                "/tests/e2e/fixtures/semantic-labeling-m5-fixture.js"
              ))
          ) {
            return null;
          }
          return transformWithEsbuild(code, id, {
            jsx: "automatic",
            loader: "jsx"
          });
        }
      },
      {
        name: "dockit-m5-setting-context",
        enforce: "pre",
        resolveId(source, importer) {
          const normalizedImporter = importer?.replaceAll("\\", "/");
          if (
            normalizedImporter?.endsWith(
              "/app/LIB/components/common/semantic/SemanticAttributesEditor.js"
            ) &&
            source === "../../../context/SettingContext"
          ) {
            return "\0dockit-m5-setting-context";
          }
          return null;
        },
        load(id) {
          if (id === "\0dockit-m5-setting-context") {
            return "export const useSetting = () => ({ setting: { theme: 'mint' } });";
          }
          return null;
        }
      }
    ],
    server: { host: "127.0.0.1", port: 0 }
  });
  await vite.listen();
  const baseUrl = vite.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error("M5 fixture URL was not created");
  fixtureUrl = new URL(
    "tests/e2e/fixtures/semantic-labeling-m5-fixture.html",
    baseUrl
  ).href;
});

test.afterAll(async () => {
  await vite?.close();
});

const getSnapshot = (page) =>
  page.evaluate(() => window.__dockitSemanticM5.snapshot());

const openFixture = async (page) => {
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.goto(fixtureUrl);
  await expect(page.locator("body")).toHaveAttribute(
    "data-fixture-status",
    "ready"
  );
  await expect(page.getByTestId("semantic-attributes-editor")).toBeVisible();
  return runtimeErrors;
};

const getPreviewMetrics = (locator) =>
  locator.evaluate((element) => {
    const nodes = [element, ...element.querySelectorAll("*")];
    return nodes.map((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        backgroundColor: style.backgroundColor,
        border: style.border,
        borderRadius: style.borderRadius,
        color: style.color,
        display: style.display,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        height: Number(rect.height.toFixed(2)),
        lineHeight: style.lineHeight,
        margin: style.margin,
        padding: style.padding,
        width: Number(rect.width.toFixed(2))
      };
    });
  });

test("desktop semantic edit preserves document attributes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const runtimeErrors = await openFixture(page);
  const semanticEditor = page.getByTestId("semantic-attributes-editor");
  const inputs = semanticEditor.locator("input");

  await inputs.nth(0).fill("cover.heroEdited");
  await inputs.nth(1).fill("visualHero");
  await semanticEditor.locator("button").last().click();

  await expect.poll(async () => {
    const snapshot = await getSnapshot(page);
    return snapshot.currentDocument.content[0].attrs.semanticKey;
  }).toBe("cover.heroEdited");

  const snapshot = await getSnapshot(page);
  expect(snapshot.currentDocument.content[0].attrs).toMatchObject({
    objectId: "object-cover",
    semanticKey: "cover.heroEdited",
    semanticRole: "visualHero",
    semanticTags: ["accent", "cover"]
  });
  expect(runtimeErrors).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath("semantic-m5-desktop.png"),
    fullPage: true
  });
});

test("mobile blocks duplicates and keeps read-only rendering identical", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const runtimeErrors = await openFixture(page);
  await page.getByTestId("m5-target-heading").click();

  const semanticEditor = page.getByTestId("semantic-attributes-editor");
  const inputs = semanticEditor.locator("input");
  const beforeDuplicate = await getSnapshot(page);
  await inputs.nth(0).fill("body.existing");
  await expect(semanticEditor.locator("[role='alert']")).toBeVisible();
  await expect(semanticEditor.locator("button").last()).toBeDisabled();
  expect((await getSnapshot(page)).currentDocument).toEqual(
    beforeDuplicate.currentDocument
  );

  await inputs.nth(0).fill("cover.subtitle");
  await inputs.nth(1).fill("documentSubtitle");
  await inputs.nth(1).press("Enter");
  await expect.poll(async () => {
    const snapshot = await getSnapshot(page);
    return snapshot.currentDocument.content[0].content[0].attrs.semanticKey;
  }).toBe("cover.subtitle");

  const afterApply = await getSnapshot(page);
  expect(afterApply.currentDocument.content[0].content[0].attrs).toMatchObject({
    blockId: "block-cover-title",
    headingId: "heading-cover-title",
    semanticKey: "cover.subtitle",
    semanticRole: "documentSubtitle",
    semanticTags: ["cover"]
  });

  const layout = await page.evaluate(() => ({
    bodyWidth: document.body.getBoundingClientRect().width,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.clientWidth);

  const plainPreview = page.getByTestId("m5-preview-plain");
  const semanticPreview = page.getByTestId("m5-preview-semantic");
  await expect(plainPreview).toHaveAttribute("aria-readonly", "true");
  await expect(semanticPreview).toHaveAttribute("aria-readonly", "true");
  expect(await plainPreview.locator("[contenteditable]").count()).toBe(0);
  expect(await semanticPreview.locator("[contenteditable]").count()).toBe(0);
  expect(await getPreviewMetrics(semanticPreview)).toEqual(
    await getPreviewMetrics(plainPreview)
  );

  const plainPixels = await plainPreview.screenshot();
  const semanticPixels = await semanticPreview.screenshot();
  expect(semanticPixels.equals(plainPixels)).toBe(true);
  expect(runtimeErrors).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath("semantic-m5-mobile.png"),
    fullPage: true
  });
});
