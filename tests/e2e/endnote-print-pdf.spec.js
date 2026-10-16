import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const noteIds = ["note-v1-first", "note-v1-second", "note-v1-third"];
const longEndnoteMarker = "N3B-LONG-ENDNOTE-UNIQUE-MARKER";

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

const generatePrintableFixture = async (content) => {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://dockit.test/"
  });
  const restoreGlobals = preserveAndInstallGlobals(dom);
  const vite = await createServer({
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
        paddingTop: 25,
        paddingBottom: 25,
        paddingLeft: 25,
        paddingRight: 25,
        lineHeight: 1.5
      },
      content,
      { title: "N3b endnote print PDF fixture" }
    );
  } finally {
    await vite.close();
    restoreGlobals();
    dom.window.close();
  }
};

const endnoteReference = (noteId) =>
  `<span data-dockit-note-reference="true" data-dockit-note-id="${noteId}" data-dockit-note-kind="endnote"></span>`;

const endnoteBody = (noteId, body) =>
  `<section data-dockit-note-body="true" data-dockit-note-id="${noteId}" data-dockit-note-kind="endnote">${body}</section>`;

const createFixtureContent = () => {
  const paragraphs = Array.from(
    { length: 96 },
    (_, index) =>
      `<p>인쇄용 A4 본문 ${index + 1}: 여러 페이지에 걸쳐 줄바꿈, 여백, 문단 흐름을 확인하는 현실적인 보고서 본문입니다.</p>`
  );

  paragraphs.splice(
    8,
    0,
    `<p>첫 번째 미주 참조 ${endnoteReference(noteIds[0])} 뒤에도 본문이 계속됩니다.</p>`
  );
  paragraphs.splice(
    47,
    0,
    `<p>두 번째 미주 참조 ${endnoteReference(noteIds[1])}와 표준 본문 흐름입니다.</p>`
  );
  paragraphs.splice(
    83,
    0,
    `<p>세 번째 미주 참조 ${endnoteReference(noteIds[2])}로 보고서를 마무리합니다.</p>`
  );

  const longEndnote = Array.from(
    { length: 90 },
    (_, index) => `긴 미주 문장 ${index + 1}은 A4 인쇄에서 자연스럽게 이어져야 합니다.`
  ).join(" ");

  return [
    "<h1>A4 다중 페이지 미주 인쇄 검증</h1>",
    ...paragraphs,
    // Bodies deliberately arrive in reverse reference order.
    endnoteBody(
      noteIds[2],
      "<p>세 번째 미주 본문: 역순으로 저장된 본문입니다.</p>"
    ),
    endnoteBody(
      noteIds[1],
      '<p>두 번째 미주 본문: <a href="https://example.com/research?source=n3b" target="_blank" rel="noreferrer">외부 연구 링크</a>를 포함합니다.</p>'
    ),
    endnoteBody(
      noteIds[0],
      `<p>첫 번째 미주 본문 ${longEndnote} ${longEndnoteMarker}</p>`
    )
  ].join("\n");
};

test("N3b renders deterministic endnotes in Chromium print and emits an inspectable PDF", async ({
  page
}, testInfo) => {
  const html = await generatePrintableFixture(createFixtureContent());
  expect(html).toContain("@page dockit-endnotes");
  expect(html).toContain("margin: 25mm 25mm 25mm 25mm;");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ media: "print" });
  await page.setContent(html, { waitUntil: "load" });

  const endnoteSection = page.locator('[data-dockit-print-endnotes="true"]');
  await expect(endnoteSection).toHaveCount(1);
  await expect(endnoteSection.locator(".dockit-print-endnotes-heading")).toHaveText(
    "미주"
  );

  const projection = await page.evaluate((ids) => {
    const section = document.querySelector('[data-dockit-print-endnotes="true"]');
    const references = ids.map((noteId) => {
      const reference = document.querySelector(
        `#dockit-print-endnote-ref-${noteId}`
      );
      const link = reference?.querySelector("a");
      return {
        id: reference?.id,
        number: reference?.getAttribute("data-dockit-print-endnote-number"),
        href: link?.getAttribute("href")
      };
    });
    const entries = [...section.querySelectorAll(".dockit-print-endnote-entry")].map(
      (entry) => ({
        id: entry.id,
        number: entry.getAttribute("data-dockit-print-endnote-number"),
        backlink: entry.querySelector(".dockit-print-endnote-backlink")?.getAttribute("href")
      })
    );
    const style = getComputedStyle(section);
    const sectionRect = section.getBoundingClientRect();
    const entryRects = [...section.querySelectorAll(".dockit-print-endnote-entry")].map(
      (entry) => {
        const rect = entry.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }
    );

    return {
      references,
      entries,
      pageName: style.page,
      breakBefore: style.breakBefore,
      pageBreakBefore: style.pageBreakBefore,
      horizontalOverflow: section.scrollWidth - section.clientWidth,
      sectionRect: { left: sectionRect.left, right: sectionRect.right },
      entryRects,
      externalLink: section.querySelector('a[href^="https://example.com/research"]')?.getAttribute("href"),
      markerCopies: document.body.innerText.split("N3B-LONG-ENDNOTE-UNIQUE-MARKER").length - 1
    };
  }, noteIds);

  expect(projection.references).toEqual(
    noteIds.map((noteId, index) => ({
      id: `dockit-print-endnote-ref-${noteId}`,
      number: String(index + 1),
      href: `#dockit-print-endnote-body-${noteId}`
    }))
  );
  expect(projection.entries).toEqual(
    noteIds.map((noteId, index) => ({
      id: `dockit-print-endnote-body-${noteId}`,
      number: String(index + 1),
      backlink: `#dockit-print-endnote-ref-${noteId}`
    }))
  );
  expect(projection.externalLink).toBe("https://example.com/research?source=n3b");
  expect(projection.markerCopies).toBe(1);
  expect(projection.pageName).toBe("dockit-endnotes");
  expect(projection.breakBefore).toBe("page");
  expect(projection.pageBreakBefore).toBe("always");
  expect(projection.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(projection.entryRects).toHaveLength(3);
  projection.entryRects.forEach((rect, index) => {
    expect(rect.left).toBeGreaterThanOrEqual(projection.sectionRect.left - 1);
    expect(rect.right).toBeLessThanOrEqual(projection.sectionRect.right + 1);
    if (index > 0) {
      expect(rect.top).toBeGreaterThanOrEqual(
        projection.entryRects[index - 1].bottom - 1
      );
    }
  });

  const pdfPath = testInfo.outputPath("endnote-print.pdf");
  await page.pdf({
    path: pdfPath,
    printBackground: true,
    preferCSSPageSize: true
  });
  const pdf = fs.readFileSync(pdfPath);
  expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(pdf.byteLength).toBeGreaterThan(10_000);

  await testInfo.attach("n3b-endnote-print-pdf", {
    path: pdfPath,
    contentType: "application/pdf"
  });
});
