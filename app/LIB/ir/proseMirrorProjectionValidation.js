import { getSchema, Node } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Blockquote from "@tiptap/extension-blockquote";
import CodeBlock from "@tiptap/extension-code-block";
import HardBreak from "@tiptap/extension-hard-break";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Link from "@tiptap/extension-link";
import {
  BulletList,
  ListItem,
  OrderedList,
  TaskItem,
  TaskList
} from "@tiptap/extension-list";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import {
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  BackgroundColor
} from "@tiptap/extension-text-style";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Heading from "@tiptap/extension-heading";
import { ColumnsExtension } from "../extensions/ColumnsExtension";
import InlineTag from "../extensions/InlineTag";
import { DOCXParagraphMetadataExtension } from "../extensions/DOCXParagraphMetadataExtension";
import NoteReference from "../extensions/NoteReference";
import NoteBody from "../extensions/NoteBody";

export const PROSEMIRROR_PROJECTION_VALIDATION_SCHEMA_SOURCE =
  "ContentEditor schema-only dry-run";

const CustomDocument = Document.extend({
  content: "(block | columnBlock | noteBody)+"
});

// These schema-only nodes mirror the document node names and content groups
// owned by ContentEditor without importing React node views or widget runtime
// dependencies into conversion/composer validation.
const ChartBlockSchemaOnly = Node.create({
  name: "chartBlock",
  group: "block",
  atom: true
});
const DiagramBlockSchemaOnly = Node.create({
  name: "diagramBlock",
  group: "block",
  atom: true
});
const ShapeBlockSchemaOnly = Node.create({
  name: "shapeBlock",
  group: "block",
  content: "block+"
});
const TocItemSchemaOnly = Node.create({
  name: "tocItem",
  group: "block",
  atom: true
});
const CaptionBlockSchemaOnly = Node.create({
  name: "captionBlock",
  group: "block",
  content: "paragraph+"
});
const CaptionTocItemSchemaOnly = Node.create({
  name: "captionTocItem",
  group: "block",
  atom: true
});
const BlockMathSchemaOnly = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,
  addAttributes: () => ({ latex: { default: "" } })
});
const InlineMathSchemaOnly = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ latex: { default: "" } })
});

const CustomParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null
      }
    };
  }
});

const HeadingWithIdSchemaOnly = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      headingId: {
        default: null
      }
    };
  }
});

const LazyImageSchemaOnly = Image.extend({
  name: "image",
  group: "block",
  inline: false,
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null
      },
      alt: {
        default: null
      },
      title: {
        default: null
      },
      objectId: {
        default: null
      },
      width: {
        default: null
      },
      height: {
        default: null
      },
      textAlign: {
        default: "left"
      },
      opacity: {
        default: 1
      },
      filter: {
        default: null
      },
      filterBrightness: {
        default: 100
      },
      filterContrast: {
        default: 100
      },
      filterGrayscale: {
        default: 0
      },
      borderWidth: {
        default: 0
      },
      borderColor: {
        default: "#000000ff"
      },
      borderStyle: {
        default: "solid"
      },
      borderRadius: {
        default: 0
      },
      shadowEnabled: {
        default: false
      },
      shadowOffsetX: {
        default: 0
      },
      shadowOffsetY: {
        default: 0
      },
      shadowBlur: {
        default: 7.5
      },
      shadowSpread: {
        default: 0.75
      },
      shadowColor: {
        default: "#000000"
      },
      shadowInset: {
        default: false
      }
    };
  }
});

const CustomTableSchemaOnly = Table.extend({
  name: "table",

  addAttributes() {
    return {
      ...this.parent?.(),
      headerColor: {
        default: "#dcdddd"
      },
      borderColor: {
        default: "#006d75"
      },
      borderStyle: {
        default: "solid"
      },
      borderWidth: {
        default: 1
      },
      objectId: {
        default: null
      },
      cellPaddingTop: {
        default: null
      },
      cellPaddingBottom: {
        default: null
      },
      cellPaddingLeft: {
        default: null
      },
      cellPaddingRight: {
        default: null
      }
    };
  }
});

const CustomTableRowSchemaOnly = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null
      }
    };
  }
});

const tableCellStyleAttrs = {
  verticalAlign: {
    default: null
  },
  backgroundColor: {
    default: null
  },
  borderColor: {
    default: null
  },
  borderStyle: {
    default: null
  },
  borderWidth: {
    default: null
  },
  borderTopColor: {
    default: null
  },
  borderTopStyle: {
    default: null
  },
  borderTopWidth: {
    default: null
  },
  borderRightColor: {
    default: null
  },
  borderRightStyle: {
    default: null
  },
  borderRightWidth: {
    default: null
  },
  borderBottomColor: {
    default: null
  },
  borderBottomStyle: {
    default: null
  },
  borderBottomWidth: {
    default: null
  },
  borderLeftColor: {
    default: null
  },
  borderLeftStyle: {
    default: null
  },
  borderLeftWidth: {
    default: null
  }
};

const CustomTableCellSchemaOnly = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...tableCellStyleAttrs
    };
  }
});

const CustomTableHeaderSchemaOnly = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...tableCellStyleAttrs
    };
  }
});

