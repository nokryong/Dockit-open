import type { IRBlock, IRDocument, IRInlineNode, IRMark } from "./types";
import { normalizeListNumbering } from "./listNumberingModel";
import { normalizeObjectModel } from "./objectModel";
import { normalizeTableModel } from "./tableModel";

export type IRExportReadinessStatus = "ready" | "partial" | "blocked";

export interface IRExportReadinessBlockReport {
  sectionIndex: number;
  blockIndex: number;
  blockType: IRBlock["type"];
  exportStatus: IRExportReadinessStatus;
  supported: readonly string[];
  gaps: readonly string[];
  pageMetadataUses: readonly string[];
}

export interface IRExportReadinessReport {
  overallStatus: IRExportReadinessStatus;
  blockCount: number;
  blocks: readonly IRExportReadinessBlockReport[];
  supportedByBlockType: Readonly<Record<string, readonly string[]>>;
  gapsByBlockType: Readonly<Record<string, readonly string[]>>;
  pageMetadataUses: readonly string[];
}

const freezeList = <T>(items: readonly T[]) => Object.freeze([...items]);

const BLOCK_SUPPORT = Object.freeze({
  paragraph: freezeList([
    "export-neutral style model v1",
    "text block style normalization",
    "text run style normalization",
    "text runs",
    "basic marks",
    "textAlign",
    "lineHeight",
    "fontSize",
    "indent",
    "indentLevel",
    "wordBreak",
    "keepWithNext",
    "keepLinesTogether",
    "pageBreakBefore",
    "widows",
    "orphans"
  ]),
  heading: freezeList([
    "export-neutral style model v1",
    "text block style normalization",
    "text run style normalization",
    "text runs",
    "basic marks",
    "level",
    "headingId",
    "textAlign",
    "lineHeight",
    "indent",
    "indentLevel",
    "wordBreak",
    "keepWithNext",
    "pageBreakBefore"
  ]),
  list: freezeList([
    "export-neutral style model v1",
    "listType",
    "list numbering model v1",
    "list marker style summary",
    "marker kind",
    "marker format",
    "start number",
    "depth/level summary",
    "listItem structure",
    "nested paragraph blocks",
    "basic nested marks"
  ]),
  table: freezeList([
    "export-neutral style model v1",
    "table model v1",
    "rows",
    "cells",
    "header cells",
    "colspan",
    "rowspan",
    "colwidth",
    "table grid model v1",
    "column width summary",
    "grid placement metadata",
    "row height",
    "cell verticalAlign",
    "cell backgroundColor",
    "cell wordBreak",
    "table borderColor",
    "table borderStyle",
    "table borderWidth",
    "per-side table borders",
    "per-side cell borders",
    "cell padding",
    "headerRowRepeat hint",
    "allowRowSplit hint"
  ]),
  object: freezeList([
    "export-neutral style model v1",
    "objectType",
    "object model v1",
    "object kind",
    "flowMode",
    "anchorMode",
    "size unit normalization",
    "position unit normalization",
    "media relationship candidates",
    "alt/title metadata candidates",
    "link metadata candidates",
    "caption metadata candidates",
    "raw attrs",
    "children"
  ]),
  unsupported: freezeList(["raw node attrs"])
});

const BLOCK_GAPS = Object.freeze({
  paragraph: freezeList([
    "block-level font family is not normalized",
    "spacing before/after is not modeled",
    "tabs are not modeled",
    "style id/class mapping is not modeled",
    "line-level split geometry is not export-ready"
  ]),
  heading: freezeList([
    "outline level/style mapping is incomplete",
    "numbered heading metadata is not modeled",
    "block-level font family is not normalized",
    "spacing before/after is not modeled"
  ]),
  list: freezeList([
    "numbering definition id is not stable",
    "nested list restart policy is adapter-defined",
    "custom marker style is not modeled",
    "task checkbox export semantics are partial",
    "nested item page metadata is not attached"
  ]),
  table: freezeList([
    "table preferred width is not modeled",
    "border conflict resolution is adapter-defined",
    "cell merge export requires row-group normalization",
    "row split policy is only a hint",
    "repeated header runtime rendering is not implemented",
    "nested cell block page metadata is not attached"
  ]),
  object: freezeList([
    "export relationship id is candidate-only",
    "wrap offsets are not fully normalized",
    "image binary/blob part is not created",
    "caption relationship is not resolved against captionBlock",
    "shape/chart/diagram exporters are not defined"
  ]),
  unsupported: freezeList(["block type has no export mapping"])
});

