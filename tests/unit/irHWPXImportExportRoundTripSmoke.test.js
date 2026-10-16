import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  importHWPXToIR,
  parseHWPXXml,
  readHWPXPackageFromBytes
} from "../../app/LIB/ir/hwpxImport";
import {
  createHWPXV0ExportInput,
  exportIRToHWPXV0
} from "../../app/LIB/ir/hwpxMinimalExport";

const fixturePath = (...parts) =>
  path.join(process.cwd(), "tests", "fixtures", "hwpx", ...parts);

const readFixture = (...parts) => readFileSync(fixturePath(...parts));

const inflateRaw = (bytes) => new Uint8Array(inflateRawSync(bytes));

const hasZipLocalFileSignature = (bytes) =>
  bytes[0] === 0x50 &&
  bytes[1] === 0x4b &&
  bytes[2] === 0x03 &&
  bytes[3] === 0x04;

const decodeXmlText = (value) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const extractVisibleText = (sectionXml) =>
  Array.from(sectionXml.matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g))
    .map((match) => decodeXmlText(match[1]))
    .join("");

const getEntryText = (packageResult, entryPath) => {
  const entry = packageResult.entryMap.get(entryPath);

  expect(entry, `${entryPath} entry should exist`).toBeDefined();
  expect(entry.text, `${entryPath} should be readable text`).toEqual(
    expect.any(String)
  );

  return entry.text;
};

const localName = (name) => {
  const index = name.indexOf(":");

  return index === -1 ? name : name.slice(index + 1);
};

const countXmlNodes = (node, name) =>
  (localName(node.name) === name ? 1 : 0) +
  node.children.reduce((sum, child) => sum + countXmlNodes(child, name), 0);

const countHeadingType = (xml, type) =>
  (xml.match(new RegExp(`<hh:heading type="${type}"`, "g")) || []).length;

const getNativeListCounts = (headerXml) => ({
  numberings: countXmlNodes(parseHWPXXml(headerXml).root, "numbering"),
  bullets: countXmlNodes(parseHWPXXml(headerXml).root, "bullet"),
  numberPara: countHeadingType(headerXml, "NUMBER"),
  bulletPara: countHeadingType(headerXml, "BULLET")
});

const getCellSpans = (sectionXml) =>
  Array.from(sectionXml.matchAll(/<hp:cellSpan\b[^>]*>/g)).map((match) => ({
    colSpan: match[0].match(/colSpan="([^"]+)"/)?.[1] ?? null,
    rowSpan: match[0].match(/rowSpan="([^"]+)"/)?.[1] ?? null
  }));

const getHyperlinkTargets = (sectionXml) =>
  Array.from(
    sectionXml.matchAll(
      /<hp:stringParam name="Command">([\s\S]*?)<\/hp:stringParam>/g
    )
  ).map((match) =>
    decodeXmlText(match[1])
      .replace(/\\:/g, ":")
      .replace(/;1;0;0;$/, "")
  );

const getImageHref = (contentHpf) => {
  const match = contentHpf.match(
    /<opf:item\b[^>]*href="([^"]+)"[^>]*media-type="image\/(?:png|jpeg|jpg)"/
  );

  return match ? decodeXmlText(match[1]) : null;
};

const importExportRoundTrip = (fileName) => {
  const importResult = importHWPXToIR(readFixture(fileName), {
    sourceName: fileName,
    inflateRaw,
    extractedAt: "2026-05-31T00:00:00.000Z"
  });
  const exportResult = exportIRToHWPXV0(
    createHWPXV0ExportInput(importResult.irDocument)
  );

  expect(hasZipLocalFileSignature(exportResult.packageBytes)).toBe(true);

  const packageResult = readHWPXPackageFromBytes(exportResult.packageBytes, {
    sourceName: `${fileName}.roundtrip-smoke.hwpx`,
    inflateRaw
  });
  const sectionXml = getEntryText(packageResult, "Contents/section0.xml");
  const headerXml = getEntryText(packageResult, "Contents/header.xml");
  const contentHpf = getEntryText(packageResult, "Contents/content.hpf");
  const sectionParse = parseHWPXXml(sectionXml);
  const headerParse = parseHWPXXml(headerXml);
  const contentParse = parseHWPXXml(contentHpf);
  const report = {
    fixture: fileName,
    importWarningCodes: importResult.warnings.map((warning) => warning.code),
    exportWarningCodes: exportResult.warnings.map((warning) => warning.code),
    importLossSummary: importResult.lossReport.summary
  };

  expect(importResult.warnings.filter((warning) => warning.severity === "error")).toEqual(
    []
  );
  expect(exportResult.warnings.filter((warning) => warning.severity === "blocked")).toEqual(
    []
  );
  expect(packageResult.packageSummary.requiredEntries).toEqual({
    mimetype: true,
    contentHpf: true,
    headerXml: true,
    section0Xml: true
  });
  expect(packageResult.packageSummary.mimetype).toBe("application/hwp+zip");
  expect(packageResult.packageSummary.sectionCount).toBeGreaterThanOrEqual(1);
  expect(sectionParse.warnings).toEqual([]);
  expect(headerParse.warnings).toEqual([]);
  expect(contentParse.warnings).toEqual([]);
  expect(report.importLossSummary.errorCount).toBe(0);

  return {
    contentHpf,
    exportResult,
    headerParse,
    headerXml,
    importResult,
    packageResult,
    report,
    sectionParse,
    sectionXml,
    visibleText: extractVisibleText(sectionXml)
  };
};

