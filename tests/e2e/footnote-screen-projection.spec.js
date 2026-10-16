import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { createServer } from "vite";

let vite;
let fixtureUrl;

test.beforeAll(async () => {
  const externalFixtureUrl = process.env.DOCKIT_FOOTNOTE_FIXTURE_URL;
  if (externalFixtureUrl) {
    fixtureUrl = externalFixtureUrl;
    return;
  }
  vite = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "error",
    optimizeDeps: {
      entries: ["tests/e2e/fixtures/footnote-screen-fixture.html"]
    },
    css: { postcss: { plugins: [] } },
    server: { host: "127.0.0.1", port: 0 }
  });
  await vite.listen();
  const baseUrl = vite.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error("Vite fixture URL was not created");
  fixtureUrl = new URL(
    "tests/e2e/fixtures/footnote-screen-fixture.html",
    baseUrl
  ).href;
});

test.afterAll(async () => {
  await vite?.close();
});

const waitForStableProjection = async (page) => {
  await expect.poll(() => page.evaluate(
    () => ({
      status: window.__footnoteFixture?.payload?.footnoteStatus || null,
      printState: document.querySelector("#editor")?.getAttribute(
        "data-dockit-footnote-print-state"
      ) || null
    })
  )).toEqual({ status: "stable", printState: "ready" });
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  ));
  await expect.poll(() => page.evaluate(
    () => document.querySelector("#editor")?.getAttribute(
      "data-dockit-footnote-print-state"
    ) || null
  )).toBe("ready");
};

const getSnapshot = (page) => page.evaluate(() => {
  const rect = (element) => {
    const value = element.getBoundingClientRect();
    return {
      top: value.top,
      right: value.right,
      bottom: value.bottom,
      left: value.left,
      width: value.width,
      height: value.height
    };
  };
  const source = document.querySelector(
    '[data-dockit-note-body="true"][data-dockit-note-kind="footnote"]'
  );
  const projections = [...document.querySelectorAll(
    ".dockit-footnote-screen-projection"
  )].map((element) => {
    const canonical = element.dataset.footnoteCanonical === "true";
    const content = canonical ? source : element;
    return {
      pageNumber: Number(
        element.closest("[data-pagination-page]")?.dataset.paginationPage
      ),
      rect: rect(element),
      canonical,
      cloneWidth: Number.parseFloat(
        element.querySelector(
          ".dockit-footnote-screen-projection__content"
        )?.style.width
      ),
      hasBold: Boolean(content?.querySelector("strong")),
      linkHref: content?.querySelector("a")?.getAttribute("href") || null,
      linkTabIndex:
        content?.querySelector("a")?.getAttribute("tabindex") || null
    };
  });
  const chrome = [...document.querySelectorAll(
    ".dockit-footnote-screen-projection__separator"
  )].map((element) => ({
    pageNumber: Number(element.closest("[data-pagination-page]")?.dataset.paginationPage),
    rect: rect(element),
    text: element.textContent.trim()
  }));
  const model = window.__footnoteFixture.model;
  const editor = document.querySelector(".ProseMirror");
  const mainFlowTextRects = [];
  if (editor) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const parent = textNode.parentElement;
      if (
        !textNode.textContent.trim() ||
        parent?.closest('[data-dockit-note-body="true"]') ||
        parent?.closest(".ProseMirror-widget")
      ) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(textNode);
      mainFlowTextRects.push(...[...range.getClientRects()].map((value) => ({
        top: value.top,
        bottom: value.bottom
      })));
      range.detach?.();
    }
  }

  return {
    status: window.__footnoteFixture.payload?.footnoteStatus || "legacy",
    totalPages: model?.totalPages || 0,
    source: {
      projected: source?.parentElement?.parentElement?.getAttribute(
        "data-dockit-footnote-projection-active"
      ),
      role: source?.getAttribute("role"),
      ariaHidden: source?.getAttribute("aria-hidden"),
      canonical: source?.getAttribute(
        "data-dockit-footnote-projection-canonical"
      ),
      parentIsEditor: source?.parentElement === editor,
      position: source ? getComputedStyle(source).position : null,
      display: source ? getComputedStyle(source).display : null,
      rect: source ? rect(source) : null
    },
    projections,
    chrome,
    pageRects: [...document.querySelectorAll("[data-pagination-page]")].map(
      (element) => ({
        pageNumber: Number(element.dataset.paginationPage),
        rect: rect(element)
      })
    ),
    mainFlowTextRects,
    modelPages: model?.pages?.map((page) => ({
      pageNumber: page.pageNumber,
      contentFrameWidth: page.contentFrameWidth,
      mainFlowFrameHeight: page.mainFlowFrameHeight,
      footnoteReservedHeight: page.footnoteReservedHeight
    })) || [],
    consoleErrors: window.__consoleErrors
  };
});

