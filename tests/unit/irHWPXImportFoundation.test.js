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
import { normalizeListNumbering } from "../../app/LIB/ir/listNumberingModel";
import { normalizeObjectModel } from "../../app/LIB/ir/objectModel";
import { normalizeTextBlockStyle } from "../../app/LIB/ir/styleModel";
import expectations from "../fixtures/hwpx/visualGoldenExpectations.json";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const fixturePath = (...parts) =>
  path.join(process.cwd(), "tests", "fixtures", "hwpx", ...parts);

const readFixture = (...parts) => readFileSync(fixturePath(...parts));

const inflateRaw = (bytes) => new Uint8Array(inflateRawSync(bytes));

const importFixture = (...parts) =>
  importHWPXToIR(readFixture(...parts), {
    sourceName: parts.join("/"),
    inflateRaw,
    extractedAt: "2026-05-27T00:00:00.000Z"
  });

const uint16 = (value) => {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
};

const uint32 = (value) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
};

const concatBytes = (chunks) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });

  return output;
};

const contentBytes = (content) =>
  typeof content === "string" ? encoder.encode(content) : content;

const createStoredZip = (entries) => {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.path);
    const data = contentBytes(entry.content);
    const localHeader = concatBytes([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(data.length),
      uint32(data.length),
      uint16(nameBytes.length),
      uint16(0),
      nameBytes,
      data
    ]);
    const centralHeader = concatBytes([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(data.length),
      uint32(data.length),
      uint16(nameBytes.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      nameBytes
    ]);

    localChunks.push(localHeader, data);
    centralChunks.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const centralDirectory = concatBytes(centralChunks);
  const endOfCentralDirectory = concatBytes([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0)
  ]);

  return concatBytes([...localChunks, centralDirectory, endOfCentralDirectory]);
};

const packageEntriesFromBytes = (bytes) =>
  readHWPXPackageFromBytes(bytes, { inflateRaw }).entries.map((entry) => ({
    path: entry.path,
    content: entry.bytes
  }));

const baseIntakeIR = {
  type: "document",
  version: "ir-v1.1-draft",
  metadata: {
    extractedAt: "2026-05-31T00:00:00.000Z",
    extractorVersion: "test",
    source: { editor: "test", mode: "readonly-snapshot" },
    warnings: []
  },
  sections: [
    {
      type: "section",
      id: "intake-section",
      breakType: "unknown",
      pageSettings: {
        widthMm: 210,
        heightMm: 297,
        paddingTopMm: 20,
        paddingBottomMm: 20,
        paddingLeftMm: 20,
        paddingRightMm: 20,
        lineHeight: 1.6
      },
      blocks: [
        {
          type: "paragraph",
          attrs: {},
          runs: [{ type: "textRun", text: "Intake sample", marks: [] }]
        }
      ]
    }
  ]
};

const createBasePackageEntries = () => {
  const exported = exportIRToHWPXV0(createHWPXV0ExportInput(baseIntakeIR));

  return packageEntriesFromBytes(exported.packageBytes);
};

const updateEntryText = (entries, entryPath, updater) =>
  entries.map((entry) =>
    entry.path === entryPath
      ? { ...entry, content: updater(decoder.decode(contentBytes(entry.content))) }
      : entry
  );

const removeEntry = (entries, entryPath) =>
  entries.filter((entry) => entry.path !== entryPath);

const addSectionEntry = (entries, entryPath, content) => [
  ...entries,
  { path: entryPath, content }
];

const importSyntheticPackage = (entries, sourceName = "synthetic.hwpx") =>
  importHWPXToIR(createStoredZip(entries), {
    sourceName,
    inflateRaw,
    extractedAt: "2026-05-31T00:00:00.000Z"
  });

const inlineText = (runs) =>
  runs.map((run) => (run.type === "textRun" ? run.text : "\n")).join("");