const roundTripCases = [
  {
    fileName: "minimal-paragraph-heading.hwpx",
    expectedText: ["Export readiness", "A long paragraph with an inline tag."],
    expectedTableCount: 0,
    expectedCellCount: 0,
    assertSemantics: ({ sectionParse }) => {
      expect(countXmlNodes(sectionParse.root, "tbl")).toBe(0);
      expect(countXmlNodes(sectionParse.root, "p")).toBeGreaterThanOrEqual(2);
    }
  },
  {
    fileName: "minimal-basic-table.hwpx",
    expectedText: ["Simple cell"],
    expectedTableCount: 1,
    expectedCellCount: 1,
    assertSemantics: ({ headerXml, sectionParse, sectionXml }) => {
      expect(countXmlNodes(sectionParse.root, "tbl")).toBe(1);
      expect(countXmlNodes(sectionParse.root, "tc")).toBe(1);
      expect(sectionXml).toMatch(/<hp:tbl\b[^>]*borderFillIDRef="\d+"/);
      expect(sectionXml).toMatch(/<hp:tc\b[^>]*borderFillIDRef="\d+"/);
      expect(headerXml).toContain("<hh:borderFill");
      expect(headerXml).toContain('color="#333333"');
    }
  },
  {
    fileName: "minimal-link.hwpx",
    expectedText: ["Dockit 링크"],
    expectedTableCount: 0,
    expectedCellCount: 0,
    assertSemantics: ({ sectionXml }) => {
      expect(getHyperlinkTargets(sectionXml)).toEqual([
        "https://example.com/dockit?x=1&y=2"
      ]);
    }
  },
  {
    fileName: "minimal-image-object.hwpx",
    expectedText: ["Export readiness"],
    expectedTableCount: 0,
    expectedCellCount: 0,
    assertSemantics: ({ contentHpf, packageResult, sectionParse, sectionXml }) => {
      const imageHref = getImageHref(contentHpf);

      expect(countXmlNodes(sectionParse.root, "pic")).toBe(1);
      expect(sectionXml).toContain('binaryItemIDRef="image1"');
      expect(contentHpf).toContain('media-type="image/png"');
      expect(imageHref).toBe("BinData/dockit-image-fixture.png");
      expect(packageResult.entryMap.get(imageHref)?.bytes.length).toBeGreaterThan(0);
    }
  },
  {
    fileName: "minimal-styled-text.hwpx",
    expectedText: [
      "굵게",
      "기울임",
      "밑줄",
      "취소선",
      "색상",
      "강조",
      "코드",
      "위첨자",
      "아래첨자"
    ],
    expectedTableCount: 0,
    expectedCellCount: 0,
    assertSemantics: ({ headerXml }) => {
      expect(headerXml).toContain('bold="1"');
      expect(headerXml).toContain('italic="1"');
      expect(headerXml).toContain('face="Noto Sans KR"');
      expect(headerXml).toContain('face="Consolas"');
      expect(headerXml).toContain('textColor="#336699"');
      expect(headerXml).toContain('shadeColor="#FFF59D"');
      expect(headerXml).toContain("<hh:supscript/>");
      expect(headerXml).toContain("<hh:subscript/>");
    }
  },
  {
    fileName: "minimal-list-object.hwpx",
    expectedText: [
      "Export readiness",
      "Nested item",
      "Bullet item",
      "[Object placeholder: image img-1]"
    ],
    expectedTableCount: 0,
    expectedCellCount: 0,
    assertSemantics: ({ headerXml }) => {
      expect(getNativeListCounts(headerXml)).toEqual({
        numberings: 1,
        bullets: 1,
        numberPara: 1,
        bulletPara: 1
      });
    }
  },
  {
    fileName: "minimal-readiness-smoke.hwpx",
    expectedText: [
      "Export readiness",
      "A long paragraph with an inline tag.",
      "Nested item",
      "Merged cell",
      "Bullet item",
      "[Object placeholder: image img-1]"
    ],
    expectedTableCount: 1,
    expectedCellCount: 1,
    assertSemantics: ({ headerXml, sectionXml }) => {
      expect(getNativeListCounts(headerXml)).toEqual({
        numberings: 1,
        bullets: 1,
        numberPara: 1,
        bulletPara: 1
      });
      expect(getCellSpans(sectionXml)).toEqual([{ colSpan: "1", rowSpan: "1" }]);
    }
  },
  {
    fileName: "minimal-merged-table.hwpx",
    expectedText: ["Export readiness", "Merged left", "Top right", "Bottom right"],
    expectedTableCount: 1,
    expectedCellCount: 3,
    expectedExportWarningCodes: ["table-merge-layout-warning"],
    assertSemantics: ({ sectionXml }) => {
      expect(getCellSpans(sectionXml)).toContainEqual({
        colSpan: "1",
        rowSpan: "2"
      });
    }
  },
  {
    fileName: "minimal-table-merge-colspan-only.hwpx",
    expectedText: [
      "Export readiness",
      "Colspan top",
      "Top right",
      "Bottom left",
      "Bottom middle",
      "Bottom right"
    ],
    expectedTableCount: 1,
    expectedCellCount: 5,
    expectedExportWarningCodes: ["table-merge-layout-warning"],
    assertSemantics: ({ sectionXml }) => {
      expect(getCellSpans(sectionXml)).toContainEqual({
        colSpan: "2",
        rowSpan: "1"
      });
    }
  },
  {
    fileName: "minimal-table-merge-rowspan-only.hwpx",
    expectedText: ["Export readiness", "Rowspan left", "R1C2", "R2C2", "R3C2"],
    expectedTableCount: 1,
    expectedCellCount: 4,
    expectedExportWarningCodes: ["table-merge-layout-warning"],
    assertSemantics: ({ sectionXml }) => {
      expect(getCellSpans(sectionXml)).toContainEqual({
        colSpan: "1",
        rowSpan: "3"
      });
    }
  },
  {
    fileName: "minimal-table-merge-mixed-span.hwpx",
    expectedText: [
      "Export readiness",
      "Mixed block",
      "Top right",
      "Middle right",
      "Bottom left",
      "Bottom middle",
      "Bottom right"
    ],
    expectedTableCount: 1,
    expectedCellCount: 6,
    expectedExportWarningCodes: ["table-merge-layout-warning"],
    assertSemantics: ({ sectionXml }) => {
      expect(getCellSpans(sectionXml)).toContainEqual({
        colSpan: "2",
        rowSpan: "2"
      });
    }
  },
  {
    fileName: "minimal-table-merge-clamped-rowspan.hwpx",
    expectedText: [
      "Export readiness",
      "Oversized rowspan",
      "Clamp top",
      "Clamp bottom"
    ],
    expectedTableCount: 1,
    expectedCellCount: 3,
    expectedExportWarningCodes: ["table-merge-layout-warning"],
    assertSemantics: ({ sectionXml }) => {
      expect(getCellSpans(sectionXml)).toContainEqual({
        colSpan: "1",
        rowSpan: "2"
      });
    }
  },
  {
    fileName: "minimal-semantic-blocks.hwpx",
    expectedText: [
      "Semantic fallback blocks",
      "const dockit = true;",
      "return dockit;",
      "인용문 첫 줄",
      "인용문 둘째 줄"
    ],
    forbiddenText: [
      "[Unsupported block: codeBlock]",
      "[Unsupported block: blockquote]"
    ],
    expectedTableCount: 0,
    expectedCellCount: 0,
    assertSemantics: ({ headerXml }) => {
      expect(headerXml).toContain('face="Consolas"');
      expect(headerXml).toContain('shadeColor="#F3F4F6"');
    }
  }
];

describe("HWPX import -> export semantic round-trip smoke", () => {
  it.each(roundTripCases)(
    "$fileName fixture를 IR로 import한 뒤 HWPX v0로 다시 export해 핵심 의미 구조를 보존한다",
    ({
      fileName,
      expectedText,
      forbiddenText = [],
      expectedTableCount,
      expectedCellCount,
      expectedImportWarningCodes = [],
      expectedExportWarningCodes = [],
      assertSemantics
    }) => {
      const result = importExportRoundTrip(fileName);

      expectedText.forEach((text) => {
        expect(result.visibleText).toContain(text);
      });
      forbiddenText.forEach((text) => {
        expect(result.visibleText).not.toContain(text);
      });
      expect(countXmlNodes(result.sectionParse.root, "tbl")).toBe(
        expectedTableCount
      );
      expect(countXmlNodes(result.sectionParse.root, "tc")).toBe(
        expectedCellCount
      );
      assertSemantics(result);
      expect(result.report.importWarningCodes).toEqual(expectedImportWarningCodes);
      expect(result.report.exportWarningCodes).toEqual(expectedExportWarningCodes);
    }
  );
});
