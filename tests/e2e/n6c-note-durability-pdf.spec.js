import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { N6C_NOTE_DURABILITY_FIXTURE as fixture } from "../fixtures/n6c-note-durability-fixture";

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

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const noteReference = (noteId, kind) =>
  `<span data-dockit-note-reference="true" data-dockit-note-id="${escapeHtml(noteId)}" data-dockit-note-kind="${kind}"></span>`;
const noteBody = ({ noteId, kind, text }) =>
  `<section data-dockit-note-body="true" data-dockit-note-id="${escapeHtml(noteId)}" data-dockit-note-kind="${kind}"><p>${escapeHtml(text)}</p></section>`;

const createFinalFixtureContent = () => {
  const byId = new Map(fixture.finalNoteBodies.map((entry) => [entry.noteId, entry]));
  const ref = (noteId) => {
    const entry = byId.get(noteId);
    return noteReference(entry.noteId, entry.kind);
  };
  return [
    `<style>
      .n6c-report { color: #172033; font-family: Arial, sans-serif; }
      .n6c-report h1 { color: #183b6b; font-size: 28px; margin: 0 0 20px; }
      .n6c-report table { width: 100%; border-collapse: collapse; }
      .n6c-report th, .n6c-report td { border: 1px solid #8ea0b8; padding: 8px; }
      .n6c-report figure { margin: 18px 0; padding: 16px; border-left: 5px solid #2f6fed; background: #eef4ff; }
      .n6c-report [data-dockit-note-body="true"] { margin-top: 12px; }
    </style>`,
    '<article class="n6c-report">',
    `<h1>${fixture.humanMarkers[0]}: approved human edit</h1>`,
    `<p>${fixture.protectedMarkers.ordinary}</p>`,
    `<p>${fixture.humanMarkers[1]}: approved human edit</p>`,
    `<table><thead><tr><th>${fixture.protectedMarkers.table}</th><th>${fixture.humanMarkers[2]}: approved human edit</th></tr></thead></table>`,
    `<figure data-n6c-chart="${fixture.protectedMarkers.chart}"><figcaption>${fixture.humanMarkers[3]}: approved human edit</figcaption></figure>`,
    `<p data-n6c-style="${fixture.protectedMarkers.style}"><strong>${fixture.humanMarkers[4]}: approved human edit</strong></p>`,
    `<p>N6C auxiliary footnote ${ref(fixture.noteIds.auxiliaryFootnote)}</p>`,
    `<p>N6C AI endnote ${ref(fixture.noteIds.aiInsertedEndnote)}</p>`,
    `<p>${fixture.humanMarkers[6]}: approved human edit</p>`,
    `<p>N6C manual footnote ${ref(fixture.noteIds.manualFootnote)}</p>`,
    `<p>N6C final AI footnote ${ref(fixture.noteIds.aiFinalFootnote)}</p>`,
    `<p>${fixture.humanMarkers[7]}: approved human edit ${ref(fixture.noteIds.footnote)}</p>`,
    ...fixture.finalNoteBodies.map(noteBody),
    "</article>"
  ].join("\n");
};

const generatePrintableFixture = async (content) => {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://dockit.test/"
  });
  const restoreGlobals = preserveAndInstallGlobals(dom);
  const vite = await createServer({
    cacheDir: ".cache/vite-tests/n6c-note-durability-pdf",
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true }
  });
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
      content,
      { title: "N6c note durability fixture" }
    );
  } finally {
    await vite.close();
    restoreGlobals();
    dom.window.close();
  }
};