const expectProjectionGeometry = (snapshot) => {
  expect(snapshot.totalPages).toBeGreaterThan(1);
  expect(snapshot.projections.length).toBeGreaterThan(1);
  expect(snapshot.chrome.length).toBeGreaterThan(1);
  expect(snapshot.source).toMatchObject({
    projected: "true",
    role: "doc-footnote",
    ariaHidden: null,
    canonical: "true",
    parentIsEditor: true,
    position: "absolute"
  });
  expect(snapshot.source.display).not.toBe("none");
  expect(snapshot.consoleErrors).toEqual([]);
  expect(snapshot.projections.filter(({ canonical }) => canonical)).toHaveLength(1);
  expect(snapshot.projections.filter(({ canonical }) => !canonical).length)
    .toBeGreaterThan(0);
  snapshot.projections.forEach((projection) => {
    const page = snapshot.modelPages.find(
      (candidate) => candidate.pageNumber === projection.pageNumber
    );
    expect(Math.abs(projection.rect.width - page.contentFrameWidth)).toBeLessThanOrEqual(1);
    if (!projection.canonical) {
      expect(Math.abs(projection.cloneWidth - page.contentFrameWidth)).toBeLessThanOrEqual(1);
    }
    expect(projection.hasBold).toBe(true);
    if (projection.canonical) {
      expect(projection.linkHref).toBe("https://example.com/footnote");
    } else {
      expect(projection.linkHref).toBeNull();
      expect(projection.linkTabIndex).toBeNull();
    }
  });
  const canonicalProjection = snapshot.projections.find(
    ({ canonical }) => canonical
  );
  expect(Math.abs(
    snapshot.source.rect.left - canonicalProjection.rect.left
  )).toBeLessThanOrEqual(1);
  expect(Math.abs(
    snapshot.source.rect.top - canonicalProjection.rect.top
  )).toBeLessThanOrEqual(1);
  expect(Math.abs(
    snapshot.source.rect.width - canonicalProjection.rect.width
  )).toBeLessThanOrEqual(1);
  expect(snapshot.source.rect.height)
    .toBeLessThanOrEqual(canonicalProjection.rect.height + 1);
  snapshot.chrome.forEach((entry) => {
    expect(Math.abs(entry.rect.height - 18)).toBeLessThanOrEqual(0.5);
    const pageProjections = snapshot.projections.filter(
      (projection) => projection.pageNumber === entry.pageNumber
    );
    expect(pageProjections.length).toBeGreaterThan(0);
    expect(entry.rect.bottom).toBeLessThanOrEqual(
      Math.min(...pageProjections.map((projection) => projection.rect.top)) + 1
    );
    const page = snapshot.pageRects.find(
      (candidate) => candidate.pageNumber === entry.pageNumber
    );
    const overlappingMainFlowText = snapshot.mainFlowTextRects.filter(
      (textRect) =>
        textRect.top < page.rect.bottom - 1 &&
        textRect.bottom > entry.rect.top + 1
    );
    expect(overlappingMainFlowText).toEqual([]);
  });
};