const validationSchemaExtensions = [
  CustomDocument,
  CustomParagraph,
  HardBreak,
  LazyImageSchemaOnly.configure({ allowBase64: true }),
  Blockquote,
  CodeBlock,
  BulletList,
  OrderedList,
  ListItem,
  TaskList,
  TaskItem.configure({ nested: true }),
  ChartBlockSchemaOnly,
  DiagramBlockSchemaOnly,
  ShapeBlockSchemaOnly,
  TocItemSchemaOnly,
  CaptionBlockSchemaOnly,
  CaptionTocItemSchemaOnly,
  BlockMathSchemaOnly,
  InlineMathSchemaOnly,
  HorizontalRule,
  Highlight.configure({ multicolor: true }),
  HeadingWithIdSchemaOnly.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  Text,
  TextStyle,
  DOCXParagraphMetadataExtension,
  NoteReference,
  NoteBody,
  CustomTableSchemaOnly.configure({
    resizable: true,
    lastColumnResizable: true,
    allowTableNodeAttributes: true
  }),
  CustomTableRowSchemaOnly,
  CustomTableHeaderSchemaOnly,
  CustomTableCellSchemaOnly,
  Color.configure({ types: ["textStyle"] }),
  FontFamily.configure({ types: ["textStyle"] }),
  BackgroundColor.configure({ types: ["textStyle"] }),
  FontSize.configure({ types: ["textStyle"] }),
  Bold,
  Italic,
  Strike,
  InlineTag,
  Underline,
  Subscript,
  Superscript,
  Link.configure({
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
  }),
  ColumnsExtension
];

const schema = getSchema(validationSchemaExtensions);

const nodeTypeNames = new Set(Object.keys(schema.nodes));
const markTypeNames = new Set(Object.keys(schema.marks));

const isRecord = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const warning = (code, severity, message, path) =>
  Object.freeze({
    code,
    severity,
    message,
    ...(path ? { path } : {})
  });

const getAttrNames = (type) =>
  type?.attrs ? new Set(Object.keys(type.attrs)) : new Set();

const collectUnknownAttrs = (attrs, type, warnings, path, subject) => {
  if (!isRecord(attrs)) {
    return;
  }

  const attrNames = getAttrNames(type);

  Object.keys(attrs).forEach((attrName) => {
    if (!attrNames.has(attrName)) {
      warnings.push(
        warning(
          "pm-projection-unknown-attr",
          "warning",
          `Projected ${subject} attr is not in editor schema: ${attrName}.`,
          `${path}.attrs.${attrName}`
        )
      );
    }
  });
};

const collectStructuralWarnings = (node, warnings, path = "doc") => {
  if (!isRecord(node)) {
    warnings.push(
      warning(
        "pm-projection-invalid-json",
        "error",
        "Projected ProseMirror node is not an object.",
        path
      )
    );
    return;
  }

  const nodeType = schema.nodes[node.type];

  if (!nodeTypeNames.has(node.type)) {
    warnings.push(
      warning(
        "pm-projection-unknown-node",
        "error",
        `Projected node type is not in editor schema: ${String(node.type)}.`,
        path
      )
    );
  } else {
    collectUnknownAttrs(node.attrs, nodeType, warnings, path, "node");
  }

  if (Array.isArray(node.marks)) {
    node.marks.forEach((mark, markIndex) => {
      const markPath = `${path}.marks[${markIndex}]`;

      if (!isRecord(mark)) {
        warnings.push(
          warning(
            "pm-projection-invalid-json",
            "error",
            "Projected mark is not an object.",
            markPath
          )
        );
        return;
      }

      const markType = schema.marks[mark.type];

      if (!markTypeNames.has(mark.type)) {
        warnings.push(
          warning(
            "pm-projection-unknown-mark",
            "error",
            `Projected mark type is not in editor schema: ${String(mark.type)}.`,
            markPath
          )
        );
      } else {
        collectUnknownAttrs(mark.attrs, markType, warnings, markPath, "mark");
      }
    });
  }

  if (node.attrs !== undefined && !isRecord(node.attrs)) {
    warnings.push(
      warning(
        "pm-projection-invalid-attrs",
        "warning",
        "Projected node attrs should be an object when present.",
        `${path}.attrs`
      )
    );
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child, childIndex) =>
      collectStructuralWarnings(child, warnings, `${path}.content[${childIndex}]`)
    );
  } else if (node.content !== undefined) {
    warnings.push(
      warning(
        "pm-projection-invalid-json",
        "error",
        "Projected node content should be an array when present.",
        `${path}.content`
      )
    );
  }
};

export const validateProseMirrorProjection = (docJson) => {
  const warnings = [];
  let docNode = null;
  let editorStateDryRun = Object.freeze({
    attempted: false,
    valid: false,
    skippedReason: "schema-invalid"
  });

  collectStructuralWarnings(docJson, warnings);

  try {
    docNode = schema.nodeFromJSON(docJson);
    docNode.check();
  } catch (error) {
    warnings.push(
      warning(
        "pm-projection-schema-invalid",
        "error",
        error instanceof Error ? error.message : String(error),
        "doc"
      )
    );
  }

  if (docNode) {
    try {
      const state = EditorState.create({ schema, doc: docNode });
      const valid = state.doc.eq(docNode);

      editorStateDryRun = Object.freeze({
        attempted: true,
        valid,
        docNodeType: state.doc.type.name,
        pluginCount: state.plugins.length
      });

      if (!valid) {
        warnings.push(
          warning(
            "pm-projection-editor-state-invalid",
            "error",
            "Projected doc JSON created an EditorState, but the resulting doc did not match the schema node.",
            "doc"
          )
        );
      }
    } catch (error) {
      editorStateDryRun = Object.freeze({
        attempted: true,
        valid: false,
        message: error instanceof Error ? error.message : String(error)
      });
      warnings.push(
        warning(
          "pm-projection-editor-state-invalid",
          "error",
          error instanceof Error ? error.message : String(error),
          "doc"
        )
      );
    }
  }

  const errors = warnings.filter((item) => item.severity === "error");

  return Object.freeze({
    valid: errors.length === 0,
    warnings: Object.freeze(warnings),
    errors: Object.freeze(errors),
    schemaSource: PROSEMIRROR_PROJECTION_VALIDATION_SCHEMA_SOURCE,
    editorStateDryRun
  });
};
