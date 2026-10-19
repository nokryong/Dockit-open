export type IRMarkType =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "link"
  | "textStyle"
  | "highlight"
  | "subscript"
  | "superscript"
  | "inlineTag"
  | "unknown";

export interface IRMark {
  type: IRMarkType;
  attrs?: Record<string, unknown>;
}

export interface IRTextRun {
  type: "textRun";
  text: string;
  marks: IRMark[];
}

export interface IRHardBreak {
  type: "hardBreak";
}

export type IRNoteKind = "footnote" | "endnote";

/** A document-flow marker which points to a document-owned note body. */
export interface IRNoteReference {
  type: "noteReference";
  noteId: string;
  kind: IRNoteKind;
}

export type IRInlineNode = IRTextRun | IRHardBreak | IRNoteReference;
export type IRNoteInlineNode = IRTextRun | IRHardBreak;

export interface IRNoteParagraph {
  type: "paragraph";
  attrs?: Record<string, unknown>;
  runs: IRNoteInlineNode[];
}

/**
 * Note bodies deliberately live on IRDocument rather than in section.blocks:
 * native formats own them separately from ordinary document flow.
 */
export interface IRNoteBody {
  noteId: string;
  kind: IRNoteKind;
  referenceOrder: number;
  paragraphs: IRNoteParagraph[];
}

export interface IRPaginationMetadata {
  source: "pagination-page-map";
  pageMapVersion: number | null;
  blockIndex: number | null;
  blockPos: number | null;
  blockType: string | null;
  pageNumbers: readonly number[];
  startPage: number | null;
  endPage: number | null;
  pageCount: number;
  spansPages: boolean;
  startsWithContinuation: boolean;
  endsWithContinuation: boolean;
  breakReasons: readonly string[];
  segmentKinds: readonly string[];
  segmentCount: number;
  hasMergedTableRows: boolean;
  hasTooTallTableRows: boolean;
}

export interface IRBlockPaginationHints {
  keepWithNext?: boolean | null;
  keepLinesTogether?: boolean | null;
  pageBreakBefore?: boolean | null;
  widows?: number | null;
  orphans?: number | null;
}

export interface IRDOCXParagraphTabStop {
  positionTwips: number;
  type: string | null;
  leader: string | null;
}

export interface IRParagraphBlock extends IRBlockPaginationHints {
  type: "paragraph";
  pagination?: Readonly<IRPaginationMetadata>;
  attrs: {
    textAlign?: string | null;
    lineHeight?: number | string | null;
    fontSize?: number | null;
    indent?: number | string | null;
    indentLevel?: number | null;
    wordBreak?: string | null;
    docxParagraphSpacingBefore?: number | null;
    docxParagraphSpacingAfter?: number | null;
    docxParagraphSpacingLine?: number | null;
    docxParagraphSpacingLineRule?: string | null;
    docxParagraphStyleId?: string | null;
    docxParagraphStyleName?: string | null;
    docxParagraphTabs?: readonly Readonly<IRDOCXParagraphTabStop>[] | null;
  };
  runs: IRInlineNode[];
}

export interface IRHeadingBlock extends IRBlockPaginationHints {
  type: "heading";
  pagination?: Readonly<IRPaginationMetadata>;
  attrs: {
    level?: number | null;
    textAlign?: string | null;
    headingId?: string | null;
    lineHeight?: number | string | null;
    indent?: number | string | null;
    indentLevel?: number | null;
    wordBreak?: string | null;
    docxParagraphSpacingBefore?: number | null;
    docxParagraphSpacingAfter?: number | null;
    docxParagraphSpacingLine?: number | null;
    docxParagraphSpacingLineRule?: string | null;
    docxParagraphStyleId?: string | null;
    docxParagraphStyleName?: string | null;
    docxParagraphTabs?: readonly Readonly<IRDOCXParagraphTabStop>[] | null;
  };
  runs: IRInlineNode[];
}

export type IRObjectFlowMode =
  | "inline"
  | "block"
  | "floating"
  | "behindText"
  | "inFrontOfText"
  | "unknown";

export type IRObjectAnchorMode =
  | "inline"
  | "paragraph"
  | "page"
  | "column"
  | "character"
  | "unknown";

export interface IRObjectPlacementHints {
  flowMode?: IRObjectFlowMode | null;
  anchorMode?: IRObjectAnchorMode | null;
}

export interface IRObjectBlock extends IRObjectPlacementHints {
  type: "object";
  pagination?: Readonly<IRPaginationMetadata>;
  objectType: string;
  attrs: Record<string, unknown>;
  children?: IRBlock[];
}

export interface IRListItem {
  type: "listItem";
  attrs: Record<string, unknown>;
  blocks: IRBlock[];
}

export interface IRListBlock {
  type: "list";
  pagination?: Readonly<IRPaginationMetadata>;
  listType: "bullet" | "ordered" | "task" | "unknown";
  attrs: Record<string, unknown>;
  items: IRListItem[];
}

