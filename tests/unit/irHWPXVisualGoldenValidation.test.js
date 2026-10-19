import { inflateRawSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HWPX_V0_WARNING_CONTRACT } from "../../app/LIB/ir/hwpxMinimalExport";
import expectations from "../fixtures/hwpx/visualGoldenExpectations.json";

const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures", "hwpx");
const REQUIRED_ENTRIES = [
  "mimetype",
  "version.xml",
  "META-INF/container.xml",
  "META-INF/container.rdf",
  "META-INF/manifest.xml",
  "Contents/content.hpf",
  "Contents/header.xml",
  "Contents/section0.xml",
  "Preview/PrvText.txt",
  "Scripts/headerScripts.js",
  "Scripts/sourceScripts.js",
  "settings.xml"
];
const ROUND_TRIP_ALLOWED_ADDED_ENTRIES = ["Preview/PrvImage.png"];
const ROUND_TRIP_ALLOWED_REMOVED_ENTRIES = [
  "Scripts/headerScripts.js",
  "Scripts/sourceScripts.js"
];
const WARNING_FIELDS = [
  "blockIndex",
  "blockType",
  "code",
  "message",
  "path",
  "sectionIndex",
  "severity"
];

const findEndOfCentralDirectory = (buffer) => {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("End of central directory not found");
};

const readZipEntries = (filePath) => {
  const buffer = readFileSync(filePath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = {};

  for (let index = 0; index < entryCount; index += 1) {
    const signature = buffer.readUInt32LE(centralOffset);

    if (signature !== 0x02014b50) {
      throw new Error(`Central directory signature mismatch at ${centralOffset}`);
    }

    const method = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);
    const fileName = buffer
      .subarray(centralOffset + 46, centralOffset + 46 + fileNameLength)
      .toString("utf8");
    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);
    const data =
      method === 0
        ? compressedData
        : method === 8
          ? inflateRawSync(compressedData)
          : null;

    if (!data) {
      throw new Error(`Unsupported ZIP compression method ${method}`);
    }

    entries[fileName] = data.toString("utf8");
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

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

const countTags = (xml, tagName) =>
  (xml.match(new RegExp(`<${tagName}(?:\\s|>|/)`, "g")) || []).length;

const countHeadingType = (xml, type) =>
  (xml.match(new RegExp(`<hh:heading type="${type}"`, "g")) || []).length;

const hasTagWithBorderFillRef = (xml, tagName, borderFillId) =>
  new RegExp(`<${tagName}[^>]*borderFillIDRef="${borderFillId}"`).test(xml);

const hasImageMediaRef = (sectionXml, imageId) =>
  new RegExp(`<hc:img[^>]*binaryItemIDRef="${imageId}"`).test(sectionXml);

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

const getNativeListCounts = (headerXml) => ({
  numberings: countTags(headerXml, "hh:numbering"),
  bullets: countTags(headerXml, "hh:bullet"),
  numberPara: countHeadingType(headerXml, "NUMBER"),
  bulletPara: countHeadingType(headerXml, "BULLET")
});

const getTagAttrs = (tagXml) =>
  Object.fromEntries(
    Array.from(tagXml.matchAll(/([A-Za-z_:]+)="([^"]*)"/g)).map((match) => [
      match[1],
      match[2]
    ])
  );

const getTableGeometry = (sectionXml) => {
  const tableTag = sectionXml.match(/<hp:tbl\b[^>]*>/)?.[0] ?? "";
  const sizeTag = sectionXml.match(/<hp:sz\b[^>]*>/)?.[0] ?? "";
  const cells = Array.from(
    sectionXml.matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)
  ).map((match) => match[0]);

  return {
    table: getTagAttrs(tableTag),
    size: getTagAttrs(sizeTag),
    cells: cells.map((cellXml) => ({
      addr: getTagAttrs(cellXml.match(/<hp:cellAddr\b[^>]*>/)?.[0] ?? ""),
      span: getTagAttrs(cellXml.match(/<hp:cellSpan\b[^>]*>/)?.[0] ?? ""),
      size: getTagAttrs(cellXml.match(/<hp:cellSz\b[^>]*>/)?.[0] ?? "")
    }))
  };
};

