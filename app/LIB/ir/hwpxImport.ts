import type {
  IRBlock,
  IRDocument,
  IRHardBreak,
  IRHeadingBlock,
  IRInlineNode,
  IRListBlock,
  IRListItem,
  IRMark,
  IRNoteBody,
  IRNoteKind,
  IRObjectBlock,
  IRPageSettings,
  IRParagraphBlock,
  IRSection,
  IRTableBlock,
  IRTableCell,
  IRTableRow,
  IRTextRun
} from "./types";

export type HWPXImportWarningSeverity = "warning" | "error";

export type HWPXImportWarningCode =
  | "hwpx-import-package-error"
  | "hwpx-import-package-partial"
  | "hwpx-import-missing-entry"
  | "hwpx-import-unsupported-compression"
  | "hwpx-import-xml-warning"
  | "hwpx-import-xml-error"
  | "hwpx-import-xml-unknown"
  | "hwpx-import-style-loss"
  | "hwpx-import-style-partial"
  | "hwpx-import-list-partial"
  | "hwpx-import-table-partial"
  | "hwpx-import-table-style-partial"
  | "hwpx-import-link-metadata-loss"
  | "hwpx-import-control-unsupported"
  | "hwpx-import-reference-missing"
  | "hwpx-import-image-metadata-only"
  | "hwpx-import-image-metadata-loss"
  | "hwpx-import-structure-clamped"
  | "hwpx-import-unsupported-structure"
  | "hwpx-import-note-structure-invalid"
  | "hwpx-import-note-pair-invalid"
  | "hwpx-import-note-numbering-unsupported"
  | "hwpx-import-note-content-unsupported"
  | "hwpx-import-note-hyperlink-unsupported";

export interface HWPXImportWarning {
  code: HWPXImportWarningCode;
  severity: HWPXImportWarningSeverity;
  message: string;
  entry?: string;
  path?: string;
}

export type HWPXImportLossCategory =
  | "package"
  | "xml"
  | "style"
  | "list"
  | "table"
  | "link"
  | "image"
  | "unsupported";

export interface HWPXImportLossReportEntry {
  category: HWPXImportLossCategory;
  code: HWPXImportWarningCode;
  severity: HWPXImportWarningSeverity;
  message: string;
  entry?: string;
  path?: string;
  count?: number;
}

export interface HWPXImportLossReportSummary {
  total: number;
  warningCount: number;
  errorCount: number;
  styleLossCount: number;
  listPartialCount: number;
  tablePartialCount: number;
  imageMetadataOnlyCount: number;
  unsupportedCount: number;
}

export interface HWPXImportLossReport {
  entries: readonly Readonly<HWPXImportLossReportEntry>[];
  summary: Readonly<HWPXImportLossReportSummary>;
}

export interface HWPXImportIntakeCountSummary {
  name: string;
  count: number;
  entries: readonly string[];
}

export interface HWPXImportIntakeReport {
  package: Readonly<{
    entryCount: number;
    requiredEntries: Readonly<HWPXPackageRequiredEntries>;
    sectionCount: number;
    contentFiles: readonly string[];
    binData: Readonly<{
      entryCount: number;
      entries: readonly string[];
      contentItemCount: number;
      mediaTypes: Readonly<Record<string, number>>;
    }>;
    unknownTopLevelEntries: readonly string[];
  }>;
  headerModel: Readonly<{
    fontFaceCount: number;
    charPrCount: number;
    paraPrCount: number;
    borderFillCount: number;
    numberingCount: number;
    bulletCount: number;
  }>;
  references: Readonly<{
    missingContentItemEntries: readonly string[];
  }>;
  parseErrors: Readonly<{
    warningCount: number;
    errorCount: number;
    byCode: Readonly<Record<string, number>>;
    entries: readonly string[];
  }>;
  xml: Readonly<{
    unknownTags: Readonly<{
      total: number;
      top: readonly Readonly<HWPXImportIntakeCountSummary>[];
    }>;
    unsupportedControls: Readonly<{
      total: number;
      top: readonly Readonly<HWPXImportIntakeCountSummary>[];
    }>;
  }>;
}

export interface HWPXPackageEntry {
  path: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  bytes: Uint8Array;
  text: string | null;
}

export interface HWPXPackageRequiredEntries {
  mimetype: boolean;
  contentHpf: boolean;
  headerXml: boolean;
  section0Xml: boolean;
}

export interface HWPXPackageSummary {
  entryCount: number;
  entries: readonly string[];
  mimetype: string | null;
  requiredEntries: Readonly<HWPXPackageRequiredEntries>;
  sectionCount: number;
  sectionEntries: readonly string[];
  unsupportedCompressionMethods: readonly Readonly<{
    path: string;
    method: number;
  }>[];
}

export interface HWPXPackageReadResult {
  entries: readonly Readonly<HWPXPackageEntry>[];
  entryMap: ReadonlyMap<string, Readonly<HWPXPackageEntry>>;
  packageSummary: Readonly<HWPXPackageSummary>;
  warnings: readonly Readonly<HWPXImportWarning>[];
}

export interface HWPXXmlNode {
  name: string;
  attrs: Readonly<Record<string, string>>;
  children: readonly Readonly<HWPXXmlNode>[];
  text: string;
}

export interface HWPXXmlParseResult {
  root: Readonly<HWPXXmlNode>;
  warnings: readonly string[];
}

export interface HWPXImportOptions {
  sourceName?: string;
  inflateRaw?: (bytes: Uint8Array, entryPath: string) => Uint8Array;
  extractedAt?: string;
}

export interface HWPXImportResult {
  irDocument: Readonly<IRDocument>;
  warnings: readonly Readonly<HWPXImportWarning>[];
  lossReport: Readonly<HWPXImportLossReport>;
  packageSummary: Readonly<HWPXPackageSummary>;
  intakeReport: Readonly<HWPXImportIntakeReport>;
}

interface ImportContext {
  warnings: HWPXImportWarning[];
  losses: HWPXImportLossReportEntry[];
  lossKeys: Set<string>;
  contentItems: ReadonlyMap<string, Readonly<HWPXContentItem>>;
  headerModel: Readonly<HWPXHeaderModel>;
  noteReferences: { noteId: string; kind: IRNoteKind; instId: number }[];
  noteBodies: (IRNoteBody & { instId: number; displayNumber: number })[];
  noteDisplayCounters: Record<IRNoteKind, number>;
}

interface HWPXContentItem {
  id: string;
  href: string | null;
  mediaType: string | null;
  isEmbedded: boolean;
}

interface HWPXNumberingDefinition {
  id: number;
  startNumber: number;
  level: number;
  numFormat: string | null;
  markerText: string;
}

interface HWPXBulletDefinition {
  id: number;
  char: string | null;
  checkedChar: string | null;
  checkable: boolean;
  useImage: boolean;
}

interface HWPXParaPrDefinition {
  id: number;
  headingType: string;
  idRef: number | null;
  level: number;
  listType: IRListBlock["listType"] | null;
  textAlign: string | null;
  lineHeight: string | null;
  indent: string | null;
  spacingBeforeTwips: number | null;
  spacingAfterTwips: number | null;
  spacingLineTwips: number | null;
  spacingLineRule: "auto" | null;
  unsupported: readonly string[];
}

interface HWPXCharPrDefinition {
  id: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  fontFamily: string | null;
  fontSizePt: number | null;
  color: string | null;
  backgroundColor: string | null;
  verticalAlign: "subscript" | "superscript" | null;
  codeLike: boolean;
  unsupported: readonly string[];
}

interface HWPXHeaderModel {
  fontFaceCount: number;
  paraPrById: ReadonlyMap<number, Readonly<HWPXParaPrDefinition>>;
  charPrById: ReadonlyMap<number, Readonly<HWPXCharPrDefinition>>;
  borderFillById: ReadonlyMap<number, Readonly<HWPXBorderFillDefinition>>;
  numberingsById: ReadonlyMap<number, Readonly<HWPXNumberingDefinition>>;
  bulletsById: ReadonlyMap<number, Readonly<HWPXBulletDefinition>>;
}

type HWPXTableBorderSide = "top" | "right" | "bottom" | "left";

interface HWPXBorderLineDefinition {
  side: HWPXTableBorderSide;
  style: string | null;
  width: string | null;
  color: string | null;
  unsupported: readonly string[];
}

interface HWPXBorderFillDefinition {
  id: number;
  sides: Readonly<Record<HWPXTableBorderSide, Readonly<HWPXBorderLineDefinition>>>;
  backgroundColor: string | null;
  unsupported: readonly string[];
}

interface HWPXListParagraphInfo {
  listType: IRListBlock["listType"];
  paraPrId: number;
  idRef: number | null;
  level: number;
  startNumber: number | null;
  markerFormat: "decimal" | "bullet" | "unknown";
  bulletChar: string | null;
  unsupported: readonly string[];
}

const decoder = new TextDecoder();
const HWPX_MIMETYPE = "application/hwp+zip";
const HWPUNIT_PER_MM = 283.465;
const MAX_IMPORT_IMAGE_BYTES = 5 * 1024 * 1024;
const INTAKE_SUMMARY_LIMIT = 10;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const KNOWN_PACKAGE_TOP_LEVEL_ENTRIES = Object.freeze(
  new Set([
    "mimetype",
    "version.xml",
    "settings.xml",
    "META-INF",
    "Contents",
    "Preview",
    "Scripts",
    "BinData"
  ])
);
const KNOWN_HWPX_XML_TAGS = Object.freeze(
  new Set([
    "CaretPosition",
    "HCFVersion",
    "HWPApplicationSetting",
    "RDF",
    "align",
    "autoNum",
    "autoNumFormat",
    "autoSpacing",
    "backSlash",
    "beginNum",
    "border",
    "borderFill",
    "borderFills",
    "bottomBorder",
    "breakSetting",
    "bullet",
    "bullets",
    "cellAddr",
    "cellMargin",
    "cellSpan",
    "cellSz",
    "charPr",
    "charProperties",
    "compatibleDocument",
    "container",
    "ctrl",
    "curSz",
    "diagonal",
    "docOption",
    "effects",
    "endNote",
    "endNotePr",
    "fieldBegin",
    "fieldEnd",
    "file-entry",
    "flip",
    "font",
    "fontRef",
    "fontface",
    "fontfaces",
    "footNote",
    "footNotePr",
    "grid",
    "head",
    "heading",
    "img",
    "imgClip",
    "imgDim",
    "imgRect",
    "inMargin",
    "integerParam",
    "intent",
    "item",
    "itemref",
    "language",
    "layoutCompatibility",
    "left",
    "leftBorder",
    "lineNumberShape",
    "lineBreak",
    "lineSpacing",
    "lineseg",
    "linesegarray",
    "linkinfo",
    "manifest",
    "margin",
    "memoPr",
    "memoProperties",
    "meta",
    "metadata",
    "next",
    "noteLine",
    "noteSpacing",
    "numbering",
    "numberings",
    "offset",
    "orgSz",
    "outMargin",
    "outline",
    "p",
    "package",
    "pageBorderFill",
    "pagePr",
    "paraHead",
    "paraPr",
    "paraProperties",
    "parameters",
    "pic",
    "placement",
    "pos",
    "prev",
    "pt0",
    "pt1",
    "pt2",
    "pt3",
    "ratio",
    "refList",
    "relSz",
    "renderingInfo",
    "right",
    "rightBorder",
    "rootfile",
    "rootfiles",
    "rotMatrix",
    "rotationInfo",
    "run",
    "scaMatrix",
    "sec",
    "secPr",
    "shadow",
    "shapeComment",
    "slash",
    "spacing",
    "spine",
    "startNum",
    "strikeout",
    "stringParam",
    "style",
    "styles",
    "subList",
    "subscript",
    "supscript",
    "sz",
    "t",
    "tabPr",
    "tabProperties",
    "tbl",
    "tc",
    "title",
    "topBorder",
    "tr",
    "transMatrix",
    "typeInfo",
    "underline",
    "visibility"
  ])
);
const SUPPORTED_RUN_CONTROL_TAGS = Object.freeze(
  new Set(["autoNum", "endNote", "fieldBegin", "fieldEnd", "footNote"])
);

const DEFAULT_PAGE_SETTINGS: IRPageSettings = {
  widthMm: 210,
  heightMm: 297,
  paddingTopMm: 20,
  paddingBottomMm: 20,
  paddingLeftMm: 25,
  paddingRightMm: 25,
  lineHeight: 1.6
};

const EMPTY_HEADER_MODEL: HWPXHeaderModel = Object.freeze({
  fontFaceCount: 0,
  paraPrById: new Map(),
  charPrById: new Map(),
  borderFillById: new Map(),
  numberingsById: new Map(),
  bulletsById: new Map()
});

const EMPTY_PACKAGE_SUMMARY: HWPXPackageSummary = Object.freeze({
  entryCount: 0,
  entries: Object.freeze([]),
  mimetype: null,
  requiredEntries: Object.freeze({
    mimetype: false,
    contentHpf: false,
    headerXml: false,
    section0Xml: false
  }),
  sectionCount: 0,
  sectionEntries: Object.freeze([]),
  unsupportedCompressionMethods: Object.freeze([])
});

const freezeArray = <T>(items: readonly T[]) => Object.freeze([...items]);
const mutableArray = <T>(items: readonly T[]) => [...items];

const warning = (
  code: HWPXImportWarningCode,
  severity: HWPXImportWarningSeverity,
  message: string,
  details: Pick<HWPXImportWarning, "entry" | "path"> = {}
): HWPXImportWarning =>
  Object.freeze({
    code,
    severity,
    message,
    ...details
  });

const pushLoss = (
  context: ImportContext,
  loss: HWPXImportLossReportEntry
) => {
  const key = [
    loss.category,
    loss.code,
    loss.entry ?? "",
    loss.path ?? "",
    loss.message
  ].join("|");

  if (context.lossKeys.has(key)) {
    return;
  }

  context.lossKeys.add(key);
  context.losses.push(Object.freeze(loss));
  context.warnings.push(
    warning(loss.code, loss.severity, loss.message, {
      entry: loss.entry,
      path: loss.path
    })
  );
};

