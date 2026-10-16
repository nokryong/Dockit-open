import { expect, test } from "@playwright/test";
import { createServer } from "vite";

let vite;
let fixtureUrl;

test.beforeAll(async () => {
  const externalFixtureUrl = process.env.DOCKIT_NOTE_INTERACTION_FIXTURE_URL;
  if (externalFixtureUrl) {
    fixtureUrl = externalFixtureUrl;
    return;
  }
  vite = await createServer({
    cacheDir: ".cache/vite-tests/note-interaction-caret",
    configFile: false,
    root: process.cwd(),
    logLevel: "error",
    optimizeDeps: {
      entries: ["tests/e2e/fixtures/note-interaction-fixture.html"],
      include: ["react", "react-dom", "react-dom/client", "sud-ui"]
    },
    css: { postcss: { plugins: [] } },
    server: { host: "127.0.0.1", port: 0 }
  });
  await vite.listen();
  const baseUrl = vite.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error("Vite fixture URL was not created");
  fixtureUrl = new URL(
    "tests/e2e/fixtures/note-interaction-fixture.html",
    baseUrl
  ).href;
});

test.afterAll(async () => {
  await vite?.close();
});

const snapshot = (page) => page.evaluate(
  () => window.__noteInteractionFixture.snapshot()
);

test("shortcut insertion and marker navigation keep the caret in the document", async ({ page }) => {
  await page.goto(fixtureUrl);
  await expect(page.locator("body")).toHaveAttribute("data-fixture-status", "ready");

  await page.evaluate(() => window.__noteInteractionFixture.focusMain(3));
  await page.keyboard.press("Control+Alt+f");
  await expect.poll(async () => (await snapshot(page)).selectionNoteId)
    .toBe("note-v1-browser-u1");
  await expect(page.locator(".dockit-note-reference")).toHaveText("1");

  await page.keyboard.type("note");
  await expect.poll(async () => (await snapshot(page)).bodyText).toBe("note");

  await page.keyboard.press("Escape");
  const afterEscape = await snapshot(page);
  expect(afterEscape.selectionNoteId).toBeNull();
  expect(afterEscape.selection.anchor).toBe(
    afterEscape.expectedReferenceReturnPosition
  );

  await page.keyboard.type("R");
  const afterMainTyping = await snapshot(page);
  expect(afterMainTyping.json.content[0].content).toEqual([
    { type: "text", text: "Al" },
    {
      type: "noteReference",
      attrs: { noteId: "note-v1-browser-u1", kind: "footnote" }
    },
    { type: "text", text: "Rpha" }
  ]);

  await page.locator(".dockit-note-reference").click();
  await expect.poll(async () => (await snapshot(page)).selectionNoteId)
    .toBe("note-v1-browser-u1");
  await page.keyboard.type("X");
  await expect.poll(async () => (await snapshot(page)).bodyText).toBe("Xnote");
});

test("marker deletion, undo, conversion, and menu deletion preserve note pairs", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(fixtureUrl);
  await expect(page.locator("body")).toHaveAttribute("data-fixture-status", "ready");

  await page.evaluate(() => window.__noteInteractionFixture.focusMain(3));
  await page.keyboard.press("Control+Alt+f");
  await expect.poll(async () => (await snapshot(page)).bodyCount).toBe(1);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Backspace");
  await expect.poll(async () => await snapshot(page)).toMatchObject({
    bodyCount: 0,
    referenceCount: 0
  });

  await page.keyboard.press("Control+z");
  await expect.poll(async () => await snapshot(page)).toMatchObject({
    bodyCount: 1,
    referenceCount: 1
  });

  await page.evaluate(() => {
    window.__noteContextMenuEvents = 0;
    window.__noteInteractionFixture.editor.view.dom.addEventListener(
      "contextmenu",
      () => { window.__noteContextMenuEvents += 1; },
      { once: true }
    );
  });
  await page.locator(".dockit-note-reference").click({ button: "right" });
  const convertItem = page.getByRole("menuitem").filter({ hasText: "미주로 변환" });
  await expect.poll(async () => ({
    consoleErrors,
    contextMenuEvents: await page.evaluate(() => window.__noteContextMenuEvents),
    menuItems: await convertItem.count()
  }), { timeout: 5000 }).toEqual({
    consoleErrors: [],
    contextMenuEvents: 1,
    menuItems: 1
  });
  await convertItem.click();
  await expect.poll(async () => (await snapshot(page)).bodyKind).toBe("endnote");
  await expect(page.locator(".dockit-endnote-section-heading")).toHaveText("미주");

  await page.locator('[data-dockit-note-body="true"]').click({ button: "right" });
  await page.getByRole("menuitem").filter({ hasText: "미주 삭제" }).click();
  await expect.poll(async () => await snapshot(page)).toMatchObject({
    bodyCount: 0,
    referenceCount: 0
  });
});

test.describe("read-only mobile touch", () => {
  test.use({ hasTouch: true });

  test("markers preview and scroll without moving the caret", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 720 });
    await page.goto(fixtureUrl);
    await expect(page.locator("body"))
      .toHaveAttribute("data-fixture-status", "ready");

    await page.evaluate(() => window.__noteInteractionFixture.focusMain(3));
    await page.keyboard.press("Control+Alt+f");
    await expect.poll(async () => (await snapshot(page)).bodyCount).toBe(1);
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.__noteInteractionFixture.enterReadOnly());

    const marker = page.locator(".dockit-note-reference");
    const beforeActivation = await snapshot(page);
    await expect(marker).toHaveClass(/is-read-only/);
    const markerStyles = await marker.evaluate((element) => {
      const visual = getComputedStyle(element);
      const hitArea = getComputedStyle(element, "::after");
      return {
        fontSize: visual.fontSize,
        verticalAlign: visual.verticalAlign,
        hitWidth: hitArea.width,
        hitHeight: hitArea.height
      };
    });
    expect(markerStyles).toMatchObject({
      verticalAlign: "super",
      hitWidth: "44px",
      hitHeight: "44px"
    });
    expect(Number.parseFloat(markerStyles.fontSize)).toBeLessThan(16);

    await marker.hover();
    await expect(page.locator(".dockit-note-reference-tooltip"))
      .toContainText("각주 1");
    await expect(page.locator(".dockit-note-reference-tooltip"))
      .toContainText("내용 없음");

    await marker.tap();
    const afterActivation = await snapshot(page);
    expect(afterActivation).toMatchObject({
      editable: false,
      bodyScrollCount: 1,
      selection: beforeActivation.selection
    });
    await expect(page.locator(".dockit-note-manual-panel")).toHaveCount(0);
    await expect(page.locator(".dockit-note-body-activator")).toHaveCount(0);

    await marker.click({ button: "right" });
    await expect(page.getByRole("menuitem")).toHaveCount(0);
  });
});