test("N6c emits the recovered 20-edit fixture as a stable Chromium PDF", async ({
  page
}, testInfo) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  const html = await generatePrintableFixture(createFinalFixtureContent());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ media: "print" });
  await page.setContent(html, { waitUntil: "load" });

  const audit = await page.evaluate(({ humanMarkers, aiMarkers, noteIds }) => {
    const markerCounts = Object.fromEntries(
      [...humanMarkers, ...aiMarkers].map((marker) => [
        marker,
        document.body.innerText.match(
          new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`, "g")
        )?.length || 0
      ])
    );
    const endnoteReferences = [...document.querySelectorAll(
      ".dockit-print-endnote-reference-link"
    )].map((reference) => ({
      href: reference.getAttribute("href"),
      number: reference.textContent,
      parentId: reference.parentElement?.id
    }));
    const endnoteEntries = [...document.querySelectorAll(
      ".dockit-print-endnote-entry"
    )].map((entry) => ({
      id: entry.id,
      number: entry.getAttribute("data-dockit-print-endnote-number"),
      backlink: entry.querySelector(".dockit-print-endnote-backlink")?.getAttribute("href")
    }));
    const pageRoot = document.querySelector(".dockit-html-export-page");
    const report = document.querySelector(".n6c-report");
    const horizontalOverflow = Math.max(
      0,
      (pageRoot?.scrollWidth || 0) - (pageRoot?.clientWidth || 0),
      (report?.scrollWidth || 0) - (report?.clientWidth || 0)
    );
    return {
      markerCounts,
      endnoteReferences,
      endnoteEntries,
      footnoteBodies: document.querySelectorAll(
        '[data-dockit-note-body="true"][data-dockit-note-kind="footnote"]'
      ).length,
      endnoteSectionCount: document.querySelectorAll(
        '[data-dockit-print-endnotes="true"]'
      ).length,
      hasHeading: Boolean(document.querySelector("h1")),
      hasTable: Boolean(document.querySelector("table")),
      hasChart: Boolean(document.querySelector("figure[data-n6c-chart]")),
      hasBoldStyle: Boolean(document.querySelector("p[data-n6c-style] strong")),
      horizontalOverflow,
      deletedIdsPresent: [noteIds.initialEndnote, noteIds.aiDeletedFootnote]
        .some((noteId) => document.documentElement.innerHTML.includes(noteId))
    };
  }, {
    humanMarkers: fixture.humanMarkers,
    aiMarkers: fixture.aiMarkers,
    noteIds: fixture.noteIds
  });

  expect(audit.markerCounts).toEqual(Object.fromEntries(
    [...fixture.humanMarkers, ...fixture.aiMarkers].map((marker) => [marker, 1])
  ));
  expect(audit.endnoteReferences).toEqual([
    {
      href: `#dockit-print-endnote-body-${fixture.noteIds.aiInsertedEndnote}`,
      number: "1",
      parentId: `dockit-print-endnote-ref-${fixture.noteIds.aiInsertedEndnote}`
    },
    {
      href: `#dockit-print-endnote-body-${fixture.noteIds.footnote}`,
      number: "2",
      parentId: `dockit-print-endnote-ref-${fixture.noteIds.footnote}`
    }
  ]);
  expect(audit.endnoteEntries).toEqual([
    {
      id: `dockit-print-endnote-body-${fixture.noteIds.aiInsertedEndnote}`,
      number: "1",
      backlink: `#dockit-print-endnote-ref-${fixture.noteIds.aiInsertedEndnote}`
    },
    {
      id: `dockit-print-endnote-body-${fixture.noteIds.footnote}`,
      number: "2",
      backlink: `#dockit-print-endnote-ref-${fixture.noteIds.footnote}`
    }
  ]);
  expect(audit).toMatchObject({
    footnoteBodies: 3,
    endnoteSectionCount: 1,
    hasHeading: true,
    hasTable: true,
    hasChart: true,
    hasBoldStyle: true,
    deletedIdsPresent: false
  });
  expect(audit.horizontalOverflow).toBeLessThanOrEqual(1);

  const pdfPath = testInfo.outputPath("n6c-note-durability.pdf");
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
  expect(browserErrors).toEqual([]);
  await testInfo.attach("n6c-note-durability-pdf", {
    path: pdfPath,
    contentType: "application/pdf"
  });
});
