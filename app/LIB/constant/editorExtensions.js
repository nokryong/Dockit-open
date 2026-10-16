import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Blockquote from "@tiptap/extension-blockquote";
import CodeBlock from "@tiptap/extension-code-block";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Link from "@tiptap/extension-link";
import {
  BulletList,
  ListItem,
  OrderedList,
  TaskItem,
  TaskList
} from "@tiptap/extension-list";
import { TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { mergeAttributes } from "@tiptap/core";

const TABLE_BORDER_SIDES = ["top", "right", "bottom", "left"];

const capitalizeBorderSide = (side) => side.charAt(0).toUpperCase() + side.slice(1);

const normalizeTableStyleValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value).trim() || null;
};

const getTableBorderWidthCss = (value) => {
  const normalized = normalizeTableStyleValue(value);

  if (!normalized) {
    return null;
  }

  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? `${normalized}pt` : normalized;
};

const createTableCellBorderAttr = (cssName) => ({
  default: null,
  parseHTML: (el) => normalizeTableStyleValue(el.style[cssName]),
  renderHTML: () => ({})
});

const getBorderCssValue = (attrs, side = null) => {
  const sidePart = side ? capitalizeBorderSide(side) : "";
  const color =
    normalizeTableStyleValue(attrs[`border${sidePart}Color`]) ||
    normalizeTableStyleValue(attrs.borderColor);
  const style =
    normalizeTableStyleValue(attrs[`border${sidePart}Style`]) ||
    normalizeTableStyleValue(attrs.borderStyle);
  const width =
    getTableBorderWidthCss(attrs[`border${sidePart}Width`]) ||
    getTableBorderWidthCss(attrs.borderWidth);

  if (!color && !style && !width) {
    return null;
  }

  return `${width || "var(--table-border-width, 1pt)"} ${
    style || "var(--table-border-style, solid)"
  } ${color || "var(--table-border, #000)"}`;
};

const buildTableCellStyle = (attrs) => {
  const styles = [];
  const backgroundColor = normalizeTableStyleValue(attrs.backgroundColor);

  if (attrs.verticalAlign) {
    styles.push(`vertical-align: ${attrs.verticalAlign}`);
  }

  if (backgroundColor) {
    styles.push(`--table-cell-bg: ${backgroundColor}`);
    styles.push(`background-color: ${backgroundColor}`);
  }

  TABLE_BORDER_SIDES.forEach((side) => {
    const borderValue = getBorderCssValue(attrs, side);

    if (borderValue) {
      styles.push(`--table-cell-border-${side}: ${borderValue}`);
      styles.push(`border-${side}: ${borderValue}`);
    }
  });

  return styles.length > 0 ? { style: styles.join("; ") } : {};
};

const mergeTableCellStyleAttributes = (htmlAttrs, cellAttrs) => {
  const cellStyle = buildTableCellStyle(cellAttrs).style;
  const style = [htmlAttrs.style, cellStyle].filter(Boolean).join("; ");

  return {
    ...htmlAttrs,
    ...(style ? { style } : {})
  };
};

// verticalAlign/backgroundColor 속성 추가 (셀 세로 정렬/배경색)
const tableCellStyleAttributes = {
  verticalAlign: {
    default: null,
    parseHTML: (el) => el.style.verticalAlign || null,
    renderHTML: () => ({})
  },
  backgroundColor: {
    default: null,
    parseHTML: (el) => el.style.backgroundColor || null,
    renderHTML: () => ({})
  },
  borderColor: createTableCellBorderAttr("borderColor"),
  borderStyle: createTableCellBorderAttr("borderStyle"),
  borderWidth: createTableCellBorderAttr("borderWidth"),
  borderTopColor: createTableCellBorderAttr("borderTopColor"),
  borderTopStyle: createTableCellBorderAttr("borderTopStyle"),
  borderTopWidth: createTableCellBorderAttr("borderTopWidth"),
  borderRightColor: createTableCellBorderAttr("borderRightColor"),
  borderRightStyle: createTableCellBorderAttr("borderRightStyle"),
  borderRightWidth: createTableCellBorderAttr("borderRightWidth"),
  borderBottomColor: createTableCellBorderAttr("borderBottomColor"),
  borderBottomStyle: createTableCellBorderAttr("borderBottomStyle"),
  borderBottomWidth: createTableCellBorderAttr("borderBottomWidth"),
  borderLeftColor: createTableCellBorderAttr("borderLeftColor"),
  borderLeftStyle: createTableCellBorderAttr("borderLeftStyle"),
  borderLeftWidth: createTableCellBorderAttr("borderLeftWidth")
};

const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...tableCellStyleAttributes
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "td",
      mergeAttributes(
        this.options.HTMLAttributes,
        mergeTableCellStyleAttributes(HTMLAttributes, node.attrs)
      ),
      0
    ];
  }
});

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...tableCellStyleAttributes
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "th",
      mergeAttributes(
        this.options.HTMLAttributes,
        mergeTableCellStyleAttributes(HTMLAttributes, node.attrs)
      ),
      0
    ];
  }
});

// height 속성 추가 (행 높이)
const CustomTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (el) => (el.style.height ? parseFloat(el.style.height) : null),
        renderHTML: (attrs) =>
          attrs.height != null ? { style: `height: ${attrs.height}mm` } : {}
      }
    };
  }
});
import TextAlign from "@tiptap/extension-text-align";
import {
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  BackgroundColor
} from "@tiptap/extension-text-style";
import { Gapcursor, UndoRedo } from "@tiptap/extensions";
import Subscript from "@tiptap/extension-subscript";
import { ColumnsExtension } from "../extensions/ColumnsExtension";
import Math from "@tiptap/extension-mathematics";
import Superscript from "@tiptap/extension-superscript";