const PAGE_METADATA_USES = freezeList([
  "choose page break insertion points",
  "detect blocks spanning pages",
  "preserve continuation-aware QA assertions",
  "flag table row fallback cases",
  "diagnose merged-row pagination boundaries"
]);

const unique = (items: readonly string[]) =>
  freezeList(Array.from(new Set(items)));

const getRunsFromInlineNodes = (inlineNodes: readonly IRInlineNode[] = []) =>
  inlineNodes.filter((inlineNode) => inlineNode.type === "textRun");

const collectMarkGaps = (marks: readonly IRMark[] = []) => {
  const gaps: string[] = [];

  marks.forEach((mark) => {
    if (mark.type === "unknown") {
      gaps.push("unknown text mark requires export fallback");
    }

    if (mark.type === "inlineTag") {
      gaps.push("inlineTag visual style has no external format mapping");
    }
  });

  return gaps;
};

const collectInlineGaps = (inlineNodes: readonly IRInlineNode[] = []) =>
  getRunsFromInlineNodes(inlineNodes).flatMap((run) =>
    collectMarkGaps(run.marks)
  );

const getBlockSpecificGaps = (block: IRBlock) => {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return collectInlineGaps(block.runs);
    case "list":
      const numberingModel = normalizeListNumbering(block);
      return [
        ...numberingModel.unsupported,
        ...numberingModel.levels.flatMap((level) => level.unsupported),
        ...numberingModel.items.flatMap((item) => item.unsupported)
      ];
    case "table":
      const tableModel = normalizeTableModel(block);
      return [
        ...tableModel.unsupported,
        ...tableModel.columns.flatMap((column) => column.unsupported),
        ...tableModel.cells.flatMap((cell) => cell.unsupported),
        ...block.rows.flatMap((row) =>
          row.cells.flatMap((cell) =>
            cell.blocks.flatMap((cellBlock) =>
              cellBlock.type === "paragraph" || cellBlock.type === "heading"
                ? collectInlineGaps(cellBlock.runs)
                : []
            )
          )
        )
      ];
    case "object":
      const objectModel = normalizeObjectModel(block);
      return objectModel.unsupported;
    case "unsupported":
      return [`unsupported node type: ${block.nodeType}`];
    default:
      return [];
  }
};

const getPageMetadataUses = (block: IRBlock) => {
  if (!block.pagination) {
    return [];
  }

  const uses = [
    "map block to page range",
    "detect page-spanning block",
    "read break reasons"
  ];

  if (block.pagination.hasMergedTableRows) {
    uses.push("audit merged table row group");
  }

  if (block.pagination.hasTooTallTableRows) {
    uses.push("audit oversized table row fallback");
  }

  return uses;
};

const getBlockStatus = (
  block: IRBlock,
  gaps: readonly string[]
): IRExportReadinessStatus => {
  if (block.type === "unsupported") {
    return "blocked";
  }

  return gaps.length > 0 ? "partial" : "ready";
};

const createBlockReport = (
  block: IRBlock,
  sectionIndex: number,
  blockIndex: number
): IRExportReadinessBlockReport => {
  const staticGaps = BLOCK_GAPS[block.type] || [];
  const gaps = unique([...staticGaps, ...getBlockSpecificGaps(block)]);
  const pageMetadataUses = freezeList(getPageMetadataUses(block));

  return Object.freeze({
    sectionIndex,
    blockIndex,
    blockType: block.type,
    exportStatus: getBlockStatus(block, gaps),
    supported: BLOCK_SUPPORT[block.type] || [],
    gaps,
    pageMetadataUses
  });
};

const getOverallStatus = (
  blocks: readonly IRExportReadinessBlockReport[]
): IRExportReadinessStatus => {
  if (blocks.some((block) => block.exportStatus === "blocked")) {
    return "blocked";
  }

  if (blocks.some((block) => block.exportStatus === "partial")) {
    return "partial";
  }

  return "ready";
};

export const auditIRExportReadiness = (
  irDocument: IRDocument
): IRExportReadinessReport => {
  const blocks = freezeList(
    irDocument.sections.flatMap((section, sectionIndex) =>
      section.blocks.map((block, blockIndex) =>
        createBlockReport(block, sectionIndex, blockIndex)
      )
    )
  );

  return Object.freeze({
    overallStatus: getOverallStatus(blocks),
    blockCount: blocks.length,
    blocks,
    supportedByBlockType: BLOCK_SUPPORT,
    gapsByBlockType: BLOCK_GAPS,
    pageMetadataUses: PAGE_METADATA_USES
  });
};