const isXmlEntryPath = (path: string) =>
  path.endsWith(".xml") || path.endsWith(".hpf") || path.endsWith(".rdf");

const getUint16 = (view: DataView, offset: number) =>
  view.getUint16(offset, true);

const getUint32 = (view: DataView, offset: number) =>
  view.getUint32(offset, true);

const findEndOfCentralDirectory = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.length - 66000);

  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (getUint32(view, offset) === ZIP_EOCD_SIGNATURE) {
      return offset;
    }
  }

  return -1;
};

const buildPackageSummary = (
  entries: readonly Readonly<HWPXPackageEntry>[],
  unsupportedCompressionMethods: readonly Readonly<{ path: string; method: number }>[]
): Readonly<HWPXPackageSummary> => {
  const paths = entries.map((entry) => entry.path);
  const sectionEntries = paths
    .filter((path) => /^Contents\/section\d+\.xml$/.test(path))
    .sort((left, right) => {
      const leftIndex = Number(left.match(/section(\d+)\.xml$/)?.[1] ?? 0);
      const rightIndex = Number(right.match(/section(\d+)\.xml$/)?.[1] ?? 0);
      return leftIndex - rightIndex;
    });
  const entryMap = new Map(entries.map((entry) => [entry.path, entry]));
  const mimetype = entryMap.get("mimetype")?.text?.trim() ?? null;

  return Object.freeze({
    entryCount: entries.length,
    entries: freezeArray(paths),
    mimetype,
    requiredEntries: Object.freeze({
      mimetype: entryMap.has("mimetype"),
      contentHpf: entryMap.has("Contents/content.hpf"),
      headerXml: entryMap.has("Contents/header.xml"),
      section0Xml: entryMap.has("Contents/section0.xml")
    }),
    sectionCount: sectionEntries.length,
    sectionEntries: freezeArray(sectionEntries),
    unsupportedCompressionMethods: freezeArray(unsupportedCompressionMethods)
  });
};

export const readHWPXPackageFromBytes = (
  packageBytes: Uint8Array,
  options: HWPXImportOptions = {}
): Readonly<HWPXPackageReadResult> => {
  const warnings: HWPXImportWarning[] = [];
  const entries: HWPXPackageEntry[] = [];
  const unsupportedCompressionMethods: { path: string; method: number }[] = [];

  if (!packageBytes.length) {
    return Object.freeze({
      entries: freezeArray(entries),
      entryMap: new Map(),
      packageSummary: EMPTY_PACKAGE_SUMMARY,
      warnings: freezeArray([
        warning(
          "hwpx-import-package-error",
          "error",
          "HWPX package is empty."
        )
      ])
    });
  }

  const view = new DataView(
    packageBytes.buffer,
    packageBytes.byteOffset,
    packageBytes.byteLength
  );
  const eocdOffset = findEndOfCentralDirectory(packageBytes);

  if (eocdOffset < 0) {
    return Object.freeze({
      entries: freezeArray(entries),
      entryMap: new Map(),
      packageSummary: EMPTY_PACKAGE_SUMMARY,
      warnings: freezeArray([
        warning(
          "hwpx-import-package-error",
          "error",
          "ZIP end of central directory was not found."
        )
      ])
    });
  }

  const entryCount = getUint16(view, eocdOffset + 10);
  let centralOffset = getUint32(view, eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (
      centralOffset + 46 > packageBytes.length ||
      getUint32(view, centralOffset) !== ZIP_CENTRAL_SIGNATURE
    ) {
      warnings.push(
        warning(
          "hwpx-import-package-error",
          "error",
          `Central directory entry ${index} is invalid.`
        )
      );
      break;
    }

    const compressionMethod = getUint16(view, centralOffset + 10);
    const compressedSize = getUint32(view, centralOffset + 20);
    const uncompressedSize = getUint32(view, centralOffset + 24);
    const nameLength = getUint16(view, centralOffset + 28);
    const extraLength = getUint16(view, centralOffset + 30);
    const commentLength = getUint16(view, centralOffset + 32);
    const localOffset = getUint32(view, centralOffset + 42);
    const path = decoder.decode(
      packageBytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength)
    );

    if (
      localOffset + 30 > packageBytes.length ||
      getUint32(view, localOffset) !== ZIP_LOCAL_SIGNATURE
    ) {
      warnings.push(
        warning(
          "hwpx-import-package-error",
          "error",
          `Local header is missing for ${path}.`,
          { entry: path }
        )
      );
      centralOffset += 46 + nameLength + extraLength + commentLength;
      continue;
    }

    const localNameLength = getUint16(view, localOffset + 26);
    const localExtraLength = getUint16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    let bytes =
      dataEnd <= packageBytes.length
        ? packageBytes.subarray(dataStart, dataEnd)
        : new Uint8Array();

    if (dataEnd > packageBytes.length) {
      warnings.push(
        warning(
          "hwpx-import-package-error",
          "error",
          `Compressed data is truncated for ${path}.`,
          { entry: path }
        )
      );
    } else if (compressionMethod === 8) {
      if (options.inflateRaw) {
        try {
          bytes = options.inflateRaw(bytes, path);
        } catch (error) {
          warnings.push(
            warning(
              "hwpx-import-package-error",
              "error",
              `Deflate entry could not be inflated: ${
                error instanceof Error ? error.message : String(error)
              }`,
              { entry: path }
            )
          );
          bytes = new Uint8Array();
        }
      } else {
        unsupportedCompressionMethods.push({
          path,
          method: compressionMethod
        });
        warnings.push(
          warning(
            "hwpx-import-unsupported-compression",
            "warning",
            "Deflate-compressed ZIP entry requires an inflateRaw callback.",
            { entry: path }
          )
        );
        bytes = new Uint8Array();
      }
    } else if (compressionMethod !== 0) {
      unsupportedCompressionMethods.push({
        path,
        method: compressionMethod
      });
      warnings.push(
        warning(
          "hwpx-import-unsupported-compression",
          "warning",
          `ZIP compression method ${compressionMethod} is not supported.`,
          { entry: path }
        )
      );
      bytes = new Uint8Array();
    }

    entries.push(
      Object.freeze({
        path,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        bytes,
        text:
          bytes.length && (isXmlEntryPath(path) || path === "mimetype")
            ? decoder.decode(bytes)
            : null
      })
    );

    centralOffset += 46 + nameLength + extraLength + commentLength;
  }

  const packageSummary = buildPackageSummary(
    entries,
    unsupportedCompressionMethods
  );
  const entryMap = new Map(entries.map((entry) => [entry.path, entry]));

  if (packageSummary.mimetype !== HWPX_MIMETYPE) {
    warnings.push(
      warning(
        "hwpx-import-package-error",
        packageSummary.mimetype ? "warning" : "error",
        packageSummary.mimetype
          ? `Unexpected mimetype '${packageSummary.mimetype}'.`
          : "HWPX mimetype entry is missing or empty.",
        { entry: "mimetype" }
      )
    );
  }

  Object.entries(packageSummary.requiredEntries).forEach(([key, present]) => {
    if (!present) {
      warnings.push(
        warning(
          "hwpx-import-missing-entry",
          "error",
          `Required HWPX package entry is missing: ${key}.`
        )
      );
    }
  });

  return Object.freeze({
    entries: freezeArray(entries),
    entryMap,
    packageSummary,
    warnings: freezeArray(warnings)
  });
};

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replace(/&amp;/g, "&");

const parseAttrs = (source: string) => {
  const attrs: Record<string, string> = {};
  const attrPattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(source))) {
    attrs[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? "");
  }

  return attrs;
};

const createXmlNode = (
  name: string,
  attrs: Record<string, string> = {}
): HWPXXmlNode & { children: HWPXXmlNode[] } => ({
  name,
  attrs,
  children: [],
  text: ""
});

export const parseHWPXXml = (xml: string): Readonly<HWPXXmlParseResult> => {
  const warnings: string[] = [];
  const documentRoot = createXmlNode("#document");
  const stack: (HWPXXmlNode & { children: HWPXXmlNode[] })[] = [documentRoot];
  const tokenPattern = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(xml))) {
    const token = match[0];
    const current = stack[stack.length - 1];

    if (token.startsWith("<!--") || token.startsWith("<?")) {
      continue;
    }

    if (token.startsWith("<![CDATA[")) {
      current.text += token.slice(9, -3);
      continue;
    }

    if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim();
      const node = stack.pop();

      if (!node || node.name !== name) {
        warnings.push(`XML closing tag mismatch: ${name}.`);
        if (node) {
          stack.push(node);
        }
      }
      continue;
    }

    if (token.startsWith("<!")) {
      continue;
    }

    if (token.startsWith("<")) {
      const inner = token.slice(1, -1).trim();
      const selfClosing = inner.endsWith("/");
      const normalizedInner = selfClosing ? inner.slice(0, -1).trim() : inner;
      const spaceIndex = normalizedInner.search(/\s/);
      const name =
        spaceIndex < 0 ? normalizedInner : normalizedInner.slice(0, spaceIndex);
      const attrSource =
        spaceIndex < 0 ? "" : normalizedInner.slice(spaceIndex + 1);
      const node = createXmlNode(name, parseAttrs(attrSource));

      current.children.push(node);

      if (!selfClosing) {
        stack.push(node);
      }
      continue;
    }

    current.text += decodeXmlEntities(token);
  }

  if (stack.length > 1) {
    warnings.push(
      `XML parse ended with ${stack.length - 1} unclosed element(s).`
    );
  }

  return Object.freeze({
    root: Object.freeze(documentRoot),
    warnings: freezeArray(warnings)
  });
};

const localName = (name: string) => {
  const index = name.indexOf(":");

  return index >= 0 ? name.slice(index + 1) : name;
};

const isNodeNamed = (node: Readonly<HWPXXmlNode>, name: string) =>
  localName(node.name) === name;

const childrenNamed = (node: Readonly<HWPXXmlNode>, name: string) =>
  node.children.filter((child) => isNodeNamed(child, name));

const firstChildNamed = (node: Readonly<HWPXXmlNode>, name: string) =>
  childrenNamed(node, name)[0] ?? null;

const descendantsNamed = (
  node: Readonly<HWPXXmlNode>,
  name: string
): Readonly<HWPXXmlNode>[] => {
  const matches: Readonly<HWPXXmlNode>[] = [];

  node.children.forEach((child) => {
    if (isNodeNamed(child, name)) {
      matches.push(child);
    }

    matches.push(...descendantsNamed(child, name));
  });

  return matches;
};

const firstDescendantNamed = (node: Readonly<HWPXXmlNode>, name: string) =>
  descendantsNamed(node, name)[0] ?? null;

const textContent = (node: Readonly<HWPXXmlNode>): string =>
  `${node.text}${node.children.map(textContent).join("")}`;

const numberAttr = (
  node: Readonly<HWPXXmlNode> | null,
  name: string,
  fallback: number | null = null
) => {
  if (!node) {
    return fallback;
  }

  const value = Number(node.attrs[name]);

  return Number.isFinite(value) ? value : fallback;
};

const hwpUnitToMm = (value: number | null, fallback: number) =>
  value === null ? fallback : Math.round((value / HWPUNIT_PER_MM) * 100) / 100;

const hwpUnitToDocxTwips = (value: number | null) => {
  if (value === null || value <= 0) {
    return null;
  }

  return Math.round(value / 5);
};

const hwpxPercentLineSpacingToDocxTwips = (value: string | undefined) => {
  const percent = Number(value);

  if (!Number.isFinite(percent) || percent <= 0 || percent === 160) {
    return null;
  }

  return Math.round((percent / 100) * 240);
};

const parseXmlEntry = (
  entry: Readonly<HWPXPackageEntry>,
  contextWarnings: HWPXImportWarning[]
) => {
  if (!entry.text) {
    contextWarnings.push(
      warning(
        "hwpx-import-xml-error",
        "error",
        "XML entry has no decoded text.",
        { entry: entry.path }
      )
    );
    return null;
  }

  const parsed = parseHWPXXml(entry.text);

  parsed.warnings.forEach((message) => {
    contextWarnings.push(
      warning("hwpx-import-xml-warning", "warning", message, {
        entry: entry.path
      })
    );
  });

  return parsed.root;
};

const parseContentItems = (
  contentHpf: Readonly<HWPXXmlNode> | null
): ReadonlyMap<string, Readonly<HWPXContentItem>> => {
  if (!contentHpf) {
    return new Map();
  }

  const items = descendantsNamed(contentHpf, "item")
    .map((item) => {
      const id = item.attrs.id;

      if (!id) {
        return null;
      }

      return Object.freeze({
        id,
        href: item.attrs.href ?? null,
        mediaType: item.attrs["media-type"] ?? null,
        isEmbedded: item.attrs.isEmbeded === "1" || item.attrs.isEmbedded === "1"
      });
    })
    .filter((item): item is Readonly<HWPXContentItem> => Boolean(item));

  return new Map(items.map((item) => [item.id, item]));
};

type IntakeSummaryBucket = {
  count: number;
  entries: Set<string>;
};

interface HWPXIntakeObservation {
  unknownTopLevelEntries: readonly string[];
  missingContentItemEntries: readonly string[];
  unknownXmlTags: readonly Readonly<HWPXImportIntakeCountSummary>[];
  unknownXmlTagTotal: number;
  unsupportedControls: readonly Readonly<HWPXImportIntakeCountSummary>[];
  unsupportedControlTotal: number;
}

const topLevelPackageEntry = (entryPath: string) =>
  entryPath.includes("/") ? entryPath.slice(0, entryPath.indexOf("/")) : entryPath;

const createSummaryMap = () => new Map<string, IntakeSummaryBucket>();

const incrementSummary = (
  summary: Map<string, IntakeSummaryBucket>,
  name: string,
  entry: string
) => {
  const existing = summary.get(name) ?? {
    count: 0,
    entries: new Set<string>()
  };

  existing.count += 1;
  existing.entries.add(entry);
  summary.set(name, existing);
};