import CustomTable from "../extensions/CustomTable";
import Indent from "../extensions/Indent";
import ListBackspaceUnlist from "../extensions/ListBackspaceUnlist";
import { FormatPainter } from "../extensions/FormatPainter";
import { LazyImage } from "../extensions/LazyImage";
import { WordBreakExtension } from "../extensions/WordBreakExtension";
import { PaginationSemanticsExtension } from "../extensions/PaginationSemanticsExtension";
import ShapeBlock from "../extensions/ShapeBlock";
import ChartBlock from "../extensions/ChartBlock";
import DiagramBlock from "../extensions/DiagramBlock";
import BracketWrap from "../extensions/BracketWrap";
import {
  CustomParagraph,
  ParagraphFontSync
} from "../extensions/ParagraphFontSync";
import HardBreak from "@tiptap/extension-hard-break";
import InlineTag from "../extensions/InlineTag";
import TocItem from "../extensions/TocItem";
import HeadingWithId from "../extensions/HeadingWithId";
import CaptionBlock from "../extensions/CaptionBlock";
import CaptionTocItem from "../extensions/CaptionTocItem";
import TypographyShortcuts from "../extensions/TypographyShortcuts";
import LineHeightExtension from "../extensions/LineHeightExtension";
import { DOCXParagraphMetadataExtension } from "../extensions/DOCXParagraphMetadataExtension";
import BlockIdentity from "../extensions/BlockIdentity";
import SemanticAttributes from "../extensions/SemanticAttributes";
import NoteReference from "../extensions/NoteReference";
import NoteBody from "../extensions/NoteBody";

const CustomDocument = Document.extend({
  content: `(block | columnBlock | noteBody)+`
});

export const autoLinkExtension = Link.configure({
  autolink: true,
  linkOnPaste: true,
  openOnClick: false,
  enableClickSelection: true,
  defaultProtocol: "https",
  protocols: ["http", "https"],
  HTMLAttributes: {
    target: "_blank",
    rel: "noopener noreferrer nofollow"
  }
});

export const editorExtensions = [
  CustomDocument,
  CustomParagraph,
  ParagraphFontSync,
  BlockIdentity,
  SemanticAttributes,
  NoteReference,
  NoteBody,
  HardBreak,
  LazyImage.configure({ allowBase64: true }),
  Blockquote,
  WordBreakExtension,
  PaginationSemanticsExtension,
  CodeBlock,
  BulletList,
  OrderedList,
  ListItem,
  TaskList,
  HorizontalRule,
  TaskItem.configure({ nested: true }),
  Highlight.configure({ multicolor: true }),
  HeadingWithId.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  Text,
  TextStyle,
  TypographyShortcuts,
  LineHeightExtension,
  DOCXParagraphMetadataExtension,
  TextAlign.extend({
    addCommands() {
      return {
        ...this.parent?.(),
        setTextAlign:
          (alignment) =>
          ({ tr, state, dispatch }) => {
            const { selection, doc } = state;
            const { from, to } = selection;

            // shapeBlock이 NodeSelection으로 선택된 경우
            const isShapeNodeSelected =
              selection.node && selection.node.type.name === "shapeBlock";

            // 커서가 shapeBlock 내부에 있는 경우
            let isInsideShapeBlock = false;
            if (!selection.node) {
              for (let depth = selection.$from.depth; depth > 0; depth--) {
                if (selection.$from.node(depth).type.name === "shapeBlock") {
                  isInsideShapeBlock = true;
                  break;
                }
              }
            }

            doc.nodesBetween(from, to, (node, pos) => {
              if (this.options.types.includes(node.type.name)) {
                // 도형이 직접 선택된 경우: 도형만 정렬, 내부 텍스트는 건너뜀
                if (isShapeNodeSelected && node.type.name !== "shapeBlock") {
                  return false;
                }
                // 커서가 도형 내부인 경우: 텍스트만 정렬, 도형은 건너뜀
                if (isInsideShapeBlock && node.type.name === "shapeBlock") {
                  return true;
                }

                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  textAlign: alignment
                });
              }
            });

            if (dispatch) dispatch(tr);
            return true;
          }
      };
    }
  }).configure({
    types: ["heading", "paragraph", "image", "shapeBlock", "diagramBlock"],
    defaultAlignment: "left"
  }),
  CustomTable.configure({
    resizable: true,
    lastColumnResizable: true,
    allowTableNodeAttributes: true
  }),
  CustomTableRow,
  CustomTableHeader,
  CustomTableCell,
  Gapcursor,
  Color.configure({ types: ["textStyle"] }),
  FontFamily.configure({ types: ["textStyle"] }),
  BackgroundColor.configure({ types: ["textStyle"] }),
  FontSize.configure({ types: ["textStyle"] }),
  Bold,
  Italic,
  Strike,
  InlineTag,
  TocItem,
  CaptionTocItem,
  CaptionBlock,
  ListBackspaceUnlist,
  Indent,
  Underline,
  Subscript,
  Superscript,
  UndoRedo.configure({
    depth: 100,
    newGroupDelay: 100
  }),
  FormatPainter,
  Math,
  ColumnsExtension,
  autoLinkExtension,
  ShapeBlock,
  ChartBlock,
  DiagramBlock,
  BracketWrap
];
