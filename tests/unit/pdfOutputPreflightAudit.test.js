/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  PDF_OUTPUT_PREFLIGHT_ISSUE_CODES,
  auditPdfOutputPreflight,
  collectPdfOutputPreflightSignals,
  createPdfOutputPreflightReport
} from "../../app/LIB/utils/pdfOutputPreflightAudit";

const setMetric = (element, name, value) => {
  Object.defineProperty(element, name, {
    configurable: true,
    value
  });
};

const setImageState = (image, { complete, naturalWidth }) => {
  setMetric(image, "complete", complete);
  setMetric(image, "naturalWidth", naturalWidth);
};

describe("pdfOutputPreflightAudit", () => {
  it("returns a frozen ready report when every covered signal is safe", () => {
    const report = createPdfOutputPreflightReport({
      surfaceAvailable: true,
      footnotePrintState: "not-required"
    });

    expect(report).toEqual({
      status: "ready",
      canPrint: true,
      requiresConfirmation: false,
      issueCount: 0,
      issues: [],
      blockers: [],
      warnings: []
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.issues)).toBe(true);
  });

  it("fails closed for semantic, footnote, table, and failed-image loss", () => {
    const report = createPdfOutputPreflightReport({
      surfaceAvailable: true,
      notePersistenceBlocked: true,
      hasFootnoteBodies: true,
      footnotePrintState: "not-required",
      tableRowTooTallCount: 2,
      failedImageCount: 1,
      pendingImageCount: 3,
      pendingFontCount: 1,
      horizontalOverflowCount: 2
    });

    expect(report.status).toBe("blocked");
    expect(report.canPrint).toBe(false);
    expect(report.requiresConfirmation).toBe(false);
    expect(report.issueCount).toBe(11);
    expect(report.blockers.map(({ code }) => code)).toEqual([
      PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.NOTE_SEMANTIC_INVALID,
      PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.FOOTNOTE_LAYOUT_BLOCKED,
      PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.TABLE_ROW_TOO_TALL,
      PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.IMAGE_LOAD_FAILED
    ]);
    expect(report.warnings.map(({ code }) => code)).toEqual([
      PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.IMAGE_LOAD_PENDING,
      PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.FONT_LOAD_PENDING,
      PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.HORIZONTAL_OVERFLOW
    ]);
  });

  it("requires confirmation for unresolved font, image, and width warnings", () => {
    const report = createPdfOutputPreflightReport({
      surfaceAvailable: true,
      failedFontCount: 2,
      pendingImageCount: 1,
      horizontalOverflowCount: 1
    });

    expect(report).toMatchObject({
      status: "warning",
      canPrint: true,
      requiresConfirmation: true,
      issueCount: 4
    });
    expect(report.issues.every(Object.isFrozen)).toBe(true);
  });

  it("collects only scoped live DOM and FontFaceSet signals", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-dockit-footnote-print-state", "blocked");
    const root = document.createElement("div");
    const footnote = document.createElement("div");
    const clippedRow = document.createElement("div");
    const failedImage = document.createElement("img");
    const pendingImage = document.createElement("img");
    const overflowingTable = document.createElement("table");
    const outsideImage = document.createElement("img");

    footnote.setAttribute("data-dockit-note-body", "true");
    footnote.setAttribute("data-dockit-note-kind", "footnote");
    clippedRow.className = "tiptap-table-row-too-tall tiptap-table-row-too-tall--clipped";
    setImageState(failedImage, { complete: true, naturalWidth: 0 });
    setImageState(pendingImage, { complete: false, naturalWidth: 0 });
    setImageState(outsideImage, { complete: true, naturalWidth: 0 });
    setMetric(root, "clientWidth", 600);
    setMetric(root, "scrollWidth", 600);
    setMetric(overflowingTable, "clientWidth", 400);
    setMetric(overflowingTable, "scrollWidth", 410);

    root.append(footnote, clippedRow, failedImage, pendingImage, overflowingTable);
    wrapper.append(root);
    document.body.append(wrapper, outsideImage);

    const fontSet = {
      status: "loading",
      *[Symbol.iterator]() {
        yield { status: "loading" };
        yield { status: "error" };
        yield { status: "loaded" };
      }
    };
    const signals = collectPdfOutputPreflightSignals({
      rootElement: root,
      fontSet,
      notePersistenceBlocked: true
    });

    expect(signals).toEqual({
      surfaceAvailable: true,
      notePersistenceBlocked: true,
      footnotePrintState: "blocked",
      hasFootnoteBodies: true,
      tableRowTooTallCount: 1,
      horizontalOverflowCount: 1,
      failedImageCount: 1,
      pendingImageCount: 1,
      failedFontCount: 1,
      pendingFontCount: 1
    });
    expect(Object.isFrozen(signals)).toBe(true);

    wrapper.remove();
    outsideImage.remove();
  });

  it("blocks a missing output surface and audits a ready root end to end", () => {
    expect(auditPdfOutputPreflight({ rootElement: null })).toMatchObject({
      status: "blocked",
      canPrint: false,
      blockers: [{
        code: PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.OUTPUT_SURFACE_UNAVAILABLE
      }]
    });

    const root = document.createElement("div");
    root.setAttribute("data-dockit-footnote-print-state", "not-required");
    setMetric(root, "clientWidth", 600);
    setMetric(root, "scrollWidth", 600);

    expect(auditPdfOutputPreflight({
      rootElement: root,
      fontSet: { status: "loaded", *[Symbol.iterator]() {} }
    })).toMatchObject({
      status: "ready",
      canPrint: true,
      requiresConfirmation: false
    });
  });
});