const toTopSummary = (
  summary: ReadonlyMap<string, IntakeSummaryBucket>
): readonly Readonly<HWPXImportIntakeCountSummary>[] =>
  freezeArray(
    Array.from(summary.entries())
      .map(([name, item]) =>
        Object.freeze({
          name,
          count: item.count,
          entries: freezeArray(
            Array.from(item.entries)
              .sort((left, right) => left.localeCompare(right))
              .slice(0, INTAKE_SUMMARY_LIMIT)
          )
        } satisfies HWPXImportIntakeCountSummary)
      )
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
      .slice(0, INTAKE_SUMMARY_LIMIT)
  );

const sumSummaryCount = (summary: ReadonlyMap<string, IntakeSummaryBucket>) =>
  Array.from(summary.values()).reduce((total, item) => total + item.count, 0);

const collectUnknownXmlTags = (
  node: Readonly<HWPXXmlNode>,
  entry: string,
  unknownTags: Map<string, IntakeSummaryBucket>,
  unsupportedControls: Map<string, IntakeSummaryBucket>
) => {
  const name = localName(node.name);

  if (name !== "#document" && !KNOWN_HWPX_XML_TAGS.has(name)) {
    incrementSummary(unknownTags, name, entry);
  }

  if (name === "ctrl") {
    node.children.forEach((child) => {
      const controlName = localName(child.name);

      if (!SUPPORTED_RUN_CONTROL_TAGS.has(controlName)) {
        incrementSummary(unsupportedControls, controlName, entry);
      }
    });
  }

  node.children.forEach((child) =>
    collectUnknownXmlTags(child, entry, unknownTags, unsupportedControls)
  );
};

const createIntakeObservation = (
  packageResult: Readonly<HWPXPackageReadResult>,
  roots: readonly Readonly<{ entry: string; root: Readonly<HWPXXmlNode> | null }>[],
  contentItems: ReadonlyMap<string, Readonly<HWPXContentItem>>
): Readonly<HWPXIntakeObservation> => {
  const unknownTopLevelEntries = packageResult.packageSummary.entries
    .filter(
      (entryPath) =>
        !KNOWN_PACKAGE_TOP_LEVEL_ENTRIES.has(topLevelPackageEntry(entryPath))
    )
    .sort((left, right) => left.localeCompare(right));
  const missingContentItemEntries = Array.from(contentItems.values())
    .map((item) => item.href)
    .filter(
      (href): href is string =>
        Boolean(href) && !packageResult.entryMap.has(href)
    )
    .sort((left, right) => left.localeCompare(right));
  const unknownXmlTags = createSummaryMap();
  const unsupportedControls = createSummaryMap();

  roots.forEach(({ entry, root }) => {
    if (root) {
      collectUnknownXmlTags(root, entry, unknownXmlTags, unsupportedControls);
    }
  });

  return Object.freeze({
    unknownTopLevelEntries: freezeArray(unknownTopLevelEntries),
    missingContentItemEntries: freezeArray(missingContentItemEntries),
    unknownXmlTags: toTopSummary(unknownXmlTags),
    unknownXmlTagTotal: sumSummaryCount(unknownXmlTags),
    unsupportedControls: toTopSummary(unsupportedControls),
    unsupportedControlTotal: sumSummaryCount(unsupportedControls)
  });
};

const countByCode = (
  warnings: readonly Readonly<HWPXImportWarning>[]
): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {};

  warnings.forEach((item) => {
    counts[item.code] = (counts[item.code] ?? 0) + 1;
  });

  return Object.freeze(counts);
};

const countContentItemMediaTypes = (
  contentItems: ReadonlyMap<string, Readonly<HWPXContentItem>>
): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {};

  contentItems.forEach((item) => {
    if (item.mediaType) {
      counts[item.mediaType] = (counts[item.mediaType] ?? 0) + 1;
    }
  });

  return Object.freeze(counts);
};

const buildIntakeReport = (
  packageResult: Readonly<HWPXPackageReadResult>,
  contentItems: ReadonlyMap<string, Readonly<HWPXContentItem>>,
  headerModel: Readonly<HWPXHeaderModel>,
  observation: Readonly<HWPXIntakeObservation>,
  warnings: readonly Readonly<HWPXImportWarning>[]
): Readonly<HWPXImportIntakeReport> => {
  const contentFiles = packageResult.packageSummary.entries.filter(
    (entryPath) =>
      entryPath.startsWith("Contents/") &&
      (entryPath.endsWith(".xml") || entryPath.endsWith(".hpf"))
  );
  const binDataEntries = packageResult.packageSummary.entries.filter((entryPath) =>
    entryPath.startsWith("BinData/")
  );
  const warningEntries = warnings
    .map((item) => item.entry)
    .filter((entry): entry is string => Boolean(entry));

  return Object.freeze({
    package: Object.freeze({
      entryCount: packageResult.packageSummary.entryCount,
      requiredEntries: packageResult.packageSummary.requiredEntries,
      sectionCount: packageResult.packageSummary.sectionCount,
      contentFiles: freezeArray(contentFiles),
      binData: Object.freeze({
        entryCount: binDataEntries.length,
        entries: freezeArray(binDataEntries.slice(0, INTAKE_SUMMARY_LIMIT)),
        contentItemCount: Array.from(contentItems.values()).filter((item) =>
          item.href?.startsWith("BinData/")
        ).length,
        mediaTypes: countContentItemMediaTypes(contentItems)
      }),
      unknownTopLevelEntries: observation.unknownTopLevelEntries
    }),
    headerModel: Object.freeze({
      fontFaceCount: headerModel.fontFaceCount,
      charPrCount: headerModel.charPrById.size,
      paraPrCount: headerModel.paraPrById.size,
      borderFillCount: headerModel.borderFillById.size,
      numberingCount: headerModel.numberingsById.size,
      bulletCount: headerModel.bulletsById.size
    }),
    references: Object.freeze({
      missingContentItemEntries: observation.missingContentItemEntries
    }),
    parseErrors: Object.freeze({
      warningCount: warnings.filter((item) => item.severity === "warning").length,
      errorCount: warnings.filter((item) => item.severity === "error").length,
      byCode: countByCode(warnings),
      entries: freezeArray(
        Array.from(new Set(warningEntries))
          .sort((left, right) => left.localeCompare(right))
          .slice(0, INTAKE_SUMMARY_LIMIT)
      )
    }),
    xml: Object.freeze({
      unknownTags: Object.freeze({
        total: observation.unknownXmlTagTotal,
        top: observation.unknownXmlTags
      }),
      unsupportedControls: Object.freeze({
        total: observation.unsupportedControlTotal,
        top: observation.unsupportedControls
      })
    })
  });
};

const noteIntakeObservationLosses = (
  context: ImportContext,
  packageSummary: Readonly<HWPXPackageSummary>,
  observation: Readonly<HWPXIntakeObservation>
) => {
  if (observation.unknownTopLevelEntries.length > 0) {
    pushLoss(context, {
      category: "package",
      code: "hwpx-import-package-partial",
      severity: "warning",
      message: `Unknown top-level package entries were ignored: ${observation.unknownTopLevelEntries
        .slice(0, INTAKE_SUMMARY_LIMIT)
        .join(", ")}.`,
      count: observation.unknownTopLevelEntries.length
    });
  }

  if (packageSummary.sectionCount > 1) {
    pushLoss(context, {
      category: "package",
      code: "hwpx-import-package-partial",
      severity: "warning",
      message: `Multiple section XML entries were detected: ${packageSummary.sectionCount}.`,
      count: packageSummary.sectionCount
    });
  }

  if (observation.missingContentItemEntries.length > 0) {
    pushLoss(context, {
      category: "package",
      code: "hwpx-import-reference-missing",
      severity: "warning",
      message: `content.hpf references missing package entries: ${observation.missingContentItemEntries
        .slice(0, INTAKE_SUMMARY_LIMIT)
        .join(", ")}.`,
      count: observation.missingContentItemEntries.length
    });
  }

  if (observation.unknownXmlTagTotal > 0) {
    pushLoss(context, {
      category: "xml",
      code: "hwpx-import-xml-unknown",
      severity: "warning",
      message: `Unknown XML tags were observed during HWPX intake: ${observation.unknownXmlTags
        .map((item) => `${item.name}(${item.count})`)
        .join(", ")}.`,
      count: observation.unknownXmlTagTotal
    });
  }

  if (observation.unsupportedControlTotal > 0) {
    pushLoss(context, {
      category: "unsupported",
      code: "hwpx-import-control-unsupported",
      severity: "warning",
      message: `Unsupported HWPX controls were observed during intake: ${observation.unsupportedControls
        .map((item) => `${item.name}(${item.count})`)
        .join(", ")}.`,
      count: observation.unsupportedControlTotal
    });
  }
};

const normalizeParaTextAlign = (value: string | undefined) => {
  switch (value) {
    case "LEFT":
      return "left";
    case "CENTER":
      return "center";
    case "RIGHT":
      return "right";
    case "JUSTIFY":
      return "justify";
    default:
      return null;
  }
};

const isDefaultHwpxColor = (value: string | null) =>
  !value || value === "none" || value.toUpperCase() === "#000000";

const isActiveHwpxColor = (value: string | null) =>
  Boolean(value && value !== "none");

const roundToTwoDecimals = (value: number) =>
  Math.round(value * 100) / 100;

const parseFontFaces = (
  headerRoot: Readonly<HWPXXmlNode>
): ReadonlyMap<number, string> => {
  const fontFaceById = new Map<number, string>();

  descendantsNamed(headerRoot, "fontface").forEach((fontface) => {
    childrenNamed(fontface, "font").forEach((font) => {
      const id = numberAttr(font, "id");
      const face = font.attrs.face;

      if (id !== null && face && !fontFaceById.has(id)) {
        fontFaceById.set(id, face);
      }
    });
  });

  return fontFaceById;
};

const getFontRefId = (charPr: Readonly<HWPXXmlNode>) => {
  const fontRef = firstChildNamed(charPr, "fontRef");

  return (
    numberAttr(fontRef, "hangul") ??
    numberAttr(fontRef, "latin") ??
    numberAttr(fontRef, "other")
  );
};

const getCharPrUnsupported = (
  charPr: Readonly<HWPXXmlNode>
): readonly string[] => {
  const unsupported: string[] = [];
  const outline = firstChildNamed(charPr, "outline");
  const shadow = firstChildNamed(charPr, "shadow");
  const fontRef = firstChildNamed(charPr, "fontRef");
  const ratio = firstChildNamed(charPr, "ratio");
  const spacing = firstChildNamed(charPr, "spacing");
  const relSz = firstChildNamed(charPr, "relSz");
  const offset = firstChildNamed(charPr, "offset");

  if (charPr.attrs.symMark && charPr.attrs.symMark !== "NONE") {
    unsupported.push("symMark");
  }

  if (charPr.attrs.borderFillIDRef && charPr.attrs.borderFillIDRef !== "1") {
    unsupported.push("char borderFill");
  }

  if (charPr.attrs.useFontSpace === "1") {
    unsupported.push("font space");
  }

  if (charPr.attrs.useKerning === "1") {
    unsupported.push("kerning");
  }

  if (outline?.attrs.type && outline.attrs.type !== "NONE") {
    unsupported.push("outline");
  }

  if (shadow?.attrs.type && shadow.attrs.type !== "NONE") {
    unsupported.push("shadow");
  }

  if (
    fontRef &&
    new Set(
      ["hangul", "latin", "hanja", "japanese", "other"].map(
        (name) => fontRef.attrs[name] ?? ""
      )
    ).size > 1
  ) {
    unsupported.push("mixed script font refs");
  }

  [ratio, relSz].forEach((node) => {
    if (
      node &&
      ["hangul", "latin", "hanja", "japanese", "other"].some(
        (name) => node.attrs[name] !== undefined && node.attrs[name] !== "100"
      )
    ) {
      unsupported.push(localName(node.name));
    }
  });

  if (
    spacing &&
    ["hangul", "latin", "hanja", "japanese", "other"].some(
      (name) => spacing.attrs[name] !== undefined && spacing.attrs[name] !== "0"
    )
  ) {
    unsupported.push("spacing");
  }

  if (
    offset &&
    ["hangul", "latin", "hanja", "japanese", "other"].some(
      (name) => offset.attrs[name] !== undefined && offset.attrs[name] !== "0"
    )
  ) {
    unsupported.push("offset");
  }

  return freezeArray(unsupported);
};

const parseCharPrDefinition = (
  charPr: Readonly<HWPXXmlNode>,
  fontFaceById: ReadonlyMap<number, string>
): Readonly<HWPXCharPrDefinition> | null => {
  const id = numberAttr(charPr, "id");

  if (id === null) {
    return null;
  }

  const underline = firstChildNamed(charPr, "underline");
  const strikeout = firstChildNamed(charPr, "strikeout");
  const fontRefId = getFontRefId(charPr);
  const fontFamily = fontRefId === null ? null : fontFaceById.get(fontRefId) ?? null;
  const height = numberAttr(charPr, "height");
  const color = charPr.attrs.textColor ?? null;
  const backgroundColor = charPr.attrs.shadeColor ?? null;
  const normalizedFontFamily =
    fontRefId !== null && fontRefId !== 0 ? fontFamily : null;
  const codeLike = Boolean(
    fontFamily && fontFamily.toLowerCase() === "consolas"
  );

  return Object.freeze({
    id,
    bold: charPr.attrs.bold === "1",
    italic: charPr.attrs.italic === "1",
    underline: Boolean(underline?.attrs.type && underline.attrs.type !== "NONE"),
    strike: Boolean(strikeout?.attrs.shape && strikeout.attrs.shape !== "NONE"),
    fontFamily: normalizedFontFamily,
    fontSizePt:
      height !== null && height !== 1000
        ? roundToTwoDecimals(height / 100)
        : null,
    color: isDefaultHwpxColor(color) ? null : color,
    backgroundColor: isActiveHwpxColor(backgroundColor)
      ? backgroundColor
      : null,
    verticalAlign: firstChildNamed(charPr, "subscript")
      ? "subscript"
      : firstChildNamed(charPr, "supscript")
        ? "superscript"
        : null,
    codeLike,
    unsupported: getCharPrUnsupported(charPr)
  });
};

const HWPX_BORDER_SIDES: readonly HWPXTableBorderSide[] = [
  "top",
  "right",
  "bottom",
  "left"
];