test("N4b1b-C converges and projects long rich footnotes on desktop/mobile widths", async ({
  page
}, testInfo) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await waitForStableProjection(page);
  const initialSnapshot = await getSnapshot(page);
  expectProjectionGeometry(initialSnapshot);

  const previousVersion = await page.evaluate(
    () => window.__footnoteFixture.updateVersion
  );
  await page.evaluate(() => {
    window.__footnoteFixture.recreate({ width: 420, fontSize: 17 });
  });
  await expect.poll(() => page.evaluate(
    () => window.__footnoteFixture.updateVersion
  )).toBeGreaterThan(previousVersion);
  await waitForStableProjection(page);
  expectProjectionGeometry(await getSnapshot(page));

  await page.screenshot({
    path: testInfo.outputPath("footnote-screen-mobile.png"),
    fullPage: true
  });

  const zoomVersion = await page.evaluate(
    () => window.__footnoteFixture.updateVersion
  );
  await page.evaluate(() => {
    window.__footnoteFixture.recreate({
      width: 600,
      fontSize: 16,
      zoom: 1.15
    });
  });
  await expect.poll(() => page.evaluate(
    () => window.__footnoteFixture.updateVersion
  )).toBeGreaterThan(zoomVersion);
  await waitForStableProjection(page);
  const zoomSnapshot = await getSnapshot(page);
  const zoomCanonical = zoomSnapshot.projections.find(
    ({ canonical }) => canonical
  );
  expect(zoomSnapshot.source.canonical).toBe("true");
  expect(Math.abs(
    zoomSnapshot.source.rect.left - zoomCanonical.rect.left
  )).toBeLessThanOrEqual(1);
  expect(Math.abs(
    zoomSnapshot.source.rect.top - zoomCanonical.rect.top
  )).toBeLessThanOrEqual(1);
  expect(zoomSnapshot.consoleErrors).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test("U3 edits the canonical first fragment in place and continuation returns to it", async ({
  page
}) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await waitForStableProjection(page);
  const previousVersion = await page.evaluate(
    () => window.__footnoteFixture.updateVersion
  );
  const bodyContent = page.locator(
    '[data-dockit-note-body="true"][data-dockit-note-kind="footnote"] .dockit-note-body-content'
  );
  await bodyContent.click({ position: { x: 80, y: 10 } });
  await page.keyboard.type(" U3-IN-PLACE");

  await expect.poll(() => page.evaluate(() => ({
    containsMarker: window.__footnoteFixture.editor.getText()
      .includes("U3-IN-PLACE"),
    updateVersion: window.__footnoteFixture.updateVersion
  }))).toEqual({
    containsMarker: true,
    updateVersion: expect.any(Number)
  });
  await expect.poll(() => page.evaluate(
    () => window.__footnoteFixture.updateVersion
  )).toBeGreaterThan(previousVersion);
  await waitForStableProjection(page);

  const editState = await page.evaluate(() => {
    const editor = window.__footnoteFixture.editor;
    const body = document.querySelector(
      '[data-dockit-note-body="true"][data-dockit-note-kind="footnote"]'
    );
    let selectionNoteId = null;
    for (let depth = editor.state.selection.$from.depth; depth > 0; depth -= 1) {
      const node = editor.state.selection.$from.node(depth);
      if (node.type.name === "noteBody") {
        selectionNoteId = node.attrs.noteId;
        break;
      }
    }
    return {
      bodyHeight: body?.getBoundingClientRect().height || null,
      canonical: body?.getAttribute(
        "data-dockit-footnote-projection-canonical"
      ),
      canonicalSlotHeight: document.querySelector(
        '.dockit-footnote-screen-projection[data-footnote-canonical="true"]'
      )?.getBoundingClientRect().height || null,
      directNodeView: body?.parentElement === editor.view.dom,
      html: editor.getHTML(),
      selectionNoteId
    };
  });
  expect(editState).toMatchObject({
    canonical: "true",
    directNodeView: true,
    selectionNoteId: "note-v1-browser-screen"
  });
  expect(editState.html).toContain("U3-IN-PLACE");
  expect(editState.html).not.toContain(
    "data-dockit-footnote-projection-canonical"
  );
  expect(editState.bodyHeight)
    .toBeLessThanOrEqual(editState.canonicalSlotHeight + 1);

  await page.evaluate(() => window.__footnoteFixture.editor.view.dom.blur());
  const continuationBox = await page.locator(
    '.dockit-footnote-screen-projection[data-footnote-canonical="false"]'
  ).first().boundingBox();
  expect(continuationBox).not.toBeNull();
  await page.mouse.click(
    continuationBox.x + 4,
    continuationBox.y + 4
  );
  await expect.poll(() => page.evaluate(() => {
    const editor = window.__footnoteFixture.editor;
    for (let depth = editor.state.selection.$from.depth; depth > 0; depth -= 1) {
      const node = editor.state.selection.$from.node(depth);
      if (node.type.name === "noteBody") return node.attrs.noteId;
    }
    return null;
  })).toBe("note-v1-browser-screen");
  expect(browserErrors).toEqual([]);
});

test("print media restores the canonical body before screen media reconverges", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await waitForStableProjection(page);

  await page.emulateMedia({ media: "print" });
  await expect.poll(() => page.evaluate(
    () => document.querySelector("#editor")?.getAttribute(
      "data-dockit-footnote-print-state"
    ) || null
  )).toBe("ready");
  const readPrintState = () => page.evaluate(() => {
    const source = document.querySelector('[data-dockit-note-body="true"]');
    return {
      projected: source.parentElement?.parentElement?.getAttribute(
        "data-dockit-footnote-projection-active"
      ),
      canonical: source.getAttribute(
        "data-dockit-footnote-projection-canonical"
      ),
      inlinePosition: source.style.position,
      position: getComputedStyle(source).position,
      hasFootnoteLayout: Boolean(
        window.__footnoteFixture.payload?.pageMap?.footnoteLayout
      ),
      projectedBodies: document.querySelectorAll(".dockit-footnote-print-projection").length
    };
  });
  await expect.poll(readPrintState).toEqual({
    projected: null,
    canonical: null,
    inlinePosition: "",
    position: "static",
    hasFootnoteLayout: true,
    projectedBodies: expect.any(Number)
  });
  const printState = await readPrintState();
  expect(printState.projectedBodies).toBeGreaterThan(0);

  await page.emulateMedia({ media: "screen" });
  await waitForStableProjection(page);
  expect((await getSnapshot(page)).source).toMatchObject({
    projected: "true",
    canonical: "true"
  });
});