const blockText = (block) => {
  if (block.type === "paragraph" || block.type === "heading") {
    return inlineText(block.runs);
  }

  if (block.type === "table") {
    return block.rows
      .map((row) =>
        row.cells.map((cell) => cell.blocks.map(blockText).join("")).join("\t")
      )
      .join("\n");
  }

  if (block.type === "list") {
    return block.items
      .map((item) => item.blocks.map(blockText).join(""))
      .join("\n");
  }

  if (block.type === "object") {
    return String(block.attrs.shapeComment ?? "");
  }

  return "";
};

const documentText = (result) =>
  result.irDocument.sections
    .flatMap((section) => section.blocks.map(blockText))
    .join("\n");

const expectSolidTableBorder = (attrs) => {
  ["Top", "Right", "Bottom", "Left"].forEach((side) => {
    expect(attrs[`border${side}Color`]).toBe("#333333");
    expect(attrs[`border${side}Style`]).toBe("solid");
    expect(attrs[`border${side}Width`]).toBe("0.4 mm");
  });
};

describe("HWPX import foundation parser-only", () => {
  it("HWPX package reader는 required entry와 XML parse helper를 제공한다", () => {
    const packageResult = readHWPXPackageFromBytes(
      readFixture("minimal-paragraph-heading.hwpx")
    );
    const sectionEntry = packageResult.entryMap.get("Contents/section0.xml");
    const parsedSection = parseHWPXXml(sectionEntry.text);

    expect(packageResult.packageSummary.requiredEntries).toEqual({
      mimetype: true,
      contentHpf: true,
      headerXml: true,
      section0Xml: true
    });
    expect(packageResult.packageSummary.mimetype).toBe("application/hwp+zip");
    expect(packageResult.packageSummary.sectionCount).toBe(1);
    expect(packageResult.packageSummary.sectionEntries).toEqual([
      "Contents/section0.xml"
    ]);
    expect(sectionEntry.text).toContain("<hs:sec");
    expect(parsedSection.root.children[0].name).toBe("hs:sec");
    expect(parsedSection.warnings).toEqual([]);
  });

  it("intake report는 외부 HWPX 접수 전에 package/header/BinData 구조를 요약한다", () => {
    const result = importFixture("minimal-image-object.hwpx");

    expect(result.intakeReport.package).toMatchObject({
      entryCount: result.packageSummary.entryCount,
      sectionCount: 1,
      requiredEntries: {
        mimetype: true,
        contentHpf: true,
        headerXml: true,
        section0Xml: true
      },
      unknownTopLevelEntries: []
    });
    expect(result.intakeReport.package.contentFiles).toEqual(
      expect.arrayContaining([
        "Contents/content.hpf",
        "Contents/header.xml",
        "Contents/section0.xml"
      ])
    );
    expect(result.intakeReport.package.binData).toMatchObject({
      entryCount: 1,
      contentItemCount: 1,
      mediaTypes: { "image/png": 1 }
    });
    expect(result.intakeReport.headerModel.charPrCount).toBeGreaterThan(0);
    expect(result.intakeReport.headerModel.paraPrCount).toBeGreaterThan(0);
    expect(result.intakeReport.xml.unknownTags.total).toBe(0);
    expect(result.intakeReport.xml.unsupportedControls.total).toBe(0);
  });

  it("unknown package entry, multiple section, unknown XML tag, unsupported control을 intake warning으로 요약한다", () => {
    const baseEntries = createBasePackageEntries();
    const originalSection = baseEntries.find(
      (entry) => entry.path === "Contents/section0.xml"
    );
    const entriesWithUnknowns = updateEntryText(
      [
        ...baseEntries,
        { path: "Contents/section1.xml", content: originalSection.content },
        { path: "Custom/extra.xml", content: "<x:custom><x:thing/></x:custom>" }
      ],
      "Contents/section0.xml",
      (sectionXml) =>
        sectionXml.replace(
          "</hs:sec>",
          [
            '<hp:p id="99001" paraPrIDRef="0" styleIDRef="0">',
            '<hp:run charPrIDRef="0">',
            "<hp:ctrl><hp:unsupportedControl/></hp:ctrl>",
            "<hp:t>Unknown control kept</hp:t>",
            "</hp:run>",
            "</hp:p>",
            "<hp:unknownBlock><hp:unknownInline/></hp:unknownBlock>",
            "</hs:sec>"
          ].join("")
        )
    );
    const result = importSyntheticPackage(entriesWithUnknowns, "unknown-intake.hwpx");
    const warningCodes = result.warnings.map((item) => item.code);

    expect(result.irDocument.sections).toHaveLength(2);
    expect(documentText(result)).toContain("Unknown control kept");
    expect(warningCodes).toEqual(
      expect.arrayContaining([
        "hwpx-import-package-partial",
        "hwpx-import-xml-unknown",
        "hwpx-import-control-unsupported"
      ])
    );
    expect(result.lossReport.entries.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "hwpx-import-package-partial",
        "hwpx-import-xml-unknown",
        "hwpx-import-control-unsupported"
      ])
    );
    expect(result.intakeReport.package.sectionCount).toBe(2);
    expect(result.intakeReport.package.unknownTopLevelEntries).toContain(
      "Custom/extra.xml"
    );
    expect(result.intakeReport.xml.unknownTags.top.map((item) => item.name)).toEqual(
      expect.arrayContaining(["unknownBlock", "unknownInline", "unsupportedControl"])
    );
    expect(
      result.intakeReport.xml.unsupportedControls.top.map((item) => item.name)
    ).toContain("unsupportedControl");
  });

  it("required section entry가 누락되어도 crash 없이 empty IR과 intake report를 반환한다", () => {
    const result = importSyntheticPackage(
      removeEntry(createBasePackageEntries(), "Contents/section0.xml"),
      "missing-section.hwpx"
    );
    const warningCodes = result.warnings.map((item) => item.code);

    expect(result.irDocument.sections[0].blocks).toEqual([]);
    expect(result.intakeReport.package.requiredEntries.section0Xml).toBe(false);
    expect(result.intakeReport.package.sectionCount).toBe(0);
    expect(result.intakeReport.references.missingContentItemEntries).toContain(
      "Contents/section0.xml"
    );
    expect(warningCodes).toEqual(
      expect.arrayContaining([
        "hwpx-import-missing-entry",
        "hwpx-import-reference-missing"
      ])
    );
    expect(result.lossReport.summary.errorCount).toBeGreaterThan(0);
  });

  it("content.hpf image item이 BinData 없이 남아도 metadata-loss로 정리한다", () => {
    const entries = removeEntry(
      packageEntriesFromBytes(readFixture("minimal-image-object.hwpx")),
      "BinData/dockit-image-fixture.png"
    );
    const result = importSyntheticPackage(entries, "missing-bindata.hwpx");
    const warningCodes = result.warnings.map((item) => item.code);
    const image = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "object"
    );

    expect(image.attrs).toMatchObject({
      hasBinaryEntry: false,
      binaryRestored: false,
      src: "BinData/dockit-image-fixture.png"
    });
    expect(result.intakeReport.package.binData).toMatchObject({
      entryCount: 0,
      contentItemCount: 1,
      mediaTypes: { "image/png": 1 }
    });
    expect(result.intakeReport.references.missingContentItemEntries).toContain(
      "BinData/dockit-image-fixture.png"
    );
    expect(warningCodes).toEqual(
      expect.arrayContaining([
        "hwpx-import-reference-missing",
        "hwpx-import-image-metadata-loss"
      ])
    );
  });

  it("broken hyperlink field와 empty paragraph/run도 crash 없이 warning으로 기록한다", () => {
    const entries = updateEntryText(
      createBasePackageEntries(),
      "Contents/section0.xml",
      (sectionXml) =>
        sectionXml.replace(
          "</hs:sec>",
          [
            '<hp:p id="99002" paraPrIDRef="0" styleIDRef="0">',
            '<hp:run charPrIDRef="0">',
            '<hp:ctrl><hp:fieldBegin type="HYPERLINK">',
            '<hp:parameters cnt="1" name="">',
            '<hp:stringParam name="Command">https\\://example.com;1;0;0;</hp:stringParam>',
            "</hp:parameters>",
            "</hp:fieldBegin></hp:ctrl>",
            "<hp:t>Broken link text</hp:t>",
            "</hp:run>",
            "</hp:p>",
            '<hp:p id="99003" paraPrIDRef="0" styleIDRef="0">',
            '<hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>',
            "</hp:p>",
            "</hs:sec>"
          ].join("")
        )
    );
    const result = importSyntheticPackage(entries, "broken-link.hwpx");

    expect(documentText(result)).toContain("Broken link text");
    expect(result.warnings.map((item) => item.code)).toContain(
      "hwpx-import-link-metadata-loss"
    );
    expect(result.lossReport.entries).toContainEqual(
      expect.objectContaining({
        code: "hwpx-import-link-metadata-loss",
        category: "link"
      })
    );
  });

  it("비정상 table span 값은 crash 없이 1로 clamp하고 lossReport에 남긴다", () => {
    const entries = updateEntryText(
      packageEntriesFromBytes(readFixture("minimal-basic-table.hwpx")),
      "Contents/section0.xml",
      (sectionXml) =>
        sectionXml.replace('colSpan="1" rowSpan="1"', 'colSpan="0" rowSpan="-2"')
    );
    const result = importSyntheticPackage(entries, "bad-table-span.hwpx");
    const table = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "table"
    );

    expect(table.rows[0].cells[0].attrs).toMatchObject({
      colspan: 1,
      rowspan: 1
    });
    expect(result.warnings.map((item) => item.code)).toContain(
      "hwpx-import-structure-clamped"
    );
    expect(result.lossReport.entries).toContainEqual(
      expect.objectContaining({
        code: "hwpx-import-structure-clamped",
        category: "table"
      })
    );
  });

  it("깨진 XML도 throw하지 않고 parse warning summary에 기록한다", () => {
    const entries = updateEntryText(
      createBasePackageEntries(),
      "Contents/header.xml",
      () => "<hh:head><hh:fontfaces>"
    );
    const result = importSyntheticPackage(entries, "broken-header-xml.hwpx");

    expect(result.warnings.map((item) => item.code)).toContain(
      "hwpx-import-xml-warning"
    );
    expect(result.intakeReport.parseErrors.warningCount).toBeGreaterThan(0);
    expect(result.intakeReport.parseErrors.byCode).toMatchObject({
      "hwpx-import-xml-warning": expect.any(Number)
    });
  });

  it("synthetic external-like unknown control 다량 문서를 crash 없이 top-N intake summary로 제한한다", () => {
    const controlNames = Array.from(
      { length: 12 },
      (_, index) => `externalControl${String(index + 1).padStart(2, "0")}`
    );
    const entries = updateEntryText(
      createBasePackageEntries(),
      "Contents/section0.xml",
      (sectionXml) =>
        sectionXml.replace(
          "</hs:sec>",
          [
            ...controlNames.map(
              (controlName, index) =>
                [
                  `<hp:p id="${99100 + index}" paraPrIDRef="0" styleIDRef="0">`,
                  '<hp:run charPrIDRef="0">',
                  `<hp:ctrl><hp:${controlName}/></hp:ctrl>`,
                  `<hp:t>Control ${index + 1}</hp:t>`,
                  "</hp:run>",
                  "</hp:p>"
                ].join("")
            ),
            "</hs:sec>"
          ].join("")
        )
    );
    const result = importSyntheticPackage(
      entries,
      "synthetic-many-unknown-controls.hwpx"
    );

    expect(result.warnings.filter((item) => item.severity === "error")).toEqual([]);
    expect(documentText(result)).toContain("Control 12");
    expect(result.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "hwpx-import-xml-unknown",
        "hwpx-import-control-unsupported"
      ])
    );
    expect(result.intakeReport.xml.unsupportedControls.total).toBe(12);
    expect(result.intakeReport.xml.unsupportedControls.top).toHaveLength(10);
    expect(result.intakeReport.xml.unknownTags.total).toBeGreaterThanOrEqual(12);
    expect(result.lossReport.entries).toContainEqual(
      expect.objectContaining({
        code: "hwpx-import-control-unsupported",
        category: "unsupported",
        count: 12
      })
    );
  });

  it("synthetic external-like multiple section 문서를 모든 section으로 복원하고 partial package warning을 남긴다", () => {
    const baseEntries = createBasePackageEntries();
    const section0 = baseEntries.find(
      (entry) => entry.path === "Contents/section0.xml"
    );
    const section0Xml = decoder.decode(contentBytes(section0.content));
    const entries = addSectionEntry(
      addSectionEntry(
        baseEntries,
        "Contents/section1.xml",
        section0Xml.replace("Intake sample", "Second synthetic section")
      ),
      "Contents/section2.xml",
      section0Xml.replace("Intake sample", "Third synthetic section")
    );
    const result = importSyntheticPackage(
      entries,
      "synthetic-multiple-sections.hwpx"
    );

    expect(result.warnings.filter((item) => item.severity === "error")).toEqual([]);
    expect(result.packageSummary.sectionCount).toBe(3);
    expect(result.intakeReport.package.sectionCount).toBe(3);
    expect(result.irDocument.sections).toHaveLength(3);
    expect(documentText(result)).toContain("Intake sample");
    expect(documentText(result)).toContain("Second synthetic section");
    expect(documentText(result)).toContain("Third synthetic section");
    expect(result.lossReport.entries).toContainEqual(
      expect.objectContaining({
        code: "hwpx-import-package-partial",
        category: "package",
        count: 3
      })
    );
  });

  it("synthetic external-like broken image reference와 broken link를 함께 warning/lossReport로 남긴다", () => {
    const entries = updateEntryText(
      removeEntry(
        packageEntriesFromBytes(readFixture("minimal-image-object.hwpx")),
        "BinData/dockit-image-fixture.png"
      ),
      "Contents/section0.xml",
      (sectionXml) =>
        sectionXml.replace(
          "</hs:sec>",
          [
            '<hp:p id="99200" paraPrIDRef="0" styleIDRef="0">',
            '<hp:run charPrIDRef="0">',
            '<hp:ctrl><hp:fieldEnd type="HYPERLINK"/></hp:ctrl>',
            "<hp:t>Dangling link end</hp:t>",
            "</hp:run>",
            "</hp:p>",
            "</hs:sec>"
          ].join("")
        )
    );
    const result = importSyntheticPackage(
      entries,
      "synthetic-broken-image-link.hwpx"
    );
    const warningCodes = result.warnings.map((item) => item.code);

    expect(result.warnings.filter((item) => item.severity === "error")).toEqual([]);
    expect(documentText(result)).toContain("Dangling link end");
    expect(result.intakeReport.references.missingContentItemEntries).toContain(
      "BinData/dockit-image-fixture.png"
    );
    expect(warningCodes).toEqual(
      expect.arrayContaining([
        "hwpx-import-reference-missing",
        "hwpx-import-image-metadata-loss",
        "hwpx-import-link-metadata-loss"
      ])
    );
    expect(result.lossReport.entries).toContainEqual(
      expect.objectContaining({
        code: "hwpx-import-image-metadata-loss",
        category: "image"
      })
    );
    expect(result.lossReport.entries).toContainEqual(
      expect.objectContaining({
        code: "hwpx-import-link-metadata-loss",
        category: "link"
      })
    );
  });

  it("synthetic external-like 복잡한 table span 값을 crash 없이 clamp/rounding warning으로 처리한다", () => {
    const entries = updateEntryText(
      packageEntriesFromBytes(readFixture("minimal-basic-table.hwpx")),
      "Contents/section0.xml",
      (sectionXml) =>
        sectionXml
          .replace('colSpan="1" rowSpan="1"', 'colSpan="2.8" rowSpan="oops"')
          .replace(
            "</hp:tbl>",
            [
              "<hp:unknownTableChild>",
              '<hp:unknownNestedTableSignal value="external-like"/>',
              "</hp:unknownTableChild>",
              "</hp:tbl>"
            ].join("")
          )
    );
    const result = importSyntheticPackage(
      entries,
      "synthetic-complex-table-span.hwpx"
    );
    const table = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "table"
    );

    expect(result.warnings.filter((item) => item.severity === "error")).toEqual([]);
    expect(table.rows[0].cells[0].attrs).toMatchObject({
      colspan: 2,
      rowspan: 1
    });
    expect(result.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "hwpx-import-structure-clamped",
        "hwpx-import-xml-unknown"
      ])
    );
    expect(result.intakeReport.xml.unknownTags.top.map((item) => item.name)).toEqual(
      expect.arrayContaining(["unknownNestedTableSignal", "unknownTableChild"])
    );
    expect(result.lossReport.entries).toContainEqual(
      expect.objectContaining({
        code: "hwpx-import-structure-clamped",
        category: "table"
      })
    );
  });

  it("synthetic external-like empty paragraph/run 다량 문서는 내용 있는 run만 보존하고 warning 없이 통과한다", () => {
    const emptyParagraphs = Array.from({ length: 20 }, (_, index) =>
      [
        `<hp:p id="${99300 + index}" paraPrIDRef="0" styleIDRef="0">`,
        '<hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>',
        '<hp:run charPrIDRef="0"></hp:run>',
        "</hp:p>"
      ].join("")
    );
    const entries = updateEntryText(
      createBasePackageEntries(),
      "Contents/section0.xml",
      (sectionXml) =>
        sectionXml.replace(
          "</hs:sec>",
          [
            ...emptyParagraphs,
            '<hp:p id="99350" paraPrIDRef="0" styleIDRef="0">',
            '<hp:run charPrIDRef="0"><hp:t>Non-empty tail</hp:t></hp:run>',
            "</hp:p>",
            "</hs:sec>"
          ].join("")
        )
    );
    const result = importSyntheticPackage(
      entries,
      "synthetic-empty-paragraph-runs.hwpx"
    );

    expect(result.warnings.filter((item) => item.severity === "error")).toEqual([]);
    expect(documentText(result)).toContain("Intake sample");
    expect(documentText(result)).toContain("Non-empty tail");
    expect(documentText(result)).not.toContain("undefined");
    expect(result.lossReport.summary.errorCount).toBe(0);
    expect(result.intakeReport.xml.unknownTags.total).toBe(0);
  });

  it("paragraph / heading fixture를 IRDocument로 최소 복원한다", () => {
    const result = importFixture("minimal-paragraph-heading.hwpx");
    const [heading, paragraph] = result.irDocument.sections[0].blocks;

    expect(result.irDocument.type).toBe("document");
    expect(result.packageSummary.entryCount).toBeGreaterThan(0);
    expect(result.warnings.filter((item) => item.severity === "error")).toEqual(
      []
    );
    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 1, textAlign: "justify", lineHeight: "160%" }
    });
    expect(blockText(heading)).toBe("Export readiness");
    expect(paragraph).toMatchObject({
      type: "paragraph",
      attrs: { textAlign: "justify", lineHeight: "160%" }
    });
    expect(blockText(paragraph)).toBe("A long paragraph with an inline tag.");
  });

  it("basic table fixture에서 cell text, span, borderFill metadata를 복원한다", () => {
    const result = importFixture("minimal-basic-table.hwpx");
    const table = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "table"
    );
    const warningCodes = result.warnings.map((item) => item.code);

    expect(table).toBeDefined();
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].cells).toHaveLength(1);
    expectSolidTableBorder(table.attrs);
    expect(table.rows[0].cells[0].attrs).toMatchObject({
      colspan: 1,
      rowspan: 1,
      colwidth: [1800]
    });
    expectSolidTableBorder(table.rows[0].cells[0].attrs);
    expect(blockText(table)).toContain("Simple cell");
    expect(warningCodes).not.toContain("hwpx-import-table-partial");
    expect(warningCodes).not.toContain("hwpx-import-table-style-partial");
    expect(result.lossReport.summary.tablePartialCount).toBe(0);
  });

  it("merged table fixture에서도 table/cell borderFillIDRef를 per-side border attrs로 복원한다", () => {
    const result = importFixture("minimal-table-merge-colspan-only.hwpx");
    const table = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "table"
    );

    expect(table).toBeDefined();
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].cells[0].attrs).toMatchObject({
      colspan: 2,
      rowspan: 1,
      colwidth: [3000]
    });
    expectSolidTableBorder(table.attrs);
    table.rows.forEach((row) => {
      row.cells.forEach((cell) => {
        expectSolidTableBorder(cell.attrs);
      });
    });
    expect(documentText(result)).toContain("Colspan top");
    expect(result.warnings.map((item) => item.code)).not.toContain(
      "hwpx-import-table-style-partial"
    );
  });

  it("native NUMBER/BULLET paraPr를 IR list block으로 복원한다", () => {
    const result = importFixture("minimal-list-object.hwpx");
    const lists = result.irDocument.sections[0].blocks.filter(
      (block) => block.type === "list"
    );
    const [orderedList, bulletList] = lists;
    const orderedNumbering = normalizeListNumbering(orderedList);
    const warningCodes = result.warnings.map((item) => item.code);

    expect(lists).toHaveLength(2);
    expect(orderedList).toMatchObject({
      type: "list",
      listType: "ordered",
      attrs: {
        source: "hwpx-native-paraPr",
        hwpxParaPrId: 7,
        hwpxListIdRef: 1,
        hwpxLevel: 0,
        markerFormat: "decimal",
        start: 3,
        startNumber: 3
      }
    });
    expect(orderedList.items).toHaveLength(1);
    expect(orderedList.items[0].attrs).toMatchObject({
      value: 3,
      hwpxParaPrId: 7
    });
    expect(blockText(orderedList)).toBe("Nested item");
    expect(orderedNumbering.items[0]).toMatchObject({
      markerKind: "ordered",
      markerFormat: "decimal",
      startNumber: 3,
      effectiveNumber: 3
    });

    expect(bulletList).toMatchObject({
      type: "list",
      listType: "bullet",
      attrs: {
        source: "hwpx-native-paraPr",
        hwpxParaPrId: 8,
        hwpxListIdRef: 1,
        hwpxLevel: 0,
        markerFormat: "bullet",
        bulletChar: "•"
      }
    });
    expect(blockText(bulletList)).toBe("Bullet item");
    expect(warningCodes).not.toContain("hwpx-import-list-partial");
    expect(documentText(result)).toContain("[Object placeholder: image img-1]");
  });

  it("link fixture에서 HYPERLINK Command href를 link mark로 복원한다", () => {
    const result = importFixture("minimal-link.hwpx");
    const paragraph = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "paragraph"
    );
    const linkRun = paragraph.runs.find(
      (run) => run.type === "textRun" && run.text === "Dockit 링크"
    );

    expect(blockText(paragraph)).toBe("Dockit 링크");
    expect(linkRun.marks).toContainEqual({
      type: "link",
      attrs: { href: "https://example.com/dockit?x=1&y=2" }
    });
    expect(result.warnings.map((item) => item.code)).not.toContain(
      "hwpx-import-style-loss"
    );
  });

  it("image object fixture에서 content.hpf image item, hp:pic metadata, PNG binary를 복원한다", () => {
    const result = importFixture("minimal-image-object.hwpx");
    const image = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "object"
    );

    expect(image).toBeDefined();
    const normalized = normalizeObjectModel(image);

    expect(image).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "block",
      anchorMode: "paragraph"
    });
    expect(image.attrs).toMatchObject({
      objectId: "image1",
      binaryItemIDRef: "image1",
      hwpxBinDataPath: "BinData/dockit-image-fixture.png",
      fileName: "dockit-image-fixture.png",
      mimeType: "image/png",
      isEmbedded: true,
      hasBinaryEntry: true,
      binaryRestored: true,
      binarySize: 176,
      widthHwpUnit: 1200,
      heightHwpUnit: 1200,
      title: "Dockit image fixture",
      altText: "Dockit fixture image",
      description: "Dockit image fixture\nDockit fixture image"
    });
    expect(image.attrs.src).toMatch(/^data:image\/png;base64,/);
    expect(normalized.relationship).toMatchObject({
      targetKind: "data-uri",
      mimeType: "image/png",
      fileName: "dockit-image-fixture.png"
    });
    expect(image.attrs.shapeComment).toContain("Dockit image fixture");
    expect(result.warnings.map((item) => item.code)).not.toContain(
      "hwpx-import-image-metadata-only"
    );
    expect(result.lossReport.summary.imageMetadataOnlyCount).toBe(0);
  });

  it("styled text fixture는 charPr basic style을 text run marks로 복원한다", () => {
    const result = importFixture("minimal-styled-text.hwpx");
    const paragraph = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "paragraph"
    );
    const text = documentText(result);
    const runByText = (value) =>
      paragraph.runs.find(
        (run) => run.type === "textRun" && run.text.trim() === value
      );
    const normalized = normalizeTextBlockStyle(paragraph);

    expect(text).toContain("굵게");
    expect(text).toContain("기울임");
    expect(text).toContain("코드");
    expect(text).toContain("위첨자");
    expect(runByText("굵게").marks).toContainEqual({ type: "bold" });
    expect(runByText("기울임").marks).toContainEqual({ type: "italic" });
    expect(runByText("밑줄").marks).toContainEqual({ type: "underline" });
    expect(runByText("취소선").marks).toContainEqual({ type: "strike" });
    expect(runByText("코드").marks).toContainEqual({ type: "code" });
    expect(runByText("위첨자").marks).toContainEqual({ type: "superscript" });
    expect(runByText("아래첨자").marks).toContainEqual({ type: "subscript" });
    expect(runByText("색상").marks).toContainEqual({
      type: "textStyle",
      attrs: {
        color: "#336699",
        fontFamily: "Noto Sans KR",
        fontSize: "13pt"
      }
    });
    expect(runByText("강조").marks).toContainEqual({
      type: "highlight",
      attrs: { color: "#FFF59D" }
    });
    expect(normalized.runs.find((run) => run.text.trim() === "코드")).toMatchObject({
      code: true,
      fontFamily: "Consolas"
    });
    expect(normalized.runs.find((run) => run.text.trim() === "색상")).toMatchObject({
      color: "#336699",
      fontFamily: "Noto Sans KR",
      fontSize: { value: 13, unit: "pt" }
    });
    expect(normalized.runs.find((run) => run.text.trim() === "강조")).toMatchObject({
      backgroundColor: "#FFF59D",
      highlightColor: "#FFF59D"
    });
    expect(result.warnings.map((item) => item.code)).not.toContain(
      "hwpx-import-style-loss"
    );
    expect(result.lossReport.summary.styleLossCount).toBe(0);
  });

  it("Hancom round-trip fixture의 deflate entry도 inflate callback으로 import할 수 있다", () => {
    const result = importFixture(
      "roundtrip",
      "minimal-paragraph-heading.roundtrip.hwpx"
    );

    expect(result.packageSummary.unsupportedCompressionMethods).toEqual([]);
    expect(documentText(result)).toContain("Export readiness");
    expect(documentText(result)).toContain(
      "A long paragraph with an inline tag."
    );
  });

  it.each(expectations)(
    "Hancom round-trip fixture $fileName도 import error 없이 주요 text를 복원한다",
    (fixture) => {
      const result = importFixture(
        "roundtrip",
        fixture.fileName.replace(".hwpx", ".roundtrip.hwpx")
      );

      expect(result.packageSummary.sectionCount).toBeGreaterThanOrEqual(1);
      expect(result.packageSummary.unsupportedCompressionMethods).toEqual([]);
      expect(result.warnings.filter((item) => item.severity === "error")).toEqual(
        []
      );
      expect(result.lossReport.summary.errorCount).toBe(0);
      fixture.expectedText.forEach((text) => {
        expect(documentText(result)).toContain(text);
      });
    }
  );

  it("잘못된 package는 throw 대신 import warning과 빈 IRDocument로 정리한다", () => {
    const result = importHWPXToIR(new TextEncoder().encode("not a zip file"), {
      extractedAt: "2026-05-27T00:00:00.000Z"
    });

    expect(result.irDocument.sections[0].blocks).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "hwpx-import-package-error",
        severity: "error"
      })
    );
    expect(result.lossReport.summary.errorCount).toBeGreaterThan(0);
  });
});