const HWPX_BORDER_SIDE_TAGS: Readonly<Record<HWPXTableBorderSide, string>> =
  Object.freeze({
    top: "topBorder",
    right: "rightBorder",
    bottom: "bottomBorder",
    left: "leftBorder"
  });

const IR_BORDER_SIDE_ATTR_PARTS: Readonly<Record<HWPXTableBorderSide, string>> =
  Object.freeze({
    top: "Top",
    right: "Right",
    bottom: "Bottom",
    left: "Left"
  });

const normalizeBorderFillColor = (value: string | null | undefined) =>
  value && value !== "none" ? value : null;

const normalizeBorderFillWidth = (value: string | null | undefined) =>
  value?.trim() || null;

const normalizeBorderFillStyle = (value: string | null | undefined) => {
  switch (value) {
    case undefined:
    case null:
      return null;
    case "NONE":
      return "none";
    case "SOLID":
      return "solid";
    case "DASH":
      return "dashed";
    case "DOT":
      return "dotted";
    case "DOUBLE_SLIM":
    case "DOUBLE":
      return "double";
    default:
      return "unknown";
  }
};

const parseBorderLineDefinition = (
  borderFill: Readonly<HWPXXmlNode>,
  side: HWPXTableBorderSide
): Readonly<HWPXBorderLineDefinition> => {
  const node = firstChildNamed(borderFill, HWPX_BORDER_SIDE_TAGS[side]);
  const style = normalizeBorderFillStyle(node?.attrs.type);
  const unsupported: string[] = [];

  if (node?.attrs.type && style === "unknown") {
    unsupported.push(`${side} border type ${node.attrs.type}`);
  }

  return Object.freeze({
    side,
    style,
    width: normalizeBorderFillWidth(node?.attrs.width),
    color: normalizeBorderFillColor(node?.attrs.color),
    unsupported: freezeArray(unsupported)
  });
};

const isNoneBorderLine = (line: Readonly<HWPXBorderLineDefinition>) =>
  line.style === null || line.style === "none";

const isActiveFillColor = (value: string | null | undefined) =>
  Boolean(value && value !== "none" && value.toUpperCase() !== "#FFFFFF");

const parseBorderFillBackgroundColor = (
  borderFill: Readonly<HWPXXmlNode>,
  unsupported: string[]
) => {
  const fillBrush = firstChildNamed(borderFill, "fillBrush");
  const winBrush = fillBrush ? firstChildNamed(fillBrush, "winBrush") : null;
  const faceColor = winBrush?.attrs.faceColor ?? null;
  const alpha = winBrush?.attrs.alpha ?? null;

  if (!fillBrush) {
    return null;
  }

  if (alpha && alpha !== "0") {
    unsupported.push(`fill alpha ${alpha}`);
  }

  childrenNamed(fillBrush, "gradation").forEach(() => {
    unsupported.push("gradation fill");
  });
  childrenNamed(fillBrush, "imgBrush").forEach(() => {
    unsupported.push("image fill");
  });

  return isActiveFillColor(faceColor) && (!alpha || alpha === "0")
    ? faceColor
    : null;
};

const parseBorderFillDefinition = (
  borderFill: Readonly<HWPXXmlNode>
): Readonly<HWPXBorderFillDefinition> | null => {
  const id = numberAttr(borderFill, "id");

  if (id === null) {
    return null;
  }

  const unsupported: string[] = [];
  const slash = firstChildNamed(borderFill, "slash");
  const backSlash = firstChildNamed(borderFill, "backSlash");
  const diagonal = firstChildNamed(borderFill, "diagonal");

  if (borderFill.attrs.threeD === "1") {
    unsupported.push("3D border");
  }

  if (borderFill.attrs.shadow === "1") {
    unsupported.push("shadow border");
  }

  if (borderFill.attrs.centerLine && borderFill.attrs.centerLine !== "NONE") {
    unsupported.push(`centerLine ${borderFill.attrs.centerLine}`);
  }

  if (borderFill.attrs.breakCellSeparateLine === "1") {
    unsupported.push("break cell separate line");
  }

  if (slash?.attrs.type && slash.attrs.type !== "NONE") {
    unsupported.push("slash border");
  }

  if (backSlash?.attrs.type && backSlash.attrs.type !== "NONE") {
    unsupported.push("backSlash border");
  }

  if (
    diagonal?.attrs.type &&
    diagonal.attrs.type !== "NONE" &&
    diagonal.attrs.type !== "SOLID"
  ) {
    unsupported.push(`diagonal border ${diagonal.attrs.type}`);
  }

  const sides = Object.freeze(
    Object.fromEntries(
      HWPX_BORDER_SIDES.map((side) => {
        const line = parseBorderLineDefinition(borderFill, side);

        unsupported.push(...line.unsupported);
        return [side, line];
      })
    ) as Record<HWPXTableBorderSide, Readonly<HWPXBorderLineDefinition>>
  );
  const backgroundColor = parseBorderFillBackgroundColor(borderFill, unsupported);

  return Object.freeze({
    id,
    sides,
    backgroundColor,
    unsupported: freezeArray(Array.from(new Set(unsupported)))
  });
};

const getParaPrUnsupported = (
  paraPr: Readonly<HWPXXmlNode>,
  align: Readonly<HWPXXmlNode> | null,
  lineSpacing: Readonly<HWPXXmlNode> | null
) => {
  const unsupported: string[] = [];

  if (align?.attrs.horizontal && !normalizeParaTextAlign(align.attrs.horizontal)) {
    unsupported.push(`paragraph align ${align.attrs.horizontal}`);
  }

  if (align?.attrs.vertical && align.attrs.vertical !== "BASELINE") {
    unsupported.push(`paragraph vertical align ${align.attrs.vertical}`);
  }

  if (lineSpacing?.attrs.type && lineSpacing.attrs.type !== "PERCENT") {
    unsupported.push(`line spacing type ${lineSpacing.attrs.type}`);
  }

  if (paraPr.attrs.checked === "1") {
    unsupported.push("checked paragraph");
  }

  return freezeArray(unsupported);
};

const parseHeaderModel = (
  headerRoot: Readonly<HWPXXmlNode> | null
): Readonly<HWPXHeaderModel> => {
  if (!headerRoot) {
    return EMPTY_HEADER_MODEL;
  }

  const numberingsById = new Map<number, Readonly<HWPXNumberingDefinition>>();
  const bulletsById = new Map<number, Readonly<HWPXBulletDefinition>>();
  const paraPrById = new Map<number, Readonly<HWPXParaPrDefinition>>();
  const charPrById = new Map<number, Readonly<HWPXCharPrDefinition>>();
  const borderFillById = new Map<number, Readonly<HWPXBorderFillDefinition>>();
  const fontFaceById = parseFontFaces(headerRoot);

  descendantsNamed(headerRoot, "numbering").forEach((numbering) => {
    const id = numberAttr(numbering, "id");
    const paraHead = firstChildNamed(numbering, "paraHead");

    if (id === null || !paraHead) {
      return;
    }

    numberingsById.set(
      id,
      Object.freeze({
        id,
        startNumber: numberAttr(paraHead, "start", 1) ?? 1,
        level: numberAttr(paraHead, "level", 1) ?? 1,
        numFormat: paraHead.attrs.numFormat ?? null,
        markerText: textContent(paraHead)
      })
    );
  });

  descendantsNamed(headerRoot, "bullet").forEach((bullet) => {
    const id = numberAttr(bullet, "id");

    if (id === null) {
      return;
    }

    bulletsById.set(
      id,
      Object.freeze({
        id,
        char: bullet.attrs.char ?? null,
        checkedChar: bullet.attrs.checkedChar ?? null,
        checkable: bullet.attrs.checkable === "1",
        useImage: bullet.attrs.useImage === "1"
      })
    );
  });

  descendantsNamed(headerRoot, "charPr").forEach((charPr) => {
    const definition = parseCharPrDefinition(charPr, fontFaceById);

    if (definition) {
      charPrById.set(definition.id, definition);
    }
  });

  descendantsNamed(headerRoot, "borderFill").forEach((borderFill) => {
    const definition = parseBorderFillDefinition(borderFill);

    if (definition) {
      borderFillById.set(definition.id, definition);
    }
  });

  descendantsNamed(headerRoot, "paraPr").forEach((paraPr) => {
    const id = numberAttr(paraPr, "id");
    const heading = firstChildNamed(paraPr, "heading");
    const headingType = heading?.attrs.type ?? "NONE";
    const align = firstChildNamed(paraPr, "align");
    const lineSpacing = firstChildNamed(paraPr, "lineSpacing");
    const margin = firstChildNamed(paraPr, "margin");
    const leftMargin = margin ? firstChildNamed(margin, "left") : null;
    const prevMargin = margin ? firstChildNamed(margin, "prev") : null;
    const nextMargin = margin ? firstChildNamed(margin, "next") : null;
    const leftIndent = numberAttr(leftMargin, "value", 0) ?? 0;
    const lineSpacingIsPercent = lineSpacing?.attrs.type === "PERCENT";
    const lineSpacingValue = lineSpacing?.attrs.value;
    const spacingLineTwips = lineSpacingIsPercent
      ? hwpxPercentLineSpacingToDocxTwips(lineSpacingValue)
      : null;

    if (id === null) {
      return;
    }

    paraPrById.set(
      id,
      Object.freeze({
        id,
        headingType,
        idRef: numberAttr(heading, "idRef"),
        level: numberAttr(heading, "level", 0) ?? 0,
        listType:
          headingType === "NUMBER"
            ? "ordered"
            : headingType === "BULLET"
              ? "bullet"
              : null,
        textAlign: normalizeParaTextAlign(align?.attrs.horizontal),
        lineHeight:
          lineSpacingIsPercent && lineSpacingValue ? `${lineSpacingValue}%` : null,
        indent: leftIndent > 0 ? `${hwpUnitToMm(leftIndent, 0)}mm` : null,
        spacingBeforeTwips: hwpUnitToDocxTwips(
          numberAttr(prevMargin, "value", 0)
        ),
        spacingAfterTwips: hwpUnitToDocxTwips(numberAttr(nextMargin, "value", 0)),
        spacingLineTwips,
        spacingLineRule: spacingLineTwips === null ? null : "auto",
        unsupported: getParaPrUnsupported(paraPr, align, lineSpacing)
      })
    );
  });

  return Object.freeze({
    fontFaceCount: fontFaceById.size,
    paraPrById,
    charPrById,
    borderFillById,
    numberingsById,
    bulletsById
  });
};

const parsePageSettings = (
  sectionRoot: Readonly<HWPXXmlNode>
): IRPageSettings => {
  const pagePr = firstDescendantNamed(sectionRoot, "pagePr");
  const margin = pagePr ? firstChildNamed(pagePr, "margin") : null;
  const width = hwpUnitToMm(
    numberAttr(pagePr, "width"),
    DEFAULT_PAGE_SETTINGS.widthMm
  );
  const height = hwpUnitToMm(
    numberAttr(pagePr, "height"),
    DEFAULT_PAGE_SETTINGS.heightMm
  );

  return {
    widthMm: width,
    heightMm: height,
    paddingTopMm: hwpUnitToMm(
      numberAttr(margin, "top"),
      DEFAULT_PAGE_SETTINGS.paddingTopMm
    ),
    paddingBottomMm: hwpUnitToMm(
      numberAttr(margin, "bottom"),
      DEFAULT_PAGE_SETTINGS.paddingBottomMm
    ),
    paddingLeftMm: hwpUnitToMm(
      numberAttr(margin, "left"),
      DEFAULT_PAGE_SETTINGS.paddingLeftMm
    ),
    paddingRightMm: hwpUnitToMm(
      numberAttr(margin, "right"),
      DEFAULT_PAGE_SETTINGS.paddingRightMm
    ),
    lineHeight: DEFAULT_PAGE_SETTINGS.lineHeight
  };
};

const hasDescendant = (node: Readonly<HWPXXmlNode>, name: string) =>
  Boolean(firstDescendantNamed(node, name));

const getParaPrForParagraph = (
  p: Readonly<HWPXXmlNode>,
  context: ImportContext
) => {
  const paraPrId = Number(p.attrs.paraPrIDRef);

  return Number.isFinite(paraPrId)
    ? context.headerModel.paraPrById.get(paraPrId) ?? null
    : null;
};

const noteParaPrStylePartialLoss = (
  paraPr: Readonly<HWPXParaPrDefinition> | null,
  context: ImportContext,
  entry: string,
  path: string
) => {
  if (!paraPr?.unsupported.length) {
    return;
  }

  pushLoss(context, {
    category: "style",
    code: "hwpx-import-style-partial",
    severity: "warning",
    message: `HWPX paraPr ${paraPr.id} was partially imported: ${paraPr.unsupported.join(
      ", "
    )}.`,
    entry,
    path,
    count: paraPr.unsupported.length
  });
};

const getParagraphStyleAttrs = (
  p: Readonly<HWPXXmlNode>,
  context: ImportContext,
  entry: string,
  path: string
) => {
  const paraPr = getParaPrForParagraph(p, context);
  const attrs: {
    textAlign?: string | null;
    lineHeight?: string | null;
    indent?: string | null;
    docxParagraphSpacingBefore?: number | null;
    docxParagraphSpacingAfter?: number | null;
    docxParagraphSpacingLine?: number | null;
    docxParagraphSpacingLineRule?: string | null;
  } = {};

  noteParaPrStylePartialLoss(paraPr, context, entry, path);

  if (paraPr?.textAlign) {
    attrs.textAlign = paraPr.textAlign;
  }

  if (paraPr?.lineHeight) {
    attrs.lineHeight = paraPr.lineHeight;
  }

  if (paraPr?.indent) {
    attrs.indent = paraPr.indent;
  }

  if (paraPr?.spacingBeforeTwips) {
    attrs.docxParagraphSpacingBefore = paraPr.spacingBeforeTwips;
  }

  if (paraPr?.spacingAfterTwips) {
    attrs.docxParagraphSpacingAfter = paraPr.spacingAfterTwips;
  }

  if (paraPr?.spacingLineTwips) {
    attrs.docxParagraphSpacingLine = paraPr.spacingLineTwips;
    attrs.docxParagraphSpacingLineRule = paraPr.spacingLineRule;
  }

  return attrs;
};