export interface IRTableCell {
  type: "tableCell";
  role: "header" | "cell";
  attrs: {
    colspan?: number;
    rowspan?: number;
    colwidth?: number[] | null;
    docxCellWidthType?: string | null;
    docxCellWidthValue?: number | null;
    docxCellMarginTop?: number | null;
    docxCellMarginTopType?: string | null;
    docxCellMarginBottom?: number | null;
    docxCellMarginBottomType?: string | null;
    docxCellMarginLeft?: number | null;
    docxCellMarginLeftType?: string | null;
    docxCellMarginRight?: number | null;
    docxCellMarginRightType?: string | null;
    docxCellNoWrap?: boolean | null;
    verticalAlign?: string | null;
    backgroundColor?: string | null;
    borderColor?: string | null;
    borderStyle?: string | null;
    borderWidth?: number | string | null;
    borderTopColor?: string | null;
    borderTopStyle?: string | null;
    borderTopWidth?: number | string | null;
    borderRightColor?: string | null;
    borderRightStyle?: string | null;
    borderRightWidth?: number | string | null;
    borderBottomColor?: string | null;
    borderBottomStyle?: string | null;
    borderBottomWidth?: number | string | null;
    borderLeftColor?: string | null;
    borderLeftStyle?: string | null;
    borderLeftWidth?: number | string | null;
    wordBreak?: string | null;
  };
  blocks: IRBlock[];
}

export interface IRTableRow {
  type: "tableRow";
  attrs: {
    height?: number | null;
    docxTableHeaderRepeat?: boolean | null;
    docxRowCantSplit?: boolean | null;
  };
  cells: IRTableCell[];
}

export interface IRTablePaginationHints {
  headerRowRepeat?: boolean | null;
  allowRowSplit?: boolean | null;
}

export interface IRTableBlock extends IRTablePaginationHints {
  type: "table";
  pagination?: Readonly<IRPaginationMetadata>;
  attrs: {
    headerColor?: string | null;
    borderColor?: string | null;
    borderStyle?: string | null;
    borderWidth?: number | string | null;
    borderTopColor?: string | null;
    borderTopStyle?: string | null;
    borderTopWidth?: number | string | null;
    borderRightColor?: string | null;
    borderRightStyle?: string | null;
    borderRightWidth?: number | string | null;
    borderBottomColor?: string | null;
    borderBottomStyle?: string | null;
    borderBottomWidth?: number | string | null;
    borderLeftColor?: string | null;
    borderLeftStyle?: string | null;
    borderLeftWidth?: number | string | null;
    objectId?: string | null;
    cellPaddingTop?: number | null;
    cellPaddingBottom?: number | null;
    cellPaddingLeft?: number | null;
    cellPaddingRight?: number | null;
    docxTableWidthType?: string | null;
    docxTableWidthValue?: number | null;
    docxTableLayoutType?: string | null;
    docxTableJustification?: string | null;
    docxTableCellMarginTop?: number | null;
    docxTableCellMarginTopType?: string | null;
    docxTableCellMarginBottom?: number | null;
    docxTableCellMarginBottomType?: string | null;
    docxTableCellMarginLeft?: number | null;
    docxTableCellMarginLeftType?: string | null;
    docxTableCellMarginRight?: number | null;
    docxTableCellMarginRightType?: string | null;
    indent?: number | string | null;
    indentLevel?: number | null;
  };
  rows: IRTableRow[];
}

export interface IRUnsupportedBlock {
  type: "unsupported";
  pagination?: Readonly<IRPaginationMetadata>;
  nodeType: string;
  attrs: Record<string, unknown>;
  raw?: unknown;
}

/**
 * Original top-level ProseMirror index used to align PageMap assignments.
 *
 * Note bodies are document-owned IR data rather than section blocks, so a
 * note-bearing document can otherwise leave holes between the remaining flow
 * blocks and their source indices. Nested blocks and native imports omit it.
 */
export interface IRBlockSourceMetadata {
  sourceBlockIndex?: number;
}

export type IRBlock = (
  | IRParagraphBlock
  | IRHeadingBlock
  | IRListBlock
  | IRTableBlock
  | IRObjectBlock
  | IRUnsupportedBlock
) & IRBlockSourceMetadata;

export interface IRPageSettings {
  widthMm: number;
  heightMm: number;
  paddingTopMm: number;
  paddingBottomMm: number;
  paddingLeftMm: number;
  paddingRightMm: number;
  lineHeight: number;
}

export type IRSectionBreakType =
  | "continuous"
  | "nextPage"
  | "evenPage"
  | "oddPage"
  | "unknown";

export interface IRSection {
  type: "section";
  id: string;
  breakType?: IRSectionBreakType | null;
  pageSettings: IRPageSettings;
  blocks: IRBlock[];
}

export interface IRMetadata {
  extractedAt: string;
  extractorVersion: string;
  source: {
    editor: "tiptap-prosemirror" | "hwpx" | "docx";
    mode: "readonly-snapshot" | "import-snapshot";
  };
  warnings: string[];
}

export interface IRDocument {
  type: "document";
  version: "ir-v1.1-draft";
  metadata: IRMetadata;
  sections: IRSection[];
  notes?: readonly IRNoteBody[];
}
