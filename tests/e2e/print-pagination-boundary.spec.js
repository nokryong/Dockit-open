import fs from "node:fs";
import { expect, test } from "@playwright/test";

const printCss = fs.readFileSync(
  "app/LIB/css/print-mode.css",
  "utf8"
);

for (const { pages, drift } of [{ pages: 2, drift: 0 }, { pages: 7, drift: 3.25 }]) {
  test(`prints ${pages} planned pages without an extra sheet at a rounded boundary`, async ({ page }) => {
    const contentHeight = (247 / 25.4) * 96;
    const sections = Array.from({ length: pages }, (_, index) => {
      const isLast = index === pages - 1;
      const boundaryDrift = index === pages - 2 ? drift : 0;
      return `
        <div class="tiptap-page-break-structure ${index === 0 ? "tiptap-page-break-structure--start" : "tiptap-page-break-structure--header"}">
          <div class="page-header-spacer" style="height:25mm;--print-header-height:25mm"></div>
        </div>
        <div style="height:${isLast ? 100 : contentHeight - 30 + boundaryDrift}px">Page ${index + 1}</div>
        <div class="tiptap-page-break-structure ${isLast ? "tiptap-page-break-structure--final tiptap-final-page-filler" : "tiptap-page-break-structure--end"}">
          <div class="page-content-filler" style="height:${isLast ? contentHeight - 100 : 30}px"></div>
          <div class="page-footer-spacer" style="height:25mm;--print-footer-height:25mm"></div>
          ${isLast ? "" : '<div class="page-break-boundary"></div>'}
        </div>`;
    }).join("");
    await page.setContent(`<!doctype html><html><head><style>
      @page { size:210mm 297mm; margin:0; }
      body { margin:0; }
      .printable-area { --print-page-width:210mm; }
      ${printCss}
    </style></head><body><div class="tiptap-container">
      <div class="tiptap-main-canvas printable-area ProseMirror">${sections}</div>
    </div></body></html>`);

    const screenHeight = await page.locator(".printable-area").evaluate(el => el.offsetHeight);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(pages);
    expect(await page.locator(".printable-area").evaluate(el => el.offsetHeight)).toBe(screenHeight);
  });
}
