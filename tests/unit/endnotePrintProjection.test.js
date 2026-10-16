/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  EndnotePrintProjectionError,
  projectEndnotesForPrint
} from "../../app/LIB/utils/endnotePrintProjection";

const parse = (html) => new DOMParser().parseFromString(html, "text/html");
const endnoteReference = (id) =>
  `<span data-dockit-note-reference="true" data-dockit-note-id="${id}" data-dockit-note-kind="endnote"></span>`;
const endnoteBody = (id, content) =>
  `<section data-dockit-note-body="true" data-dockit-note-id="${id}" data-dockit-note-kind="endnote">${content}</section>`;
const footnote = (id) =>
  `<span data-dockit-note-reference="true" data-dockit-note-id="${id}" data-dockit-note-kind="footnote"></span><section data-dockit-note-body="true" data-dockit-note-id="${id}" data-dockit-note-kind="footnote"><p>각주 본문</p></section>`;

describe("N3a deterministic endnote print projection", () => {
  it("projects endnotes by reference order while preserving footnotes, rich HTML, links, and long text once", () => {
    const first = "note-v1-first";
    const second = "note-v1-second";
    const longText = "긴 미주 본문 ".repeat(1000);
    const html = `<p>시작 ${endnoteReference(first)} 중간 ${endnoteReference(second)}</p>${footnote("note-v1-footnote")}${endnoteBody(second, `<p><strong>두번째</strong> <a href="https://example.com">링크</a></p>`)}${endnoteBody(first, `<p>${longText}</p>`)}`;

    const output = parse(projectEndnotesForPrint(html));
    const section = output.querySelector('[data-dockit-print-endnotes="true"]');
    const entries = [...section.querySelectorAll(".dockit-print-endnote-entry")];

    expect(section.querySelector("h2").textContent).toBe("미주");
    expect(section.getAttribute("role")).toBe("doc-endnotes");
    expect(section.getAttribute("aria-labelledby")).toBe("dockit-print-endnotes-heading");
    expect(entries.map((entry) => entry.id)).toEqual([
      "dockit-print-endnote-body-note-v1-first",
      "dockit-print-endnote-body-note-v1-second"
    ]);
    expect(entries[0].textContent).toContain(longText);
    expect(entries[1].querySelector("strong").textContent).toBe("두번째");
    expect(entries[1].querySelector('a[href="https://example.com"]')).not.toBeNull();
    expect(output.querySelectorAll('[data-dockit-note-kind="footnote"]').length).toBe(2);
    expect(output.querySelectorAll('[data-dockit-note-body="true"][data-dockit-note-kind="endnote"]').length).toBe(0);
    expect(output.body.textContent.match(/긴 미주 본문/g)).toHaveLength(1000);
    expect(output.querySelector(`#dockit-print-endnote-ref-${first} a`).getAttribute("href")).toBe(`#dockit-print-endnote-body-${first}`);
    expect(output.querySelector(`#dockit-print-endnote-ref-${first}`).getAttribute("role")).toBe("doc-noteref");
    expect(entries[0].getAttribute("role")).toBe("doc-endnote");
    expect(entries[0].querySelector(".dockit-print-endnote-backlink").getAttribute("href")).toBe(`#dockit-print-endnote-ref-${first}`);
    expect(output.querySelector(`#dockit-print-endnote-ref-${second}`).getAttribute("data-dockit-print-endnote-number")).toBe("2");
  });

  it("returns no-endnote input unchanged", () => {
    const html = `<p>보존</p>${footnote("note-v1-footnote")}`;
    expect(projectEndnotesForPrint(html)).toBe(html);
  });

  it.each([
    ["duplicate reference", `<p>${endnoteReference("note-v1-a")}${endnoteReference("note-v1-a")}</p>${endnoteBody("note-v1-a", "<p>x</p>")}`, "DUPLICATE_ENDNOTE_REFERENCE"],
    ["duplicate body", `<p>${endnoteReference("note-v1-a")}</p>${endnoteBody("note-v1-a", "<p>x</p>")}${endnoteBody("note-v1-a", "<p>y</p>")}`, "DUPLICATE_ENDNOTE_BODY"],
    ["dangling", `<p>${endnoteReference("note-v1-a")}</p>`, "DANGLING_ENDNOTE_REFERENCE"],
    ["orphan", endnoteBody("note-v1-a", "<p>x</p>"), "ORPHAN_ENDNOTE_BODY"],
    ["unsafe", `<p>${endnoteReference("note-v1-unsafe!")}</p>${endnoteBody("note-v1-unsafe!", "<p>x</p>")}`, "INVALID_ENDNOTE_ID"],
    ["kind mismatch", `<p>${endnoteReference("note-v1-a")}</p><section data-dockit-note-body="true" data-dockit-note-id="note-v1-a" data-dockit-note-kind="footnote"><p>x</p></section>`, "ENDNOTE_KIND_MISMATCH"]
  ])("fails closed for %s endnote input", (_label, html, code) => {
    expect(() => projectEndnotesForPrint(html)).toThrow(EndnotePrintProjectionError);
    try {
      projectEndnotesForPrint(html);
    } catch (error) {
      expect(error.code).toBe(code);
    }
  });
});
