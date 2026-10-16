import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import {
  G1D_OUTPUT_FIXTURE_MATRIX
} from "../fixtures/g1d-output-fixture-matrix";

const preserveAndInstallGlobals = (dom) => {
  const globals = {
    window: dom.window,
    document: dom.window.document,
    DOMParser: dom.window.DOMParser,
    Element: dom.window.Element
  };
  const previous = new Map(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key)
    ])
  );
  Object.entries(globals).forEach(([key, value]) => {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    });
  });
  return () => {
    previous.forEach((descriptor, key) => {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    });
  };
};

let vite;
let viteBaseUrl;
let auditModuleUrl;

test.beforeAll(async () => {
  vite = await createServer({
    configFile: false,
    root: process.cwd(),
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { host: "127.0.0.1", port: 0 }
  });
  await vite.listen();
  viteBaseUrl = vite.resolvedUrls?.local?.[0];
  if (!viteBaseUrl) throw new Error("Vite fixture URL was not created");
  auditModuleUrl = new URL(
    "app/LIB/utils/pdfOutputPreflightAudit.js",
    viteBaseUrl
  ).href;
});

test.afterAll(async () => {
  await vite?.close();
});

const generatePrintableFixture = async (fixture) => {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://dockit.test/"
  });
  const restoreGlobals = preserveAndInstallGlobals(dom);
  try {
    const { generateStyleSet } = await vite.ssrLoadModule(
      "/app/LIB/utils/pdfUtils.js"
    );
    return await generateStyleSet(
      {},
      {
        pageWidth: 210,
        pageHeight: 297,
        paddingTop: 20,
        paddingBottom: 20,
        paddingLeft: 20,
        paddingRight: 20,
        lineHeight: 1.5
      },
      fixture.html,
      { title: `G1d ${fixture.kind} ${fixture.origin}` }
    );
  } finally {
    restoreGlobals();
    dom.window.close();
  }
};

const countMarker = (source, marker) => source.split(marker).length - 1;

