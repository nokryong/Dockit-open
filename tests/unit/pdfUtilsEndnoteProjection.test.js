/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { generateStyleSet } from "../../app/LIB/utils/pdfUtils";

describe("generateStyleSet endnote print integration", () => {
  it("embeds the deterministic projection and its print-only page-break CSS", async () => {
    const printableHtml = await generateStyleSet(
      {},
      {},
      `<p>본문 <span data-dockit-note-reference="true" data-dockit-note-id="note-v1-export" data-dockit-note-kind="endnote"></span></p><section data-dockit-note-body="true" data-dockit-note-id="note-v1-export" data-dockit-note-kind="endnote"><p>출력 미주</p></section>`
    );
    const document = new DOMParser().parseFromString(printableHtml, "text/html");

    expect(document.querySelector('[data-dockit-print-endnotes="true"]')).not.toBeNull();
    expect(document.querySelector(".dockit-print-endnote-entry").textContent).toContain("출력 미주");
    expect(printableHtml).toContain("break-before: page");
    expect(printableHtml).toContain("page: dockit-endnotes");
    expect(printableHtml).toContain("@page dockit-endnotes");
    expect(printableHtml).toContain("margin: 25mm 25mm 25mm 25mm;");
    expect(printableHtml).toContain("width: auto;");
    expect(printableHtml).toContain("min-height: 0;");
    expect(printableHtml).toContain("padding: 0;");
    expect(printableHtml).toContain("--dockit-print-endnote-rule-color");
  });

  it("fragments long tables between rows and repeats table headers", async () => {
    const printableHtml = await generateStyleSet(
      {},
      {},
      "<table><thead><tr><th>항목</th></tr></thead><tbody><tr><td>값</td></tr></tbody></table>"
    );

    expect(printableHtml).toContain(
      ".dockit-html-export-page table {\n    page-break-inside: auto;\n    break-inside: auto;"
    );
    expect(printableHtml).toContain(
      ".dockit-html-export-page thead {\n    display: table-header-group;"
    );
    expect(printableHtml).toContain(
      ".dockit-html-export-page tr {\n    page-break-inside: avoid;\n    break-inside: avoid-page;"
    );
  });
});
