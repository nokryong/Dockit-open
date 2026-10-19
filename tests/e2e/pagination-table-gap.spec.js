import fs from "node:fs";
import { buildSync } from "esbuild";
import { expect, test } from "@playwright/test";

const widgets = buildSync({
  stdin: {
    contents: 'export { createPageBreakWidgetElement, createPageBreakHeaderWidgetElement } from "./app/LIB/pagination/render/createPaginationDecorations.js";',
    resolveDir: process.cwd()
  },
  bundle: true, write: false, format: "iife", globalName: "paginationWidgets"
}).outputFiles[0].text;
const css = fs.readFileSync("app/LIB/css/tiptap.css", "utf8");

for (const scale of [0.75, 1.5]) {
  for (const border of [1, 3]) {
    test(`table page gaps keep their planned height at scale ${scale} with ${border}px borders`, async ({ page }) => {
      await page.setContent(`<style>
        ${css}
        * { box-sizing: border-box; }
        .tiptap-container { --table-border: #000; --table-border-width: ${border}px; transform: scale(${scale}); transform-origin: top left; }
        td { padding: 3px; font: 14.6667px/1.6 sans-serif; }
      </style><div class="tiptap-container"><table><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table></div>`);
      await page.addScriptTag({ content: widgets });
      const gap = await page.evaluate(({ scale, border }) => {
        const rows = [...document.querySelectorAll("tr")];
        const pageMetrics = { padding: { top: 94.48818897637796, bottom: 94.48818897637796 } };
        const options = { pageMetrics, kind: "tableRow", tableColSpan: 1, tableBorderHeight: border / 2 };
        const end = window.paginationWidgets.createPageBreakWidgetElement({
          ...options, fillerHeight: 12.875, gapHeight: 50, includeHeader: false
        });
        const start = window.paginationWidgets.createPageBreakHeaderWidgetElement(options);
        rows[1].before(end, start);
        return (rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom) / scale;
      }, { scale, border });
      expect(Math.abs(gap - (12.875 + 50 + 2 * 94.48818897637796))).toBeLessThan(0.05);
    });
  }
}