const getHeadingLevel = (
  p: Readonly<HWPXXmlNode>,
  context: ImportContext
) => {
  const styleId = Number(p.attrs.styleIDRef);
  const paraPrId = Number(p.attrs.paraPrIDRef);
  const paraPr = getParaPrForParagraph(p, context);
  const candidate =
    Number.isFinite(styleId) && styleId > 0
      ? styleId
      : paraPr && !paraPr.listType && paraPr.level > 0
        ? paraPr.level
        : paraPrId;

  return Number.isFinite(candidate) && candidate >= 1 && candidate <= 6
    ? Math.trunc(candidate)
    : null;
};

const normalizeHyperlinkCommand = (command: string) =>
  command.replace(/\\:/g, ":").replace(/;1;0;0;$/, "").trim();

const extractHyperlinkHref = (
  fieldBegin: Readonly<HWPXXmlNode>,
  context: ImportContext,
  entry: string,
  path: string
) => {
  if (fieldBegin.attrs.type !== "HYPERLINK") {
    pushLoss(context, {
      category: "unsupported",
      code: "hwpx-import-unsupported-structure",
      severity: "warning",
      message: `Unsupported HWPX field type '${fieldBegin.attrs.type ?? ""}' was ignored.`,
      entry,
      path
    });
    return null;
  }

  const commandParam = descendantsNamed(fieldBegin, "stringParam").find(
    (param) => param.attrs.name === "Command"
  );
  const command = commandParam ? textContent(commandParam) : "";
  const href = normalizeHyperlinkCommand(command);

  if (!href) {
    pushLoss(context, {
      category: "link",
      code: "hwpx-import-link-metadata-loss",
      severity: "warning",
      message: "HWPX hyperlink field did not contain an importable Command target.",
      entry,
      path
    });
    return null;
  }

  return href;
};

const createMark = (
  type: IRMark["type"],
  attrs?: Record<string, unknown>
): IRMark =>
  Object.freeze({
    type,
    ...(attrs ? { attrs: Object.freeze(attrs) } : {})
  });

const noteStylePartialLoss = (
  charPr: Readonly<HWPXCharPrDefinition>,
  context: ImportContext,
  entry: string,
  path: string
) => {
  if (!charPr.unsupported.length) {
    return;
  }

  pushLoss(context, {
    category: "style",
    code: "hwpx-import-style-partial",
    severity: "warning",
    message: `HWPX charPr ${charPr.id} was partially imported: ${charPr.unsupported.join(
      ", "
    )}.`,
    entry,
    path,
    count: charPr.unsupported.length
  });
};

const getRunCharPr = (
  run: Readonly<HWPXXmlNode>,
  context: ImportContext,
  entry: string,
  path: string
) => {
  const charPrId = Number(run.attrs.charPrIDRef);

  if (!Number.isFinite(charPrId)) {
    return null;
  }

  const charPr = context.headerModel.charPrById.get(charPrId);

  if (!charPr && charPrId !== 0) {
    pushLoss(context, {
      category: "style",
      code: "hwpx-import-style-loss",
      severity: "warning",
      message: `HWPX charPr ${charPrId} was referenced but not found in header.xml.`,
      entry,
      path
    });
    return null;
  }

  if (charPr) {
    noteStylePartialLoss(charPr, context, entry, path);
  }

  return charPr ?? null;
};

const getMarksForCharPr = (
  charPr: Readonly<HWPXCharPrDefinition> | null
): IRMark[] => {
  const marks: IRMark[] = [];
  const textStyleAttrs: Record<string, unknown> = {};

  if (!charPr) {
    return marks;
  }

  if (charPr.bold) {
    marks.push(createMark("bold"));
  }

  if (charPr.italic) {
    marks.push(createMark("italic"));
  }

  if (charPr.underline) {
    marks.push(createMark("underline"));
  }

  if (charPr.strike) {
    marks.push(createMark("strike"));
  }

  if (charPr.codeLike) {
    marks.push(createMark("code"));
  }

  if (charPr.verticalAlign === "subscript") {
    marks.push(createMark("subscript"));
  }

  if (charPr.verticalAlign === "superscript") {
    marks.push(createMark("superscript"));
  }

  if (charPr.fontFamily) {
    textStyleAttrs.fontFamily = charPr.fontFamily;
  }

  if (charPr.fontSizePt !== null) {
    textStyleAttrs.fontSize = `${charPr.fontSizePt}pt`;
  }

  if (charPr.color) {
    textStyleAttrs.color = charPr.color;
  }

  if (charPr.backgroundColor) {
    textStyleAttrs.backgroundColor = charPr.backgroundColor;
  }

  if (Object.keys(textStyleAttrs).length > 0) {
    marks.push(createMark("textStyle", textStyleAttrs));
  }

  if (charPr.backgroundColor && !charPr.codeLike) {
    marks.push(createMark("highlight", { color: charPr.backgroundColor }));
  }

  return marks;
};

const nativeNoteKind = (node: Readonly<HWPXXmlNode>): IRNoteKind | null =>
  isNodeNamed(node, "footNote") ? "footnote" : isNodeNamed(node, "endNote") ? "endnote" : null;

const HWPX_NOTE_SUBLIST_ATTRS = Object.freeze({
  id: "",
  textDirection: "HORIZONTAL",
  lineWrap: "BREAK",
  vertAlign: "TOP",
  linkListIDRef: "0",
  linkListNextIDRef: "0",
  textWidth: "0",
  textHeight: "0",
  hasTextRef: "0",
  hasNumRef: "0"
});

const hasOnlyAttributes = (
  node: Readonly<HWPXXmlNode>,
  names: readonly string[]
) => {
  const actual = Object.keys(node.attrs).sort();
  const expected = [...names].sort();
  return (
    actual.length === expected.length &&
    actual.every((name, index) => name === expected[index])
  );
};

const hasExactAttributes = (
  node: Readonly<HWPXXmlNode>,
  expected: Readonly<Record<string, string>>
) =>
  hasOnlyAttributes(node, Object.keys(expected)) &&
  Object.entries(expected).every(([name, value]) => node.attrs[name] === value);

const pushNativeNoteLoss = (
  context: ImportContext,
  code:
    | "hwpx-import-note-structure-invalid"
    | "hwpx-import-note-pair-invalid"
    | "hwpx-import-note-numbering-unsupported"
    | "hwpx-import-note-content-unsupported"
    | "hwpx-import-note-hyperlink-unsupported",
  message: string,
  entry: string,
  path?: string
) =>
  pushLoss(context, {
    category: code === "hwpx-import-note-hyperlink-unsupported" ? "link" : "unsupported",
    code,
    severity: "error",
    message,
    entry,
    path
  });

interface HWPXNativeNoteShape {
  note: Readonly<HWPXXmlNode>;
  subList: Readonly<HWPXXmlNode>;
  kind: IRNoteKind;
  instId: number;
  noteId: string;
}

const parseNativeNoteShape = (
  ctrl: Readonly<HWPXXmlNode>,
  context: ImportContext,
  entry: string,
  path: string
): HWPXNativeNoteShape | null => {
  const noteChildren = ctrl.children.filter((child) => nativeNoteKind(child));
  const note = noteChildren[0] ?? null;
  if (
    !note ||
    noteChildren.length !== 1 ||
    ctrl.children.length !== 1 ||
    !hasOnlyAttributes(ctrl, []) ||
    !hasOnlyAttributes(note, ["instId"])
  ) {
    pushNativeNoteLoss(
      context,
      "hwpx-import-note-structure-invalid",
      "HWPX native note must use ctrl > footNote/endNote with instId only.",
      entry,
      path
    );
    return null;
  }

  const instId = Number(note.attrs.instId);
  const subLists = childrenNamed(note, "subList");
  if (
    !Number.isSafeInteger(instId) ||
    instId <= 0 ||
    note.children.length !== 1 ||
    subLists.length !== 1 ||
    !hasExactAttributes(subLists[0], HWPX_NOTE_SUBLIST_ATTRS)
  ) {
    pushNativeNoteLoss(
      context,
      "hwpx-import-note-structure-invalid",
      "HWPX native note identity or subList shape is outside the supported contract.",
      entry,
      path
    );
    return null;
  }

  const kind = nativeNoteKind(note)!;
  return {
    note,
    subList: subLists[0],
    kind,
    instId,
    noteId: `note-v1-hwpx-${kind}-${instId}`
  };
};

const parseNativeNoteReference = (
  ctrl: Readonly<HWPXXmlNode>, context: ImportContext, entry: string, path: string
): IRInlineNode | null => {
  const shape = parseNativeNoteShape(ctrl, context, entry, path);
  if (!shape) return null;
  context.noteReferences.push({
    noteId: shape.noteId,
    kind: shape.kind,
    instId: shape.instId
  });
  return Object.freeze({
    type: "noteReference",
    noteId: shape.noteId,
    kind: shape.kind
  });
};

const isSupportedNativeNoteHref = (href: string) => {
  try {
    const protocol = new URL(href).protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
  } catch {
    return false;
  }
};

