import { describe, expect, it } from "vitest";
import { getSchema, Node } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Heading from "@tiptap/extension-heading";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import BlockIdentity from "../../app/LIB/extensions/BlockIdentity.js";
import SemanticAttributes from "../../app/LIB/extensions/SemanticAttributes.js";
import {
  getObjectSemanticEditorTarget,
  getTextSemanticEditorTarget,
  resolveSemanticEditorTarget,
  validateSemanticEditorDraft
} from "../../app/LIB/utils/semanticEditorUtils.js";

const objectNode = (name, tag) =>
  Node.create({
    name,
    group: "block",
    atom: true,
    addAttributes: () => ({ objectId: { default: null } }),
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes }) => [tag, HTMLAttributes]
  });

const TableCell = Node.create({
  name: "tableCell",
  content: "paragraph+",
  tableRole: "cell",
  parseHTML: () => [{ tag: "td" }],
  renderHTML: () => ["td", 0]
});
const TableRow = Node.create({
  name: "tableRow",
  content: "tableCell+",
  tableRole: "row",
  parseHTML: () => [{ tag: "tr" }],
  renderHTML: () => ["tr", 0]
});
const Table = Node.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  tableRole: "table",
  addAttributes: () => ({ objectId: { default: null } }),
  parseHTML: () => [{ tag: "table" }],
  renderHTML: ({ HTMLAttributes }) => ["table", HTMLAttributes, ["tbody", 0]]
});

const schema = getSchema([
  Document,
  Paragraph,
  Heading,
  Text,
  Table,
  TableRow,
  TableCell,
  objectNode("diagramBlock", "div"),
  BlockIdentity,
  SemanticAttributes
]);

const createState = (content, selectionFactory) => {
  const doc = schema.nodeFromJSON({ type: "doc", content });
  return EditorState.create({
    schema,
    doc,
    selection: selectionFactory?.(doc)
  });
};

describe("semanticEditorUtils", () => {
  it("targets a cursor or a same-block text selection and rejects cross-block ranges", () => {
    const content = [
      {
        type: "paragraph",
        attrs: { blockId: "block-one" },
        content: [{ type: "text", text: "첫 문단" }]
      },
      {
        type: "heading",
        attrs: { blockId: "block-two", level: 2 },
        content: [{ type: "text", text: "둘째 제목" }]
      }
    ];
    const cursorState = createState(content, (doc) =>
      TextSelection.create(doc, 2)
    );
    expect(getTextSemanticEditorTarget(cursorState)).toMatchObject({
      type: "paragraph",
      position: 0,
      stableId: "block-one"
    });

    const headingPosition = cursorState.doc.child(0).nodeSize;
    const headingSelectionState = createState(content, (doc) =>
      TextSelection.create(doc, headingPosition + 1, headingPosition + 3)
    );
    expect(getTextSemanticEditorTarget(headingSelectionState)).toMatchObject({
      type: "heading",
      position: headingPosition,
      stableId: "block-two"
    });

    const crossBlockState = createState(content, (doc) =>
      TextSelection.create(doc, 2, headingPosition + 2)
    );
    expect(getTextSemanticEditorTarget(crossBlockState)).toBeNull();
  });

  it("resolves a text target by stable identity after its document position moves", () => {
    const state = createState(
      [
        {
          type: "paragraph",
          attrs: { blockId: "stable-block" },
          content: [{ type: "text", text: "본문" }]
        }
      ],
      (doc) => TextSelection.create(doc, 2)
    );
    const target = getTextSemanticEditorTarget(state);
    const inserted = schema.node("paragraph", { blockId: "new-block" }, [
      schema.text("앞 문단")
    ]);
    const movedDoc = state.apply(state.tr.insert(0, inserted)).doc;
    const resolved = resolveSemanticEditorTarget(movedDoc, target);

    expect(resolved.node.attrs.blockId).toBe("stable-block");
    expect(resolved.position).toBe(inserted.nodeSize);
  });

  it("maps object and nested table selections to semantic carrier nodes", () => {
    const diagramState = createState(
      [
        {
          type: "diagramBlock",
          attrs: { objectId: "object-diagram" }
        }
      ],
      (doc) => NodeSelection.create(doc, 0)
    );
    expect(
      getObjectSemanticEditorTarget(diagramState, {
        from: 0,
        node: diagramState.selection.node
      })
    ).toMatchObject({
      type: "diagramBlock",
      position: 0,
      stableId: "object-diagram"
    });

    const tableState = createState(
      [
        {
          type: "table",
          attrs: { objectId: "object-table" },
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: { blockId: "cell-paragraph" },
                      content: [{ type: "text", text: "셀" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      (doc) => TextSelection.create(doc, 4)
    );
    expect(
      getObjectSemanticEditorTarget(tableState, {
        from: 2,
        node: tableState.doc.nodeAt(2),
        type: "tableCell"
      })
    ).toMatchObject({
      type: "table",
      position: 0,
      stableId: "object-table"
    });
  });

  it("reports invalid and duplicate names before a command can mutate the document", () => {
    const state = createState(
      [
        {
          type: "paragraph",
          attrs: { blockId: "target-block" },
          content: [{ type: "text", text: "대상" }]
        },
        {
          type: "paragraph",
          attrs: { blockId: "used-block", semanticKey: "already-used" },
          content: [{ type: "text", text: "기존" }]
        }
      ],
      (doc) => TextSelection.create(doc, 2)
    );
    const target = getTextSemanticEditorTarget(state);

    expect(
      validateSemanticEditorDraft(state.doc, target, {
        semanticKey: "bad key",
        semanticRole: "summary"
      })
    ).toMatchObject({ valid: false, code: "semanticKey_invalid_identifier" });
    expect(
      validateSemanticEditorDraft(state.doc, target, {
        semanticKey: "already-used",
        semanticRole: "summary"
      })
    ).toMatchObject({ valid: false, code: "semanticKey_duplicate" });
    expect(
      validateSemanticEditorDraft(state.doc, target, {
        semanticKey: "new-name",
        semanticRole: "summary"
      })
    ).toMatchObject({
      valid: true,
      value: { semanticKey: "new-name", semanticRole: "summary" }
    });
  });
});