for (const fixture of G1D_OUTPUT_FIXTURE_MATRIX) {
  test(`G1d renders ${fixture.id} through the common output quality gate`, async ({
    page
  }, testInfo) => {
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });

    const html = await generatePrintableFixture(fixture);
    const fixtureUrl = new URL(
      `__g1d__/${encodeURIComponent(fixture.id)}`,
      viteBaseUrl
    ).href;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ media: "print" });
    await page.route(fixtureUrl, (route) => route.fulfill({
      status: 200,
      contentType: "text/html",
      body: html
    }));
    await page.goto(fixtureUrl, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => [...document.images].every(
      (image) => image.complete && image.naturalWidth > 0
    ))).toBe(true);

    const audit = await page.evaluate(async ({
      moduleUrl,
      marker,
      requiredSelectors
    }) => {
      const { auditPdfOutputPreflight } = await import(moduleUrl);
      const root = document.querySelector(".tiptap-main-canvas");
      if (!root) throw new Error("Printable editor canvas was not created");
      const report = auditPdfOutputPreflight({
        rootElement: root,
        fontSet: document.fonts
      });
      const rootRect = root?.getBoundingClientRect();
      const visualCandidates = [...root.querySelectorAll(
        "table, figure, svg, img, [data-chart-block], [data-diagram-block]"
      )];
      const contained = visualCandidates.every((element) => {
        const rect = element.getBoundingClientRect();
        return Boolean(
          rootRect && rect.left >= rootRect.left - 1 &&
          rect.right <= rootRect.right + 1
        );
      });
      const labels = [...root.querySelectorAll(
        "[data-output-label], figcaption, svg text"
      )];
      const labelLegible = labels.every((element) => {
        const style = getComputedStyle(element);
        return style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number.parseFloat(style.fontSize) >= 10;
      });
      const pageRules = [...document.styleSheets].flatMap((styleSheet) => {
        try {
          return [...styleSheet.cssRules].filter(
            (rule) => rule.constructor.name === "CSSPageRule"
          );
        } catch {
          return [];
        }
      });
      const defaultPageRule = pageRules.find((rule) => !rule.selectorText);
      const canvasStyle = getComputedStyle(root);
      const headingStyle = getComputedStyle(root.querySelector("h1, h2, h3"));
      const paragraphStyle = getComputedStyle(root.querySelector("p"));
      const nonTableFragment = root.querySelector(
        "figure, blockquote, ol, img"
      );
      const table = root.querySelector("table");
      const tableRow = table?.querySelector("tr");

      return {
        status: report.status,
        issueCodes: report.issues.map(({ code }) => code),
        markerCount: document.documentElement.innerHTML
          .split(marker).length - 1,
        selectorCounts: requiredSelectors.map((selector) =>
          root.querySelectorAll(selector).length
        ),
        imageCount: root.querySelectorAll("img").length,
        fontReady: document.fonts.status === "loaded",
        contained,
        labelCount: labels.length,
        labelLegible,
        pagination: {
          headingBreakAfter: headingStyle.breakAfter,
          paragraphWidows: paragraphStyle.widows,
          paragraphOrphans: paragraphStyle.orphans,
          nonTableFragmentBreakInside: nonTableFragment
            ? getComputedStyle(nonTableFragment).breakInside
            : null,
          tableBreakInside: table ? getComputedStyle(table).breakInside : null,
          tableRowBreakInside: tableRow
            ? getComputedStyle(tableRow).breakInside
            : null
        },
        pageMargins: defaultPageRule ? {
          top: defaultPageRule.style.marginTop,
          right: defaultPageRule.style.marginRight,
          bottom: defaultPageRule.style.marginBottom,
          left: defaultPageRule.style.marginLeft
        } : null,
        canvasPrintBox: {
          minHeight: canvasStyle.minHeight,
          paddingTop: canvasStyle.paddingTop,
          paddingRight: canvasStyle.paddingRight,
          paddingBottom: canvasStyle.paddingBottom,
          paddingLeft: canvasStyle.paddingLeft
        }
      };
    }, {
      moduleUrl: auditModuleUrl,
      marker: fixture.marker,
      requiredSelectors: fixture.requiredSelectors
    });

    expect(countMarker(html, fixture.marker)).toBe(1);
    expect(audit).toMatchObject({
      status: "ready",
      issueCodes: [],
      markerCount: 1,
      imageCount: fixture.expectedImageCount,
      fontReady: true,
      contained: true,
      labelLegible: true,
      pageMargins: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm"
      },
      canvasPrintBox: {
        minHeight: "0px",
        paddingTop: "0px",
        paddingRight: "0px",
        paddingBottom: "0px",
        paddingLeft: "0px"
      }
    });
    expect(audit.selectorCounts.every((count) => count > 0)).toBe(true);
    expect(audit.labelCount).toBeGreaterThanOrEqual(
      fixture.expectedLabelCountMin
    );
    expect(["avoid", "avoid-page"]).toContain(
      audit.pagination.headingBreakAfter
    );
    expect(Number(audit.pagination.paragraphWidows)).toBeGreaterThanOrEqual(2);
    expect(Number(audit.pagination.paragraphOrphans)).toBeGreaterThanOrEqual(2);
    if (audit.pagination.nonTableFragmentBreakInside !== null) {
      expect(["avoid", "avoid-page"]).toContain(
        audit.pagination.nonTableFragmentBreakInside
      );
    }
    if (audit.pagination.tableBreakInside !== null) {
      expect(audit.pagination.tableBreakInside).toBe("auto");
      expect(["avoid", "avoid-page"]).toContain(
        audit.pagination.tableRowBreakInside
      );
    }

    const pdfPath = testInfo.outputPath(`g1d-${fixture.id}.pdf`);
    await page.pdf({
      path: pdfPath,
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
      outline: true
    });
    const pdf = fs.readFileSync(pdfPath);
    const pageObjects = pdf.toString("latin1").match(
      /\/Type\s*\/Page(?!s)\b/g
    ) || [];
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(5_000);
    expect(pageObjects.length).toBeGreaterThanOrEqual(fixture.expectedPages.min);
    expect(pageObjects.length).toBeLessThanOrEqual(fixture.expectedPages.max);
    expect(browserErrors).toEqual([]);
    await testInfo.attach(`g1d-${fixture.id}-pdf`, {
      path: pdfPath,
      contentType: "application/pdf"
    });
  });
}

test("G1d matrix applies one gate to both AI-on and AI-off/manual origins", () => {
  expect(new Set(G1D_OUTPUT_FIXTURE_MATRIX.map(({ kind }) => kind))).toEqual(
    new Set([
      "report",
      "research-note",
      "table-heavy",
      "chart-heavy",
      "diagram-heavy",
      "imported-document"
    ])
  );
  expect(new Set(G1D_OUTPUT_FIXTURE_MATRIX.map(({ origin }) => origin))).toEqual(
    new Set(["ai-on", "ai-off-manual"])
  );
});