test("N4b2 emits a real PDF with the stable table/chart/page-break footnote projection", async ({
  page
}, testInfo) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await waitForStableProjection(page);
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => page.evaluate(
    () => document.querySelector("#editor")?.getAttribute(
      "data-dockit-footnote-print-state"
    ) || null
  )).toBe("ready");
  await page.evaluate(() => document.fonts?.ready);

  const printAudit = await page.evaluate(() => {
    const stateHost = document.querySelector("#editor");
    const source = document.querySelector(
      '[data-dockit-note-body="true"][data-dockit-note-kind="footnote"]'
    );
    const projections = [...document.querySelectorAll(
      ".dockit-footnote-print-projection"
    )];
    const model = window.__footnoteFixture.model;
    return {
      state: stateHost?.getAttribute("data-dockit-footnote-print-state"),
      sourceDisplay: source ? getComputedStyle(source).display : null,
      projectionPages: projections.map((element) =>
        Number(element.getAttribute("data-dockit-footnote-print-page"))
      ),
      projectionDisplays: projections.map((element) => getComputedStyle(element).display),
      projectionHeights: projections.map((element) => element.getBoundingClientRect().height),
      projectionWidths: projections.map((element) => element.getBoundingClientRect().width),
      projectionLefts: projections.map((element) => element.getBoundingClientRect().left),
      projectionContentWidths: projections.map((element) =>
        element.querySelector(".dockit-footnote-print-projection__content")
          ?.getBoundingClientRect().width || 0
      ),
      contentFrameLeft: document.querySelector(".ProseMirror > p")
        ?.getBoundingClientRect().left || 0,
      reservedHeights: model.pages
        .filter((entry) => entry.footnoteReservedHeight > 0)
        .map((entry) => entry.footnoteReservedHeight),
      contentFrameWidths: model.pages
        .filter((entry) => entry.footnoteReservedHeight > 0)
        .map((entry) => entry.contentFrameWidth),
      continuationOnlyPages: document.querySelectorAll(
        ".dockit-footnote-print-only-page"
      ).length,
      expectedContinuationOnlyPages:
        model.totalPages - (
          Number.isSafeInteger(
            window.__footnoteFixture.payload.plan.mainFlowTotalPages
          )
            ? window.__footnoteFixture.payload.plan.mainFlowTotalPages
            : model.totalPages
        ),
      continuationLabels: projections.map((element) =>
        element.querySelector(".dockit-footnote-print-projection__separator")
          ?.textContent.trim() || ""
      ),
      safeLink: document.querySelector(
        '.dockit-footnote-print-projection a[href="https://example.com/footnote"]'
      )?.getAttribute("href") || null,
      unsafePrintStateCount: document.querySelectorAll(
        ".dockit-footnote-print-projection button, .dockit-footnote-print-projection [contenteditable], .dockit-footnote-print-projection [onclick], .dockit-footnote-print-projection [target], .dockit-footnote-print-projection [tabindex]"
      ).length,
      blockerCount: document.querySelectorAll(
        ".dockit-footnote-print-blocking-error"
      ).length,
      hasTable: Boolean(document.querySelector("table")),
      hasChart: Boolean(document.querySelector('[data-chart-block="fixture"]')),
      hasForcedBreak: Boolean(document.querySelector('[data-page-break-before="true"]')),
      bodyVisible: getComputedStyle(document.querySelector(".ProseMirror > p")).display
    };
  });

  expect(printAudit.state).toBe("ready");
  expect(printAudit.sourceDisplay).toBe("none");
  expect(printAudit.projectionPages).toHaveLength(printAudit.reservedHeights.length);
  expect(printAudit.projectionDisplays.every((display) => display === "block")).toBe(true);
  expect(printAudit.projectionHeights).toEqual(
    printAudit.reservedHeights.map((height) => expect.closeTo(height, 0))
  );
  expect(printAudit.projectionWidths).toEqual(
    printAudit.contentFrameWidths.map((width) => expect.closeTo(width, 0))
  );
  expect(printAudit.projectionContentWidths).toEqual(
    printAudit.contentFrameWidths.map((width) => expect.closeTo(width, 0))
  );
  expect(printAudit.projectionLefts).toEqual(
    printAudit.projectionLefts.map(() =>
      expect.closeTo(printAudit.contentFrameLeft, 0)
    )
  );
  expect(printAudit.continuationOnlyPages).toBe(
    printAudit.expectedContinuationOnlyPages
  );
  expect(printAudit.continuationOnlyPages).toBeGreaterThan(0);
  expect(printAudit.continuationLabels.some((label) => label.includes("각주 계속"))).toBe(true);
  expect(printAudit.continuationLabels.some((label) => label.includes("다음 페이지에 계속"))).toBe(true);
  expect(printAudit.safeLink).toBe("https://example.com/footnote");
  expect(printAudit.unsafePrintStateCount).toBe(0);
  expect(printAudit.blockerCount).toBe(0);
  expect(printAudit.hasTable).toBe(true);
  expect(printAudit.hasChart).toBe(true);
  expect(printAudit.hasForcedBreak).toBe(true);
  expect(printAudit.bodyVisible).not.toBe("none");

  const pdfPath = testInfo.outputPath("footnote-print.pdf");
  await page.pdf({
    path: pdfPath,
    printBackground: true,
    preferCSSPageSize: true,
    tagged: true,
    outline: true
  });
  const pdf = fs.readFileSync(pdfPath);
  expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(pdf.byteLength).toBeGreaterThan(10_000);
  await testInfo.attach("n4b2-footnote-print-pdf", {
    path: pdfPath,
    contentType: "application/pdf"
  });
  expect(browserErrors).toEqual([]);
});

