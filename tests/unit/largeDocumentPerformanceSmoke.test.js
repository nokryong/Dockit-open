/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "../../app/LIB/constant/editorExtensions";
import { calculatePaginationPlan } from "../../app/LIB/pagination/layout/calculatePaginationPlan";
import { createSaveQueueController } from "../../app/LIB/hook/useSaveQueue";



vi.mock("../../app/LIB/extensions/DiagramBlockView.js", () => ({
  default: () => null
}));
const editors = [];
const now = () => performance.now();
const elapsed = (start) => Number((now() - start).toFixed(2));

const createLargeContent = () => ({
  type: "doc",
  content: [
    ...Array.from({ length: 360 }, (_, index) => ({
      type: index % 40 === 0 ? "heading" : "paragraph",
      attrs: index % 40 === 0 ? { level: 2 } : undefined,
      content: [
        {
          type: "text",
          text: `Paragraph ${index}: deterministic long-document content for pagination and export.`
        }
      ]
    })),
    {
      type: "table",
      content: Array.from({ length: 24 }, (_, row) => ({
        type: "tableRow",
        content: Array.from({ length: 4 }, (_, column) => ({
          type: "tableCell",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: `R${row} C${column}` }]
            }
          ]
        }))
      }))
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Inline equation: " },
        { type: "inlineMath", attrs: { latex: "x^2 + y^2" } }
      ]
    },
    { type: "blockMath", attrs: { latex: "x^2 + y^2 = z^2" } }
  ]
});

const createPaginationInput = () => ({
  pageMetrics: { pageHeightPx: 1056, padding: { top: 96, bottom: 96 } },
  contentAreaHeight: 864,
  blocks: Array.from({ length: 420 }, (_, index) => ({
    pos: index * 10 + 1, nodeSize: 8, type: index % 31 === 0 ? "table" : "paragraph"
  })),
  measurements: Array.from({ length: 420 }, (_, index) => ({
    pos: index * 10 + 1, blockPos: index * 10 + 1,
    blockType: index % 31 === 0 ? "table" : "paragraph",
    kind: index % 31 === 0 ? "tableRow" : "block", offsetHeight: index % 31 === 0 ? 76 : 28,
    marginTop: 0, marginBottom: 0, extraLeft: 0, extraRight: 0, isBlockStart: true,
    tableRowIndex: index % 31 === 0 ? 0 : undefined, tableRowGroupStartIndex: 0,
    tableRowGroupEndIndex: 0, tableRowHasMergedCells: false
  }))
});

const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe("large-document performance smoke", () => {
  it("keeps the local rendering, pagination, export and autosave contracts within bounded budgets", async () => {
    const samples = [];
    for (let run = 0; run < 3; run += 1) {
      const heapStartBytes = process.memoryUsage().heapUsed;
      const content = createLargeContent();
      const loadStarted = now();
      const editor = new Editor({
        element: document.createElement("div"),
        extensions: editorExtensions,
        content
      });
      editors.push(editor);
      const loadMs = elapsed(loadStarted);

      const scrollStarted = now();
      editor.view.dom.scrollTop = 500;
      let visitedNodes = 0;
      editor.state.doc.descendants(() => {
        visitedNodes += 1;
      });
      const scrollMs = elapsed(scrollStarted);

      const tableStarted = now();
      let tableCount = 0;
      let inlineMathCount = 0;
      let blockMathCount = 0;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "table") tableCount += 1;
        if (node.type.name === "inlineMath") inlineMathCount += 1;
        if (node.type.name === "blockMath") blockMathCount += 1;
      });
      const tableMs = elapsed(tableStarted);

      const paginationStarted = now();
      const plan = calculatePaginationPlan(createPaginationInput());
      const paginationMs = elapsed(paginationStarted);

      const printStarted = now();
      const printableHtml = editor.getHTML();
      const printMs = elapsed(printStarted);
      const exportStarted = now();
      const exportBytes = new TextEncoder().encode(printableHtml).byteLength;
      const exportMs = elapsed(exportStarted);

      const scheduled = [];
      const writes = [];
      const queue = createSaveQueueController(
        async (id, payload, meta) => {
          writes.push({ id, payload, meta });
          return true;
        },
        {
          schedule: (callback) => {
            scheduled.push(callback);
            return scheduled.length;
          },
          cancelScheduled: () => {}
        }
      );
      const autosaveStarted = now();
      queue.save("performance-fixture", { content: printableHtml.slice(0, 512) });
      queue.save("performance-fixture", { revision: run }, true);
      await Promise.resolve();
      await queue.processQueue("performance-fixture");
      const autosaveMs = elapsed(autosaveStarted);
      queue.dispose();

      expect(visitedNodes).toBeGreaterThan(1_000);
      expect(editor.view.dom.scrollTop).toBe(500);
      expect(tableCount).toBe(1);
      expect(inlineMathCount).toBe(1);
      expect(blockMathCount).toBe(1);
      expect(plan.totalPages).toBeGreaterThan(1);
      expect(printableHtml).toContain("<table");
      expect(printableHtml).toContain('data-type="inline-math"');
      expect(printableHtml).toContain('data-type="block-math"');
      expect(exportBytes).toBeGreaterThan(20_000);
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        id: "performance-fixture",
        payload: { revision: run },
        meta: { immediate: true }
      });
      samples.push({
        loadMs, scrollMs, tableMs, paginationMs, printMs, exportMs, autosaveMs,
        exportBytes,
        heapDeltaBytes: Math.max(0, process.memoryUsage().heapUsed - heapStartBytes)
      });
    }

    const result = Object.fromEntries(
      Object.keys(samples[0]).map((key) => [
        key,
        median(samples.map((sample) => sample[key]))
      ])
    );
    console.log(
      "S2-6 large-document performance smoke",
      JSON.stringify({ runs: samples, median: result })
    );
    expect(result.loadMs).toBeLessThan(2_000);
    expect(result.scrollMs).toBeLessThan(200);
    expect(result.tableMs).toBeLessThan(200);
    expect(result.paginationMs).toBeLessThan(1_000);
    expect(result.printMs).toBeLessThan(500);
    expect(result.exportMs).toBeLessThan(100);
    expect(result.autosaveMs).toBeLessThan(500);
    expect(result.exportBytes).toBeLessThan(250_000);
    expect(result.heapDeltaBytes).toBeLessThan(64 * 1024 * 1024);
  });
});