const rootName = (xml) => xml.match(/^<\?xml[^>]*>\s*<[^:>]+:([^\s>/]+)/)?.[1] ?? null;

describe("HWPX visual/golden validation fixtures", () => {
  it("generated fixtures preserve expected visible text and semantic structure", () => {
    expectations.forEach((fixture) => {
      const entries = readZipEntries(path.join(FIXTURE_DIR, fixture.fileName));
      const headerXml = entries["Contents/header.xml"];
      const contentHpf = entries["Contents/content.hpf"];
      const sectionXml = entries["Contents/section0.xml"];
      const visibleText = extractVisibleText(sectionXml);
      const warnings = JSON.parse(
        readFileSync(
          path.join(FIXTURE_DIR, `${fixture.fileName}.warnings.json`),
          "utf8"
        )
      );

      expect(Array.isArray(warnings)).toBe(true);
      warnings.forEach((warning) => {
        expect(Object.keys(warning).sort()).toEqual(WARNING_FIELDS);
        expect(HWPX_V0_WARNING_CONTRACT[warning.code]).toBeDefined();
        expect(warning.severity).toBe(
          HWPX_V0_WARNING_CONTRACT[warning.code].severity
        );
        expect(typeof warning.message).toBe("string");
        expect(typeof warning.path).toBe("string");
        expect(typeof warning.sectionIndex).toBe("number");
      });
      expect(Object.keys(entries)).toEqual(expect.arrayContaining(REQUIRED_ENTRIES));
      expect(entries.mimetype).toBe("application/hwp+zip");
      expect(sectionXml).not.toContain("dockit:");
      fixture.expectedText.forEach((text) => {
        expect(visibleText).toContain(text);
      });
      fixture.forbiddenText.forEach((text) => {
        expect(visibleText).not.toContain(text);
      });
      expect(countTags(sectionXml, "hp:tbl")).toBe(fixture.sectionCounts.table);
      expect(countTags(sectionXml, "hp:tc")).toBe(fixture.sectionCounts.cell);
      if (fixture.tableGeometry) {
        expect(getTableGeometry(sectionXml)).toMatchObject(fixture.tableGeometry);
      }
      expect(getNativeListCounts(headerXml)).toEqual(fixture.nativeListCounts);
      if (fixture.borderFillMapping) {
        expect(countTags(headerXml, "hh:borderFill")).toBe(
          fixture.borderFillMapping.count
        );
        expect(
          hasTagWithBorderFillRef(
            sectionXml,
            "hp:tbl",
            fixture.borderFillMapping.tableRef
          )
        ).toBe(true);
        expect(
          hasTagWithBorderFillRef(
            sectionXml,
            "hp:tc",
            fixture.borderFillMapping.cellRef
          )
        ).toBe(true);
        fixture.borderFillMapping.requiredSideXml.forEach((xml) => {
          expect(headerXml).toContain(xml);
        });
      }
      if (fixture.imageMedia) {
        expect(
          Object.prototype.hasOwnProperty.call(
            entries,
            fixture.imageMedia.binPath
          )
        ).toBe(true);
        expect(contentHpf).toContain(fixture.imageMedia.contentItem);
        expect(countTags(sectionXml, "hp:pic")).toBe(fixture.imageMedia.picCount);
        expect(hasImageMediaRef(sectionXml, fixture.imageMedia.id)).toBe(true);
      }
      if (fixture.hyperlinkTargets) {
        expect(getHyperlinkTargets(sectionXml)).toEqual(fixture.hyperlinkTargets);
      }
      expect(warnings.map((warning) => warning.code)).toEqual(
        fixture.warningCodes
      );
    });
  });

  it("Hancom round-trip fixtures keep text and table semantics while allowing known package normalization", () => {
    expectations.forEach((fixture) => {
      const originalPath = path.join(FIXTURE_DIR, fixture.fileName);
      const roundTripPath = path.join(
        FIXTURE_DIR,
        "roundtrip",
        fixture.fileName.replace(".hwpx", ".roundtrip.hwpx")
      );

      expect(existsSync(roundTripPath)).toBe(true);

      const original = readZipEntries(originalPath);
      const roundTrip = readZipEntries(roundTripPath);
      const originalHeader = original["Contents/header.xml"];
      const roundTripHeader = roundTrip["Contents/header.xml"];
      const originalSection = original["Contents/section0.xml"];
      const roundTripSection = roundTrip["Contents/section0.xml"];
      const addedEntries = Object.keys(roundTrip).filter(
        (entry) => !Object.prototype.hasOwnProperty.call(original, entry)
      );
      const removedEntries = Object.keys(original).filter(
        (entry) => !Object.prototype.hasOwnProperty.call(roundTrip, entry)
      );
      const allowedAddedEntries = [
        ...ROUND_TRIP_ALLOWED_ADDED_ENTRIES,
        ...(fixture.imageMedia?.roundTripBinPath
          ? [fixture.imageMedia.roundTripBinPath]
          : [])
      ];
      const allowedRemovedEntries = fixture.imageMedia?.roundTripBinPath
        ? [...ROUND_TRIP_ALLOWED_REMOVED_ENTRIES, fixture.imageMedia.binPath]
        : ROUND_TRIP_ALLOWED_REMOVED_ENTRIES;

      fixture.expectedText.forEach((text) => {
        expect(extractVisibleText(roundTripSection)).toContain(text);
      });
      fixture.forbiddenText.forEach((text) => {
        expect(extractVisibleText(roundTripSection)).not.toContain(text);
      });
      expect(countTags(roundTripSection, "hp:tbl")).toBe(
        countTags(originalSection, "hp:tbl")
      );
      expect(countTags(roundTripSection, "hp:tc")).toBe(
        countTags(originalSection, "hp:tc")
      );
      if (fixture.tableGeometry) {
        expect(getTableGeometry(roundTripSection)).toMatchObject(
          fixture.tableGeometry
        );
      }
      expect(getNativeListCounts(roundTripHeader)).toEqual(
        getNativeListCounts(originalHeader)
      );
      if (fixture.borderFillMapping) {
        expect(countTags(roundTripHeader, "hh:borderFill")).toBe(
          fixture.borderFillMapping.count
        );
        expect(
          hasTagWithBorderFillRef(
            roundTripSection,
            "hp:tbl",
            fixture.borderFillMapping.tableRef
          )
        ).toBe(true);
        expect(
          hasTagWithBorderFillRef(
            roundTripSection,
            "hp:tc",
            fixture.borderFillMapping.cellRef
          )
        ).toBe(true);
        fixture.borderFillMapping.requiredSideXml.forEach((xml) => {
          expect(roundTripHeader).toContain(xml);
        });
      }
      if (fixture.imageMedia) {
        const roundTripBinPath =
          fixture.imageMedia.roundTripBinPath ?? fixture.imageMedia.binPath;
        const roundTripContentItem =
          fixture.imageMedia.roundTripContentItem ??
          fixture.imageMedia.contentItem;

        expect(
          Object.prototype.hasOwnProperty.call(
            roundTrip,
            roundTripBinPath
          )
        ).toBe(true);
        expect(roundTrip["Contents/content.hpf"]).toContain(roundTripContentItem);
        expect(countTags(roundTripSection, "hp:pic")).toBe(
          fixture.imageMedia.picCount
        );
        expect(hasImageMediaRef(roundTripSection, fixture.imageMedia.id)).toBe(
          true
        );
      }
      if (fixture.hyperlinkTargets) {
        expect(getHyperlinkTargets(roundTripSection)).toEqual(
          fixture.hyperlinkTargets
        );
      }
      expect(
        removedEntries.every((entry) => allowedRemovedEntries.includes(entry))
      ).toBe(true);
      expect(
        addedEntries.every((entry) => allowedAddedEntries.includes(entry))
      ).toBe(true);
      expect(rootName(roundTrip["version.xml"])).toBe("HCFVersion");
      expect(rootName(roundTrip["Contents/content.hpf"])).toBe("package");
      expect(rootName(roundTrip["Contents/header.xml"])).toBe("head");
      expect(rootName(roundTrip["Contents/section0.xml"])).toBe("sec");
    });
  });
});