test("N4b2 invalidates stale projection and blocks malformed-footnote print", async ({
  page
}) => {
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await waitForStableProjection(page);
  await page.evaluate(() => {
    window.__footnoteFixture.editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "출력되면 안 되는 본문" }]
        },
        {
          type: "noteBody",
          attrs: { noteId: "note-v1-orphan-print", kind: "footnote" },
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: "고아 각주" }]
          }]
        }
      ]
    });
  });
  await expect.poll(() => page.evaluate(() => {
    const source = document.querySelector(
      '[data-dockit-note-body="true"][data-dockit-note-kind="footnote"]'
    );
    return {
      blockerExists: Boolean(document.querySelector(
        ".dockit-footnote-print-blocking-error"
      )),
      canonical: source?.getAttribute(
        "data-dockit-footnote-projection-canonical"
      ) || null,
      consoleErrors: window.__consoleErrors,
      projected: source?.parentElement?.parentElement?.getAttribute(
        "data-dockit-footnote-projection-active"
      ) || null,
      projectionCount: document.querySelectorAll(
        ".dockit-footnote-print-projection"
      ).length,
      sourceDisplay: source ? getComputedStyle(source).display : null,
      sourcePosition: source ? getComputedStyle(source).position : null,
      state: document.querySelector("#editor")?.getAttribute(
        "data-dockit-footnote-print-state"
      ),
      updateVersion: window.__footnoteFixture.updateVersion
    };
  })).toEqual({
    blockerExists: true,
    canonical: null,
    consoleErrors: [],
    projected: null,
    projectionCount: 0,
    sourceDisplay: "block",
    sourcePosition: "static",
    state: "blocked",
    updateVersion: expect.any(Number)
  });

  await page.emulateMedia({ media: "print" });

  const blocked = await page.evaluate(() => {
    const blocker = document.querySelector(
      ".dockit-footnote-print-blocking-error"
    );
    const body = document.querySelector(".ProseMirror > p");
    return {
      state: document.querySelector("#editor")?.getAttribute(
        "data-dockit-footnote-print-state"
      ),
      projectionCount: document.querySelectorAll(
        ".dockit-footnote-print-projection"
      ).length,
      blockerExists: Boolean(blocker),
      blockerText: blocker?.textContent || "",
      blockerDisplay: blocker ? getComputedStyle(blocker).display : null,
      bodyExists: Boolean(body),
      bodyDisplay: body ? getComputedStyle(body).display : null
    };
  });
  expect(blocked).toEqual({
    state: "blocked",
    projectionCount: 0,
    blockerExists: true,
    blockerText: "각주 페이지 레이아웃을 준비하지 못했습니다. 인쇄를 중단하고 다시 시도하세요.",
    blockerDisplay: "block",
    bodyExists: true,
    bodyDisplay: "none"
  });
});