const getNativeNoteMarks = (
  run: Readonly<HWPXXmlNode>,
  context: ImportContext,
  entry: string,
  path: string
): IRMark[] | null => {
  const charPrId = Number(run.attrs.charPrIDRef);
  const charPr = Number.isSafeInteger(charPrId)
    ? context.headerModel.charPrById.get(charPrId) ?? null
    : null;
  if (!charPr) {
    pushNativeNoteLoss(
      context,
      "hwpx-import-note-content-unsupported",
      "HWPX native note text references a missing or invalid charPr.",
      entry,
      path
    );
    return null;
  }
  if (
    charPr.unsupported.length ||
    charPr.codeLike ||
    charPr.fontFamily !== null ||
    charPr.fontSizePt !== null ||
    charPr.backgroundColor !== null ||
    (charPr.color !== null && !/^#[0-9a-f]{6}$/i.test(charPr.color))
  ) {
    pushNativeNoteLoss(
      context,
      "hwpx-import-note-content-unsupported",
      "HWPX native note text style is outside the supported mark and six-digit color subset.",
      entry,
      path
    );
    return null;
  }

  const marks: IRMark[] = [];
  if (charPr.bold) marks.push(createMark("bold"));
  if (charPr.italic) marks.push(createMark("italic"));
  if (charPr.underline) marks.push(createMark("underline"));
  if (charPr.strike) marks.push(createMark("strike"));
  if (charPr.verticalAlign === "subscript") marks.push(createMark("subscript"));
  if (charPr.verticalAlign === "superscript") marks.push(createMark("superscript"));
  if (charPr.color) marks.push(createMark("textStyle", { color: charPr.color }));
  return marks;
};

interface ParseParagraphRunOptions {
  noteBody?: boolean;
  skipLeadingAutoNumRun?: boolean;
}

const parseParagraphRuns = (
  p: Readonly<HWPXXmlNode>,
  context: ImportContext,
  entry: string,
  path: string,
  options: ParseParagraphRunOptions = {}
): IRInlineNode[] => {
  const runs: IRInlineNode[] = [];
  let activeHref: string | null = null;
  let activeFieldPath: string | null = null;
  let activeFieldId: string | null = null;

  childrenNamed(p, "run").forEach((run, runIndex) => {
    if (options.skipLeadingAutoNumRun && runIndex === 0) return;
    const runPath = `${path}.runs[${runIndex}]`;
    const directCtrls = childrenNamed(run, "ctrl");
    const noteCtrls = directCtrls.filter((ctrl) =>
      ctrl.children.some((child) => nativeNoteKind(child))
    );
    if (noteCtrls.length) {
      if (
        options.noteBody ||
        noteCtrls.length !== 1 ||
        directCtrls.length !== 1 ||
        run.children.length !== 1
      ) {
        pushNativeNoteLoss(
          context,
          options.noteBody
            ? "hwpx-import-note-content-unsupported"
            : "hwpx-import-note-structure-invalid",
          options.noteBody
            ? "Nested HWPX native notes are not supported inside a note body."
            : "HWPX native note reference run must contain one isolated ctrl.",
          entry,
          runPath
        );
      } else {
        const noteReference = parseNativeNoteReference(
          noteCtrls[0],
          context,
          entry,
          `${runPath}.ctrl[0]`
        );
        if (noteReference) runs.push(noteReference);
      }
      return;
    }

    if (options.noteBody) {
      const runChildrenSupported = run.children.every(
        (child) => isNodeNamed(child, "ctrl") || isNodeNamed(child, "t")
      );
      const controlsSupported = directCtrls.every(
        (ctrl) =>
          hasOnlyAttributes(ctrl, []) &&
          ctrl.children.length === 1 &&
          (isNodeNamed(ctrl.children[0], "fieldBegin") ||
            isNodeNamed(ctrl.children[0], "fieldEnd"))
      );
      const textNodesSupported = childrenNamed(run, "t").every((textNode) => {
        const breaks = childrenNamed(textNode, "lineBreak");
        return (
          hasOnlyAttributes(textNode, []) &&
          textNode.children.every((child) => isNodeNamed(child, "lineBreak")) &&
          breaks.length <= 1 &&
          !(breaks.length && textNode.text.length)
        );
      });
      if (
        !hasOnlyAttributes(run, ["charPrIDRef"]) ||
        !runChildrenSupported ||
        !controlsSupported ||
        !textNodesSupported ||
        run.text.trim()
      ) {
        pushNativeNoteLoss(
          context,
          "hwpx-import-note-content-unsupported",
          "HWPX native note run contains unsupported inline content or attributes.",
          entry,
          runPath
        );
        return;
      }
    }

    const fieldBegin = directCtrls
      .flatMap((ctrl) => ctrl.children)
      .find((child) => isNodeNamed(child, "fieldBegin"));
    const fieldEnd = directCtrls
      .flatMap((ctrl) => ctrl.children)
      .find((child) => isNodeNamed(child, "fieldEnd"));

    if (fieldBegin) {
      if (activeFieldPath) {
        if (options.noteBody) {
          pushNativeNoteLoss(
            context,
            "hwpx-import-note-hyperlink-unsupported",
            "HWPX native note hyperlink fields overlap.",
            entry,
            runPath
          );
        } else {
          pushLoss(context, {
            category: "link",
            code: "hwpx-import-link-metadata-loss",
            severity: "warning",
            message:
              "HWPX hyperlink fieldBegin appeared before the previous field was closed.",
            entry,
            path: runPath
          });
        }
      }

      activeFieldPath = runPath;
      activeHref = extractHyperlinkHref(fieldBegin, context, entry, runPath);
      activeFieldId = fieldBegin.attrs.id ?? null;
      if (
        options.noteBody &&
        (!activeFieldId || !activeHref || !isSupportedNativeNoteHref(activeHref))
      ) {
        pushNativeNoteLoss(
          context,
          "hwpx-import-note-hyperlink-unsupported",
          "HWPX native note hyperlink identity or target is missing or unsafe.",
          entry,
          runPath
        );
        activeHref = null;
      }
    }

    if (!options.noteBody && hasDescendant(run, "lineBreak")) {
      runs.push(Object.freeze({ type: "hardBreak" } satisfies IRHardBreak));
    }

    const textNodes = options.noteBody
      ? childrenNamed(run, "t")
      : descendantsNamed(run, "t");
    textNodes.forEach((textNode) => {
      if (
        options.noteBody &&
        childrenNamed(textNode, "lineBreak").length
      ) {
        runs.push(Object.freeze({ type: "hardBreak" } satisfies IRHardBreak));
        return;
      }
      const text = textContent(textNode);

      if (!text) {
        return;
      }

      const marks = options.noteBody
        ? getNativeNoteMarks(run, context, entry, runPath)
        : getMarksForCharPr(getRunCharPr(run, context, entry, runPath));
      if (!marks) return;

      if (activeHref) {
        marks.push(createMark("link", { href: activeHref }));
      }

      runs.push(
        Object.freeze({
          type: "textRun",
          text,
          marks
        } satisfies IRTextRun)
      );
    });

    if (fieldEnd) {
      if (!activeFieldPath) {
        if (options.noteBody) {
          pushNativeNoteLoss(
            context,
            "hwpx-import-note-hyperlink-unsupported",
            "HWPX native note hyperlink fieldEnd has no matching fieldBegin.",
            entry,
            runPath
          );
        } else {
          pushLoss(context, {
            category: "link",
            code: "hwpx-import-link-metadata-loss",
            severity: "warning",
            message: "HWPX hyperlink fieldEnd appeared without a matching fieldBegin.",
            entry,
            path: runPath
          });
        }
      } else if (
        options.noteBody &&
        activeFieldId &&
        fieldEnd.attrs.beginIDRef !== activeFieldId
      ) {
        pushNativeNoteLoss(
          context,
          "hwpx-import-note-hyperlink-unsupported",
          "HWPX native note hyperlink field IDs do not match.",
          entry,
          runPath
        );
      }

      activeHref = null;
      activeFieldPath = null;
      activeFieldId = null;
    }
  });

  if (activeFieldPath) {
    if (options.noteBody) {
      pushNativeNoteLoss(
        context,
        "hwpx-import-note-hyperlink-unsupported",
        "HWPX native note hyperlink fieldBegin has no matching fieldEnd.",
        entry,
        activeFieldPath
      );
    } else {
      pushLoss(context, {
        category: "link",
        code: "hwpx-import-link-metadata-loss",
        severity: "warning",
        message: "HWPX hyperlink fieldBegin did not have a matching fieldEnd.",
        entry,
        path: activeFieldPath
      });
    }
  }

  return runs;
};

const isSupportedNativeNoteParagraphShape = (
  paragraph: Readonly<HWPXXmlNode>
) => {
  const expectedAttrs = {
    paraPrIDRef: "0",
    styleIDRef: "0",
    pageBreak: "0",
    columnBreak: "0",
    merged: "0"
  };
  return (
    hasOnlyAttributes(paragraph, ["id", ...Object.keys(expectedAttrs)]) &&
    Object.entries(expectedAttrs).every(
      ([name, value]) => paragraph.attrs[name] === value
    ) &&
    paragraph.children.every(
      (child) => isNodeNamed(child, "run") || isNodeNamed(child, "linesegarray")
    ) &&
    childrenNamed(paragraph, "linesegarray").length <= 1 &&
    !paragraph.text.trim()
  );
};

const hasSupportedNativeNoteMarker = (
  paragraph: Readonly<HWPXXmlNode>,
  kind: IRNoteKind,
  expectedNumber: number
) => {
  const runs = childrenNamed(paragraph, "run");
  const markerRun = runs[0] ?? null;
  if (!markerRun || !hasOnlyAttributes(markerRun, ["charPrIDRef"])) return false;
  const ctrls = childrenNamed(markerRun, "ctrl");
  const texts = childrenNamed(markerRun, "t");
  const autoNum = ctrls[0] ? firstChildNamed(ctrls[0], "autoNum") : null;
  const format = autoNum ? firstChildNamed(autoNum, "autoNumFormat") : null;
  const expectedType = kind === "footnote" ? "FOOTNOTE" : "ENDNOTE";
  return Boolean(
    markerRun.attrs.charPrIDRef === "0" &&
      markerRun.children.every(
        (child) => isNodeNamed(child, "ctrl") || isNodeNamed(child, "t")
      ) &&
      ctrls.length === 1 &&
      hasOnlyAttributes(ctrls[0], []) &&
      ctrls[0].children.length === 1 &&
      autoNum &&
      hasExactAttributes(autoNum, {
        num: String(expectedNumber),
        numType: expectedType
      }) &&
      autoNum.children.length === 1 &&
      format &&
      hasExactAttributes(format, {
        type: "DIGIT",
        userChar: "",
        prefixChar: "",
        suffixChar: ")",
        supscript: "0"
      }) &&
      format.children.length === 0 &&
      texts.length <= 1 &&
      texts.every(
        (textNode) =>
          hasOnlyAttributes(textNode, []) &&
          textNode.children.length === 0 &&
          !textNode.text.trim()
      ) &&
      !markerRun.text.trim()
  );
};

const parseNativeNoteBodyParagraph = (
  paragraph: Readonly<HWPXXmlNode>,
  paragraphIndex: number,
  context: ImportContext,
  entry: string,
  path: string
): IRNoteBody["paragraphs"][number] | null => {
  if (!isSupportedNativeNoteParagraphShape(paragraph)) {
    pushNativeNoteLoss(
      context,
      "hwpx-import-note-content-unsupported",
      "HWPX native note paragraph structure or attributes are unsupported.",
      entry,
      path
    );
    return null;
  }
  const before = context.losses.length;
  const runs = parseParagraphRuns(paragraph, context, entry, path, {
    noteBody: true,
    skipLeadingAutoNumRun: paragraphIndex === 0
  });
  const invalid = context.losses
    .slice(before)
    .some(
      (loss) =>
        loss.severity === "error" && loss.code.startsWith("hwpx-import-note-")
    );
  if (invalid) return null;
  return {
    type: "paragraph",
    runs: mutableArray(runs) as IRNoteBody["paragraphs"][number]["runs"]
  };
};

const parseNativeNoteBodies = (
  sectionRoot: Readonly<HWPXXmlNode>,
  context: ImportContext,
  entry: string
) => {
  const noteCtrls = descendantsNamed(sectionRoot, "ctrl").filter((candidate) =>
    candidate.children.some((child) => nativeNoteKind(child))
  );
  noteCtrls.forEach((ctrl, ctrlIndex) => {
    const path = `notes[${ctrlIndex}]`;
    const shape = parseNativeNoteShape(ctrl, context, entry, path);
    if (!shape) return;
    const paragraphs = childrenNamed(shape.subList, "p");
    if (
      !paragraphs.length ||
      shape.subList.children.length !== paragraphs.length ||
      shape.subList.text.trim()
    ) {
      pushNativeNoteLoss(
        context,
        "hwpx-import-note-content-unsupported",
        "HWPX native note subList must contain one or more paragraphs only.",
        entry,
        path
      );
      return;
    }

    context.noteDisplayCounters[shape.kind] += 1;
    const displayNumber = context.noteDisplayCounters[shape.kind];
    if (
      !hasSupportedNativeNoteMarker(paragraphs[0], shape.kind, displayNumber) ||
      paragraphs.slice(1).some((paragraph) => descendantsNamed(paragraph, "autoNum").length) ||
      descendantsNamed(paragraphs[0], "autoNum").length !== 1
    ) {
      pushNativeNoteLoss(
        context,
        "hwpx-import-note-numbering-unsupported",
        "HWPX native note must start with the expected continuous decimal autoNum marker.",
        entry,
        path
      );
      return;
    }

    const parsed = paragraphs.map((paragraph, paragraphIndex) =>
      parseNativeNoteBodyParagraph(
        paragraph,
        paragraphIndex,
        context,
        entry,
        `${path}.paragraphs[${paragraphIndex}]`
      )
    );
    if (parsed.some((paragraph) => !paragraph)) return;
    context.noteBodies.push({
      noteId: shape.noteId,
      kind: shape.kind,
      referenceOrder: -1,
      instId: shape.instId,
      displayNumber,
      paragraphs: parsed as IRNoteBody["paragraphs"]
    });
  });

  const nativeNoteCount =
    descendantsNamed(sectionRoot, "footNote").length +
    descendantsNamed(sectionRoot, "endNote").length;
  if (nativeNoteCount !== noteCtrls.length) {
    pushNativeNoteLoss(
      context,
      "hwpx-import-note-structure-invalid",
      "HWPX native note is not contained in the required run > ctrl shape.",
      entry
    );
  }
};

const validateNativeNotePolicies = (
  headerRoot: Readonly<HWPXXmlNode> | null,
  sectionRoots: ReadonlyMap<string, Readonly<HWPXXmlNode> | null>,
  context: ImportContext
) => {
  const noteKinds = new Set<IRNoteKind>();
  sectionRoots.forEach((root) => {
    if (!root) return;
    if (descendantsNamed(root, "footNote").length) noteKinds.add("footnote");
    if (descendantsNamed(root, "endNote").length) noteKinds.add("endnote");
  });
  if (!noteKinds.size) return;

  const beginNums = headerRoot ? descendantsNamed(headerRoot, "beginNum") : [];
  const beginNum = beginNums[0] ?? null;
  if (
    beginNums.length !== 1 ||
    !beginNum ||
    (noteKinds.has("footnote") && beginNum.attrs.footnote !== "1") ||
    (noteKinds.has("endnote") && beginNum.attrs.endnote !== "1")
  ) {
    pushNativeNoteLoss(
      context,
      "hwpx-import-note-numbering-unsupported",
      "HWPX native note begin numbers must start at 1.",
      "Contents/header.xml"
    );
  }

  sectionRoots.forEach((root, entry) => {
    if (!root) return;
    const sectionKinds = new Set<IRNoteKind>();
    if (descendantsNamed(root, "footNote").length) sectionKinds.add("footnote");
    if (descendantsNamed(root, "endNote").length) sectionKinds.add("endnote");
    if (!sectionKinds.size) return;
    const secPr = firstDescendantNamed(root, "secPr");
    sectionKinds.forEach((kind) => {
      const tag = kind === "footnote" ? "footNotePr" : "endNotePr";
      const properties = secPr ? childrenNamed(secPr, tag) : [];
      const property = properties[0] ?? null;
      const formats = property ? childrenNamed(property, "autoNumFormat") : [];
      const numberings = property ? childrenNamed(property, "numbering") : [];
      const placements = property ? childrenNamed(property, "placement") : [];
      const expectedPlacement =
        kind === "footnote" ? "EACH_COLUMN" : "END_OF_DOCUMENT";
      if (
        properties.length !== 1 ||
        !property ||
        formats.length !== 1 ||
        !hasExactAttributes(formats[0], {
          type: "DIGIT",
          userChar: "",
          prefixChar: "",
          suffixChar: ")",
          supscript: "0"
        }) ||
        numberings.length !== 1 ||
        !hasExactAttributes(numberings[0], {
          type: "CONTINUOUS",
          newNum: "1"
        }) ||
        placements.length !== 1 ||
        !hasExactAttributes(placements[0], {
          place: expectedPlacement,
          beneathText: "0"
        })
      ) {
        pushNativeNoteLoss(
          context,
          "hwpx-import-note-numbering-unsupported",
          `HWPX ${kind} numbering or placement is outside the supported continuous policy.`,
          entry
        );
      }
    });
  });
};

const isEmptyParagraph = (runs: readonly IRInlineNode[]) =>
  !runs.some(
    (run) =>
      run.type === "noteReference" ||
      run.type === "hardBreak" ||
      (run.type === "textRun" && run.text.length > 0)
  );

const parseParagraphBlock = (
  p: Readonly<HWPXXmlNode>,
  context: ImportContext,
  entry: string,
  path: string
): IRParagraphBlock | IRHeadingBlock | null => {
  const headingLevel = getHeadingLevel(p, context);
  const runs = parseParagraphRuns(p, context, entry, path);
  const paragraphAttrs = getParagraphStyleAttrs(p, context, entry, path);

  if (isEmptyParagraph(runs)) {
    return null;
  }

  if (headingLevel !== null) {
    return {
      type: "heading",
      attrs: { ...paragraphAttrs, level: headingLevel },
      runs: mutableArray(runs)
    } satisfies IRHeadingBlock;
  }

  return {
    type: "paragraph",
    attrs: paragraphAttrs,
    runs: mutableArray(runs)
  } satisfies IRParagraphBlock;
};

const parseParagraphAsParagraphBlock = (
  p: Readonly<HWPXXmlNode>,
  context: ImportContext,
  entry: string,
  path: string
): IRParagraphBlock | null => {
  const runs = parseParagraphRuns(p, context, entry, path);
  const paragraphAttrs = getParagraphStyleAttrs(p, context, entry, path);

  if (isEmptyParagraph(runs)) {
    return null;
  }

  return {
    type: "paragraph",
    attrs: paragraphAttrs,
    runs: mutableArray(runs)
  } satisfies IRParagraphBlock;
};

const getListParagraphInfo = (
  p: Readonly<HWPXXmlNode>,
  context: ImportContext
): HWPXListParagraphInfo | null => {
  const paraPrId = Number(p.attrs.paraPrIDRef);

  if (!Number.isFinite(paraPrId)) {
    return null;
  }

  const paraPr = context.headerModel.paraPrById.get(paraPrId);

  if (!paraPr?.listType) {
    return null;
  }

  const unsupported: string[] = [];

  if (paraPr.level > 0) {
    unsupported.push("nested HWPX list level is flattened in import v1");
  }

  if (paraPr.listType === "ordered") {
    const numbering =
      paraPr.idRef === null
        ? null
        : context.headerModel.numberingsById.get(paraPr.idRef);
    const numFormat = numbering?.numFormat ?? null;

    if (!numbering) {
      unsupported.push("numbering definition is missing");
    }

    if (numbering && numbering.level > 1) {
      unsupported.push("multi-level numbering definition is flattened");
    }

    if (numFormat && numFormat !== "DIGIT") {
      unsupported.push(
        `ordered marker format '${numFormat}' is imported as decimal metadata`
      );
    }

    return {
      listType: "ordered",
      paraPrId,
      idRef: paraPr.idRef,
      level: paraPr.level,
      startNumber: numbering?.startNumber ?? 1,
      markerFormat: numFormat === "DIGIT" || !numFormat ? "decimal" : "unknown",
      bulletChar: null,
      unsupported: freezeArray(unsupported)
    };
  }

  const bullet =
    paraPr.idRef === null
      ? null
      : context.headerModel.bulletsById.get(paraPr.idRef);

  if (!bullet) {
    unsupported.push("bullet definition is missing");
  }

  if (bullet?.useImage) {
    unsupported.push("image bullet is imported as text bullet metadata");
  }

  if (bullet?.checkable) {
    unsupported.push("checkable bullet/task semantics are imported as bullet");
  }

  return {
    listType: "bullet",
    paraPrId,
    idRef: paraPr.idRef,
    level: paraPr.level,
    startNumber: null,
    markerFormat: "bullet",
    bulletChar: bullet?.char ?? null,
    unsupported: freezeArray(unsupported)
  };
};

const createListBlock = (info: HWPXListParagraphInfo): IRListBlock => {
  const attrs: Record<string, unknown> = {
    source: "hwpx-native-paraPr",
    hwpxParaPrId: info.paraPrId,
    hwpxListIdRef: info.idRef,
    hwpxLevel: info.level,
    markerKind: info.listType,
    markerFormat: info.markerFormat
  };

  if (info.listType === "ordered") {
    attrs.start = info.startNumber ?? 1;
    attrs.startNumber = info.startNumber ?? 1;
  }

  if (info.listType === "bullet") {
    attrs.bulletChar = info.bulletChar;
  }

  return {
    type: "list",
    listType: info.listType,
    attrs,
    items: []
  } satisfies IRListBlock;
};

const listSignature = (info: HWPXListParagraphInfo) =>
  [info.listType, info.paraPrId, info.idRef ?? "", info.level].join("|");

const createListItem = (
  info: HWPXListParagraphInfo,
  paragraph: IRParagraphBlock,
  ordinal: number
): IRListItem => {
  const value =
    info.listType === "ordered" && info.startNumber !== null
      ? info.startNumber + ordinal - 1
      : null;

  return {
    type: "listItem",
    attrs: {
      hwpxParaPrId: info.paraPrId,
      hwpxListIdRef: info.idRef,
      hwpxLevel: info.level,
      ...(value === null ? {} : { value })
    },
    blocks: [paragraph]
  } satisfies IRListItem;
};

const noteListPartialLoss = (
  info: HWPXListParagraphInfo,
  context: ImportContext,
  entry: string,
  path: string
) => {
  if (!info.unsupported.length) {
    return;
  }

  pushLoss(context, {
    category: "list",
    code: "hwpx-import-list-partial",
    severity: "warning",
    message: `HWPX ${info.listType} list metadata was partially imported: ${info.unsupported.join(
      ", "
    )}.`,
    entry,
    path,
    count: info.unsupported.length
  });
};

const getBorderFillForRef = (
  borderFillIDRef: string | undefined,
  context: ImportContext,
  entry: string,
  path: string
) => {
  const id = Number(borderFillIDRef);

  if (!Number.isFinite(id)) {
    return null;
  }

  const borderFill = context.headerModel.borderFillById.get(id);

  if (!borderFill) {
    pushLoss(context, {
      category: "table",
      code: "hwpx-import-table-style-partial",
      severity: "warning",
      message: `HWPX table borderFill ${id} was referenced but not found in header.xml.`,
      entry,
      path
    });
  }

  return borderFill ?? null;
};

const noteTableStylePartialLoss = (
  borderFill: Readonly<HWPXBorderFillDefinition> | null,
  context: ImportContext,
  entry: string,
  path: string
) => {
  if (!borderFill?.unsupported.length) {
    return;
  }

  pushLoss(context, {
    category: "table",
    code: "hwpx-import-table-style-partial",
    severity: "warning",
    message: `HWPX borderFill ${borderFill.id} was partially imported: ${borderFill.unsupported.join(
      ", "
    )}.`,
    entry,
    path,
    count: borderFill.unsupported.length
  });
};

const assignBorderSideAttrs = (
  attrs: Record<string, unknown>,
  side: HWPXTableBorderSide,
  line: Readonly<HWPXBorderLineDefinition>
) => {
  if (isNoneBorderLine(line)) {
    return;
  }

  const sideAttr = IR_BORDER_SIDE_ATTR_PARTS[side];

  if (line.color) {
    attrs[`border${sideAttr}Color`] = line.color;
  }

  if (line.style) {
    attrs[`border${sideAttr}Style`] = line.style;
  }

  if (line.width) {
    attrs[`border${sideAttr}Width`] = line.width;
  }
};

const createTableStyleAttrsFromBorderFill = (
  borderFill: Readonly<HWPXBorderFillDefinition> | null
) => {
  const attrs: Record<string, unknown> = {};

  if (!borderFill) {
    return attrs;
  }

  HWPX_BORDER_SIDES.forEach((side) => {
    assignBorderSideAttrs(attrs, side, borderFill.sides[side]);
  });

  if (borderFill.backgroundColor) {
    attrs.backgroundColor = borderFill.backgroundColor;
  }

  return attrs;
};

const parseTableCellBlocks = (
  tc: Readonly<HWPXXmlNode>,
  context: ImportContext,
  entry: string,
  path: string
) => {
  const subList = firstChildNamed(tc, "subList");
  const paragraphs = subList ? childrenNamed(subList, "p") : [];

  if (paragraphs.some((p) => descendantsNamed(p, "pic").length > 0)) {
    pushLoss(context, {
      category: "table",
      code: "hwpx-import-unsupported-structure",
      severity: "warning",
      message:
        "HWPX table cell picture is not restored inside the cell; it is imported as a top-level image after the table.",
      entry,
      path
    });
  }

  const blocks = paragraphs
    .map((p, paragraphIndex) =>
      parseParagraphBlock(
        p,
        context,
        entry,
        `${path}.blocks[${paragraphIndex}]`
      )
    )
    .filter((block): block is IRParagraphBlock | IRHeadingBlock =>
      Boolean(block)
    );

  return blocks.length
    ? blocks
    : [
        {
          type: "paragraph",
          attrs: {},
          runs: []
        } satisfies IRParagraphBlock
      ];
};

const getClampedTableSpanAttr = (
  cellSpan: Readonly<HWPXXmlNode> | null,
  attrName: "colSpan" | "rowSpan",
  context: ImportContext,
  entry: string,
  path: string
) => {
  const raw = cellSpan?.attrs[attrName];

  if (raw === undefined) {
    return 1;
  }

  const value = Number(raw);
  const normalizedValue = Number.isFinite(value) ? Math.floor(value) : NaN;

  if (!Number.isFinite(normalizedValue) || normalizedValue < 1) {
    pushLoss(context, {
      category: "table",
      code: "hwpx-import-structure-clamped",
      severity: "warning",
      message: `HWPX table ${attrName} '${raw}' was clamped to 1.`,
      entry,
      path
    });

    return 1;
  }

  if (normalizedValue !== value) {
    pushLoss(context, {
      category: "table",
      code: "hwpx-import-structure-clamped",
      severity: "warning",
      message: `HWPX table ${attrName} '${raw}' was rounded down to ${normalizedValue}.`,
      entry,
      path
    });
  }

  return normalizedValue;
};

const parseTableBlock = (
  table: Readonly<HWPXXmlNode>,
  context: ImportContext,
  entry: string,
  path: string
): IRTableBlock => {
  const tableBorderFill = getBorderFillForRef(
    table.attrs.borderFillIDRef,
    context,
    entry,
    path
  );
  const { backgroundColor: _tableBackgroundColor, ...tableStyleAttrs } =
    createTableStyleAttrsFromBorderFill(tableBorderFill);

  noteTableStylePartialLoss(tableBorderFill, context, entry, path);

  const rows = childrenNamed(table, "tr").map((tr, rowIndex) => {
    const cells = childrenNamed(tr, "tc")
      .map((tc, cellIndex) => {
        const cellAddr = firstChildNamed(tc, "cellAddr");
        const cellSpan = firstChildNamed(tc, "cellSpan");
        const cellSz = firstChildNamed(tc, "cellSz");
        const cellPath = `${path}.rows[${rowIndex}].cells[${cellIndex}]`;
        const cellBorderFill = getBorderFillForRef(
          tc.attrs.borderFillIDRef,
          context,
          entry,
          cellPath
        );
        const colAddr = numberAttr(cellAddr, "colAddr", cellIndex) ?? cellIndex;
        const colSpan = getClampedTableSpanAttr(
          cellSpan,
          "colSpan",
          context,
          entry,
          cellPath
        );
        const rowSpan = getClampedTableSpanAttr(
          cellSpan,
          "rowSpan",
          context,
          entry,
          cellPath
        );
        const width = numberAttr(cellSz, "width");

        noteTableStylePartialLoss(cellBorderFill, context, entry, cellPath);

        return {
          type: "tableCell",
          role: "cell",
          attrs: {
            colspan: colSpan,
            rowspan: rowSpan,
            colwidth: width === null ? null : [width],
            ...createTableStyleAttrsFromBorderFill(cellBorderFill)
          },
          blocks: mutableArray(
            parseTableCellBlocks(
              tc,
              context,
              entry,
              cellPath
            )
          ),
          __colAddr: colAddr
        };
      })
      .sort((left, right) => left.__colAddr - right.__colAddr)
      .map(({ __colAddr, ...cell }) => cell as IRTableCell);

    return {
      type: "tableRow",
      attrs: {},
      cells
    } satisfies IRTableRow;
  });

  return {
    type: "table",
    attrs: {
      objectId: table.attrs.id ?? null,
      ...tableStyleAttrs
    },
    rows
  } satisfies IRTableBlock;
};

const fileNameFromHref = (href: string | null) => {
  if (!href) {
    return null;
  }

  const parts = href.split(/[\\/]/);

  return parts[parts.length - 1] || null;
};

const normalizeImageMediaType = (mediaType: string | null) => {
  const normalized = mediaType?.toLowerCase();

  if (normalized === "image/jpg") {
    return "image/jpeg";
  }

  return normalized === "image/png" || normalized === "image/jpeg"
    ? normalized
    : null;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
};

const isSupportedImageBytes = (bytes: Uint8Array, mediaType: string | null) => {
  if (mediaType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  if (mediaType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  return false;
};

const createImageDataUri = (
  entry: Readonly<HWPXPackageEntry> | null,
  mediaType: string | null
) => {
  const normalizedMediaType = normalizeImageMediaType(mediaType);

  if (!entry || !normalizedMediaType || !entry.bytes.length) {
    return null;
  }

  if (entry.bytes.length > MAX_IMPORT_IMAGE_BYTES) {
    return null;
  }

  if (!isSupportedImageBytes(entry.bytes, normalizedMediaType)) {
    return null;
  }

  return `data:${normalizedMediaType};base64,${bytesToBase64(entry.bytes)}`;
};

const pushImageMetadataOnlyLoss = (
  context: ImportContext,
  entry: string,
  path: string,
  reason: string
) => {
  pushLoss(context, {
    category: "image",
    code: "hwpx-import-image-metadata-only",
    severity: "warning",
    message: `HWPX image import restores metadata only: ${reason}.`,
    entry,
    path
  });
};

const parseShapeCommentMetadata = (shapeComment: string | null) => {
  const trimmed = shapeComment?.trim() ?? "";

  if (!trimmed) {
    return {
      title: null,
      altText: null,
      description: null
    };
  }

  const [rawTitle, ...rawAltLines] = trimmed.split(/\r?\n/);
  const title = rawTitle?.trim() || null;
  const altText = rawAltLines.join("\n").trim() || title;

  return {
    title,
    altText,
    description: trimmed
  };
};

const parseImageObject = (
  pic: Readonly<HWPXXmlNode>,
  context: ImportContext,
  packageEntryMap: ReadonlyMap<string, Readonly<HWPXPackageEntry>>,
  entry: string,
  path: string
): IRObjectBlock => {
  const image = firstDescendantNamed(pic, "img");
  const binaryItemIDRef = image?.attrs.binaryItemIDRef ?? null;
  const contentItem =
    binaryItemIDRef === null ? null : context.contentItems.get(binaryItemIDRef);
  const size = firstDescendantNamed(pic, "sz");
  const orgSize = firstDescendantNamed(pic, "orgSz");
  const binaryEntryPath = contentItem?.href ?? null;
  const binaryEntry =
    binaryEntryPath === null ? null : packageEntryMap.get(binaryEntryPath) ?? null;
  const hasBinaryEntry = Boolean(binaryEntry);
  const shapeComment = firstDescendantNamed(pic, "shapeComment");
  const shapeCommentText = shapeComment ? textContent(shapeComment) : null;
  const shapeCommentMetadata = parseShapeCommentMetadata(shapeCommentText);
  const normalizedMediaType = normalizeImageMediaType(
    contentItem?.mediaType ?? null
  );
  const dataUri = createImageDataUri(binaryEntry, contentItem?.mediaType ?? null);

  if (!contentItem) {
    pushLoss(context, {
      category: "image",
      code: "hwpx-import-image-metadata-loss",
      severity: "warning",
      message:
        "HWPX image binaryItemIDRef could not be resolved from content.hpf.",
      entry,
      path
    });
  } else if (!binaryEntry) {
    pushLoss(context, {
      category: "image",
      code: "hwpx-import-image-metadata-loss",
      severity: "warning",
      message: "HWPX image BinData package entry could not be found.",
      entry,
      path
    });
  } else if (!normalizedMediaType) {
    pushImageMetadataOnlyLoss(
      context,
      entry,
      path,
      `unsupported media type '${contentItem.mediaType ?? ""}'`
    );
  } else if (binaryEntry.bytes.length > MAX_IMPORT_IMAGE_BYTES) {
    pushImageMetadataOnlyLoss(
      context,
      entry,
      path,
      `binary size ${binaryEntry.bytes.length} exceeds ${MAX_IMPORT_IMAGE_BYTES} bytes`
    );
  } else if (!isSupportedImageBytes(binaryEntry.bytes, normalizedMediaType)) {
    pushImageMetadataOnlyLoss(
      context,
      entry,
      path,
      "binary signature does not match a supported PNG/JPEG image"
    );
  }

  return {
    type: "object",
    objectType: "image",
    flowMode: "block",
    anchorMode: "paragraph",
    attrs: {
      objectId: binaryItemIDRef ?? pic.attrs.id ?? null,
      binaryItemIDRef,
      src: dataUri ?? binaryEntryPath,
      hwpxBinDataPath: binaryEntryPath,
      fileName: fileNameFromHref(binaryEntryPath),
      mimeType: normalizedMediaType ?? contentItem?.mediaType ?? null,
      isEmbedded: contentItem?.isEmbedded ?? null,
      hasBinaryEntry,
      binaryRestored: Boolean(dataUri),
      binarySize: binaryEntry?.bytes.length ?? null,
      widthHwpUnit: numberAttr(size, "width"),
      heightHwpUnit: numberAttr(size, "height"),
      intrinsicWidthHwpUnit: numberAttr(orgSize, "width"),
      intrinsicHeightHwpUnit: numberAttr(orgSize, "height"),
      shapeComment: shapeCommentText,
      title: shapeCommentMetadata.title,
      altText: shapeCommentMetadata.altText,
      description: shapeCommentMetadata.description
    },
    children: []
  } satisfies IRObjectBlock;
};

const parseSectionBlocks = (
  sectionRoot: Readonly<HWPXXmlNode>,
  context: ImportContext,
  packageEntryMap: ReadonlyMap<string, Readonly<HWPXPackageEntry>>,
  entry: string
) => {
  const sectionElement =
    sectionRoot.children.find((child) => isNodeNamed(child, "sec")) ??
    sectionRoot;
  const blocks: IRBlock[] = [];
  let pendingList: IRListBlock | null = null;
  let pendingListSignature: string | null = null;

  const flushList = () => {
    if (pendingList) {
      blocks.push(pendingList);
      pendingList = null;
      pendingListSignature = null;
    }
  };

  const appendListParagraph = (
    info: HWPXListParagraphInfo,
    paragraph: IRParagraphBlock,
    path: string
  ) => {
    const signature = listSignature(info);

    if (!pendingList || pendingListSignature !== signature) {
      flushList();
      pendingList = createListBlock(info);
      pendingListSignature = signature;
    }

    noteListPartialLoss(info, context, entry, path);
    pendingList.items.push(
      createListItem(info, paragraph, pendingList.items.length + 1)
    );
  };

  childrenNamed(sectionElement, "p").forEach((p, paragraphIndex) => {
    const paragraphPath = `sections[0].blocks[${paragraphIndex}]`;

    if (hasDescendant(p, "secPr")) {
      return;
    }

    const tables = descendantsNamed(p, "tbl");
    const pictures = descendantsNamed(p, "pic");

    if (tables.length || pictures.length) {
      flushList();
      tables.forEach((table, tableIndex) => {
        blocks.push(
          parseTableBlock(
            table,
            context,
            entry,
            `${paragraphPath}.tables[${tableIndex}]`
          )
        );
      });
      pictures.forEach((pic, pictureIndex) => {
        blocks.push(
          parseImageObject(
            pic,
            context,
            packageEntryMap,
            entry,
            `${paragraphPath}.pictures[${pictureIndex}]`
          )
        );
      });
      return;
    }

    const listInfo = getListParagraphInfo(p, context);

    if (listInfo) {
      const listParagraph = parseParagraphAsParagraphBlock(
        p,
        context,
        entry,
        paragraphPath
      );

      if (listParagraph) {
        appendListParagraph(listInfo, listParagraph, paragraphPath);
      }
      return;
    }

    flushList();
    const block = parseParagraphBlock(p, context, entry, paragraphPath);

    if (block) {
      blocks.push(block);
    }
  });

  flushList();

  return blocks;
};

const createEmptyIRDocument = (
  extractedAt: string,
  warnings: readonly Readonly<HWPXImportWarning>[]
): IRDocument =>
  ({
    type: "document",
    version: "ir-v1.1-draft",
    metadata: {
      extractedAt,
      extractorVersion: "hwpx-import-foundation-parser-only-v1",
      source: {
        editor: "tiptap-prosemirror",
        mode: "readonly-snapshot"
      },
      warnings: warnings.map((item) => item.message)
    },
    sections: [
      {
        type: "section",
        id: "hwpx-section-0",
        breakType: "unknown",
        pageSettings: { ...DEFAULT_PAGE_SETTINGS },
        blocks: []
      } satisfies IRSection
    ]
  } satisfies IRDocument);

const buildLossReport = (
  losses: readonly Readonly<HWPXImportLossReportEntry>[]
): Readonly<HWPXImportLossReport> => {
  const summary = losses.reduce(
    (current, loss) => ({
      total: current.total + 1,
      warningCount:
        current.warningCount + (loss.severity === "warning" ? 1 : 0),
      errorCount: current.errorCount + (loss.severity === "error" ? 1 : 0),
      styleLossCount:
        current.styleLossCount + (loss.category === "style" ? 1 : 0),
      listPartialCount:
        current.listPartialCount + (loss.category === "list" ? 1 : 0),
      tablePartialCount:
        current.tablePartialCount + (loss.category === "table" ? 1 : 0),
      imageMetadataOnlyCount:
        current.imageMetadataOnlyCount +
        (loss.code === "hwpx-import-image-metadata-only" ? 1 : 0),
      unsupportedCount:
        current.unsupportedCount + (loss.category === "unsupported" ? 1 : 0)
    }),
    {
      total: 0,
      warningCount: 0,
      errorCount: 0,
      styleLossCount: 0,
      listPartialCount: 0,
      tablePartialCount: 0,
      imageMetadataOnlyCount: 0,
      unsupportedCount: 0
    }
  );

  return Object.freeze({
    entries: freezeArray(losses),
    summary: Object.freeze(summary)
  });
};

const makePackageLosses = (
  warnings: readonly Readonly<HWPXImportWarning>[]
): readonly Readonly<HWPXImportLossReportEntry>[] =>
  warnings.map((item) =>
    Object.freeze({
      category:
        item.code === "hwpx-import-xml-warning" ||
        item.code === "hwpx-import-xml-error"
          ? "xml"
          : "package",
      code: item.code,
      severity: item.severity,
      message: item.message,
      entry: item.entry,
      path: item.path
    } satisfies HWPXImportLossReportEntry)
  );

export const importHWPXToIR = (
  packageBytes: Uint8Array,
  options: HWPXImportOptions = {}
): Readonly<HWPXImportResult> => {
  const extractedAt = options.extractedAt ?? new Date().toISOString();
  const packageResult = readHWPXPackageFromBytes(packageBytes, options);
  const warnings = [...packageResult.warnings];
  const contentHpfRoot = packageResult.entryMap.get("Contents/content.hpf")
    ? parseXmlEntry(packageResult.entryMap.get("Contents/content.hpf")!, warnings)
    : null;
  const headerRoot = packageResult.entryMap.get("Contents/header.xml")
    ? parseXmlEntry(packageResult.entryMap.get("Contents/header.xml")!, warnings)
    : null;
  const context: ImportContext = {
    warnings,
    losses: [...makePackageLosses(warnings)],
    lossKeys: new Set(),
    contentItems: parseContentItems(contentHpfRoot),
    headerModel: parseHeaderModel(headerRoot),
    noteReferences: [],
    noteBodies: [],
    noteDisplayCounters: { footnote: 0, endnote: 0 }
  };
  const sectionEntries = packageResult.packageSummary.sectionEntries.length
    ? packageResult.packageSummary.sectionEntries
    : ["Contents/section0.xml"].filter((path) =>
        packageResult.entryMap.has(path)
      );
  const sectionRoots = new Map(
    sectionEntries.map((sectionPath) => {
      const sectionEntry = packageResult.entryMap.get(sectionPath);

      return [
        sectionPath,
        sectionEntry ? parseXmlEntry(sectionEntry, context.warnings) : null
      ] as const;
    })
  );
  const intakeObservation = createIntakeObservation(
    packageResult,
    [
      { entry: "Contents/content.hpf", root: contentHpfRoot },
      { entry: "Contents/header.xml", root: headerRoot },
      ...Array.from(sectionRoots.entries()).map(([entry, root]) => ({
        entry,
        root
      }))
    ],
    context.contentItems
  );

  noteIntakeObservationLosses(
    context,
    packageResult.packageSummary,
    intakeObservation
  );
  if (!sectionEntries.length) {
    const lossReport = buildLossReport(context.losses);
    const intakeReport = buildIntakeReport(
      packageResult,
      context.contentItems,
      context.headerModel,
      intakeObservation,
      context.warnings
    );

    return Object.freeze({
      irDocument: createEmptyIRDocument(extractedAt, context.warnings),
      warnings: freezeArray(context.warnings),
      lossReport,
      packageSummary: packageResult.packageSummary,
      intakeReport
    });
  }

  const sections = sectionEntries.map((sectionPath, sectionIndex) => {
    const sectionEntry = packageResult.entryMap.get(sectionPath);
    const sectionRoot = sectionRoots.get(sectionPath) ?? null;

    if (!sectionEntry || !sectionRoot) {
      pushLoss(context, {
        category: "xml",
        code: "hwpx-import-xml-error",
        severity: "error",
        message: `Section XML could not be parsed: ${sectionPath}.`,
        entry: sectionPath
      });

      return {
        type: "section",
        id: `hwpx-section-${sectionIndex}`,
        breakType: "unknown",
        pageSettings: { ...DEFAULT_PAGE_SETTINGS },
        blocks: []
      } satisfies IRSection;
    }

    return {
      type: "section",
      id: `hwpx-section-${sectionIndex}`,
      breakType: "unknown",
      pageSettings: parsePageSettings(sectionRoot),
      blocks: mutableArray(
        parseSectionBlocks(
          sectionRoot,
          context,
          packageResult.entryMap,
          sectionPath
        )
      )
    } satisfies IRSection;
  });
  sectionEntries.forEach((sectionPath) => {
    const root = sectionRoots.get(sectionPath);
    if (root) parseNativeNoteBodies(root, context, sectionPath);
  });
  validateNativeNotePolicies(headerRoot, sectionRoots, context);
  const noteReferenceIds = new Set<string>();
  const noteReferenceInstIds = new Set<number>();
  const noteBodyIds = new Set<string>();
  const noteBodyInstIds = new Set<number>();
  const noteBodiesById = new Map<string, IRNoteBody>();
  context.noteReferences.forEach((reference, referenceOrder) => {
    if (
      noteReferenceIds.has(reference.noteId) ||
      noteReferenceInstIds.has(reference.instId)
    ) {
      pushNativeNoteLoss(
        context,
        "hwpx-import-note-pair-invalid",
        `HWPX native note reference identity is duplicated: ${reference.instId}.`,
        sectionEntries[0]
      );
    }
    noteReferenceIds.add(reference.noteId);
    noteReferenceInstIds.add(reference.instId);
    const body = context.noteBodies.find(
      (candidate) =>
        candidate.noteId === reference.noteId &&
        candidate.kind === reference.kind &&
        candidate.instId === reference.instId
    );
    if (!body) {
      pushNativeNoteLoss(
        context,
        "hwpx-import-note-pair-invalid",
        `HWPX native note reference has no matching body: ${reference.noteId}.`,
        sectionEntries[0]
      );
      return;
    }
    noteBodiesById.set(reference.noteId, {
      noteId: body.noteId,
      kind: body.kind,
      referenceOrder,
      paragraphs: body.paragraphs
    });
  });
  context.noteBodies.forEach((body) => {
    const duplicate =
      noteBodyIds.has(body.noteId) || noteBodyInstIds.has(body.instId);
    noteBodyIds.add(body.noteId);
    noteBodyInstIds.add(body.instId);
    if (!noteReferenceIds.has(body.noteId) || duplicate) {
      pushNativeNoteLoss(
        context,
        "hwpx-import-note-pair-invalid",
        `HWPX native note body is orphaned or duplicated: ${body.noteId}.`,
        sectionEntries[0]
      );
    }
  });
  const lossReport = buildLossReport(context.losses);
  const intakeReport = buildIntakeReport(
    packageResult,
    context.contentItems,
    context.headerModel,
    intakeObservation,
    context.warnings
  );
  const irDocument: IRDocument = {
    type: "document",
    version: "ir-v1.1-draft",
    metadata: {
      extractedAt,
      extractorVersion: "hwpx-import-foundation-parser-only-v1",
      source: {
        editor: "tiptap-prosemirror",
        mode: "readonly-snapshot"
      },
      warnings: context.warnings.map((item) => item.message)
    },
    sections,
    ...(context.noteReferences.length || context.noteBodies.length
      ? context.losses.some((loss) => loss.code.startsWith("hwpx-import-note-") && loss.severity === "error")
        ? {}
        : { notes: Array.from(noteBodiesById.values()).sort((left, right) => left.referenceOrder - right.referenceOrder) }
      : {})
  };

  return Object.freeze({
    irDocument,
    warnings: freezeArray(context.warnings),
    lossReport,
    packageSummary: packageResult.packageSummary,
    intakeReport
  });
};
