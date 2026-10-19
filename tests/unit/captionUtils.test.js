import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, NodeSelection } from "@tiptap/pm/state";

import {
  CAPTION_BLOCK_TYPE,
  CAPTION_PLACEHOLDER_TEXT,
  CAPTION_TOC_ITEM_TYPE,
  createCaptionTocNodes,
  createCaptionBlockNode,
  getCaptionNumberText,
  getCaptionTargetFromSelection,
  getCaptionTextContent,
  getCaptionTextSelectionRange,
  isCaptionInsertionEnabled,
  isTocTitleText,
  normalizeCaptionTargetGroup,
  normalizeCaptionTargetType,
  collectCaptionEntries,
  toggleCaptionForSelection,
  upsertCaptionForSelection
} from "../../app/LIB/utils/captionUtils.js";

const textNode = (text) => ({
  type: { name: "text" },
  text,
  textContent: text,
  isText: true,
  attrs: {},
  marks: [],
  content: { size: text.length },
  childCount: 0,
  child() {
    return null;
  },
  descendants(callback) {
    callback(this);
  },
  get nodeSize() {
    return text.length;
  }
});

const node = (typeName, attrs = {}, children = [], options = {}) => {
  const { text = "", marks = [] } = options;
  const resolvedChildren = children;
  const isText = typeName === "text";

  return {
    type: { name: typeName },
    attrs,
    marks,
    isText,
    text,
    textContent:
      text || resolvedChildren.map((childNode) => childNode.textContent || "").join(""),
    content: {
      size: resolvedChildren.reduce(
        (total, childNode) => total + childNode.nodeSize,
        0
      )
    },
    childCount: resolvedChildren.length,
    firstChild: resolvedChildren[0] || null,
    child(index) {
      return resolvedChildren[index];
    },
    descendants(callback) {
      for (const childNode of resolvedChildren) {
        const shouldContinue = callback(childNode);

        if (shouldContinue === false) {
          return false;
        }

        if (childNode.childCount > 0) {
          const nestedShouldContinue = childNode.descendants(callback);

          if (nestedShouldContinue === false) {
            return false;
          }
        }
      }

      return true;
    },
    get nodeSize() {
      if (isText) {
        return text.length;
      }

      return resolvedChildren.reduce(
        (total, childNode) => total + childNode.nodeSize,
        2
      );
    }
  };
};

const paragraphNode = (text) => node("paragraph", {}, [textNode(text)]);
const headingNode = (level, text) =>
  node("heading", { level }, [textNode(text)]);

const captionBlockNode = (targetType, targetId, text) =>
  node(
    CAPTION_BLOCK_TYPE,
    {
      targetType,
      targetId
    },
    [paragraphNode(text)]
  );

const docNode = (...children) => node("doc", {}, children);

const createPmSchema = () =>
  new Schema({
    nodes: {
      doc: {
        content: "block+"
      },
      paragraph: {
        group: "block",
        content: "text*",
        attrs: {
          textAlign: { default: null },
          fontSize: { default: null }
        },
        toDOM() {
          return ["p", 0];
        }
      },
      text: {
        group: "inline"
      },
      image: {
        group: "block",
        selectable: true,
        atom: true,
        attrs: {
          objectId: { default: null }
        },
        toDOM(node) {
          return [
            "img",
            {
              "data-object-id": node.attrs.objectId || ""
            }
          ];
        }
      },
      [CAPTION_BLOCK_TYPE]: {
        group: "block",
        content: "paragraph+",
        attrs: {
          targetId: { default: null },
          targetType: { default: null }
        },
        toDOM() {
          return ["div", 0];
        }
      }
    },
    marks: {}
  });

const createEditorHarness = (doc, selection) => {
  const state = EditorState.create({
    schema: doc.type.schema,
    doc,
    selection
  });

  const editor = {
    state,
    view: {
      dispatch(tr) {
        editor.state = editor.state.apply(tr);
      },
      focus() {}
    }
  };

  return editor;
};

describe("captionUtils", () => {
  it("normalizes caption target types and groups", () => {
    expect(normalizeCaptionTargetType("tableCell")).toBe("table");
    expect(normalizeCaptionTargetType("shapeBlock")).toBe("shapeBlock");
    expect(normalizeCaptionTargetType("unknownType")).toBeNull();

    expect(normalizeCaptionTargetGroup("shapeBlock")).toBe("image");
    expect(normalizeCaptionTargetGroup("diagramBlock")).toBe("image");
    expect(normalizeCaptionTargetGroup("table_header")).toBe("table");
  });

  it("generates number text from the grouped caption policy", () => {
    expect(getCaptionNumberText("shapeBlock", "1-2")).toBe("[그림 1-2]");
    expect(getCaptionNumberText("diagramBlock", "3-1")).toBe("[그림 3-1]");
    expect(getCaptionNumberText("table", "2-4")).toBe("[표 2-4]");
    expect(getCaptionNumberText("chartBlock", "2-1")).toBe("[차트 2-1]");
  });

  it("accepts current and legacy toc title labels", () => {
    expect(isTocTitleText("그림 목차")).toBe(true);
    expect(isTocTitleText("이미지 목차")).toBe(true);
    expect(isTocTitleText("다이어그램 목차")).toBe(true);
    expect(isTocTitleText("아무 제목")).toBe(false);
  });

  it("collects grouped caption entries by section and type", () => {
    const doc = docNode(
      headingNode(1, "첫 장"),
      captionBlockNode("image", "image-1", "이미지 캡션"),
      captionBlockNode("shapeBlock", "shape-1", "도형 캡션"),
      headingNode(1, "둘째 장"),
      captionBlockNode("diagramBlock", "diagram-1", "다이어그램 캡션"),
      captionBlockNode("table", "table-1", "표 캡션"),
      captionBlockNode("chartBlock", "chart-1", "차트 캡션")
    );

    const entries = collectCaptionEntries(doc);

    expect(entries).toHaveLength(5);

    expect(
      entries.map((entry) => ({
        targetId: entry.targetId,
        targetGroup: entry.targetGroup,
        number: entry.number,
        numberText: entry.numberText,
        tocTitle: entry.tocTitle
      }))
    ).toEqual([
      {
        targetId: "image-1",
        targetGroup: "image",
        number: "1-1",
        numberText: "[그림 1-1]",
        tocTitle: "그림 목차"
      },
      {
        targetId: "shape-1",
        targetGroup: "image",
        number: "1-2",
        numberText: "[그림 1-2]",
        tocTitle: "그림 목차"
      },
      {
        targetId: "diagram-1",
        targetGroup: "image",
        number: "2-1",
        numberText: "[그림 2-1]",
        tocTitle: "그림 목차"
      },
      {
        targetId: "table-1",
        targetGroup: "table",
        number: "2-1",
        numberText: "[표 2-1]",
        tocTitle: "표 목차"
      },
      {
        targetId: "chart-1",
        targetGroup: "chartBlock",
        number: "2-1",
        numberText: "[차트 2-1]",
        tocTitle: "차트 목차"
      }
    ]);
  });

  it("numbers captions before the first H1 as section zero", () => {
    const doc = docNode(
      captionBlockNode("image", "image-before", "제목 전 이미지"),
      headingNode(1, "첫 장"),
      captionBlockNode("table", "table-1", "표 캡션")
    );

    expect(
      collectCaptionEntries(doc).map((entry) => ({
        targetId: entry.targetId,
        number: entry.number,
        numberText: entry.numberText
      }))
    ).toEqual([
      {
        targetId: "image-before",
        number: "0-1",
        numberText: "[그림 0-1]"
      },
      {
        targetId: "table-1",
        number: "1-1",
        numberText: "[표 1-1]"
      }
    ]);
  });

  it("keeps placeholder captions numbered but exposes empty text", () => {
    const doc = docNode(
      headingNode(1, "첫 장"),
      captionBlockNode("image", "image-1", CAPTION_PLACEHOLDER_TEXT)
    );

    expect(collectCaptionEntries(doc)[0]).toMatchObject({
      targetId: "image-1",
      text: "",
      number: "1-1",
      numberText: "[그림 1-1]"
    });
  });

  it("creates caption toc nodes from the normalized group", () => {
    const entries = [
      {
        targetId: "diagram-1",
        targetType: "diagramBlock",
        targetGroup: "image"
      }
    ];

    expect(createCaptionTocNodes("diagramBlock", entries)).toEqual([
      {
        type: "paragraph",
        content: [{ type: "text", text: "그림 목차" }]
      },
      {
        type: CAPTION_TOC_ITEM_TYPE,
        attrs: {
          targetId: "diagram-1",
          targetType: "image"
        }
      }
    ]);
  });

  it("strips placeholder text from caption content", () => {
    expect(
      getCaptionTextContent(
        captionBlockNode("image", "image-1", CAPTION_PLACEHOLDER_TEXT)
      )
    ).toBe("");
  });

  it("returns caption text selection range for filled and empty captions", () => {
    const captionNodeWithParagraph = captionBlockNode("image", "image-1", "캡션");

    expect(getCaptionTextSelectionRange(captionNodeWithParagraph, 10)).toEqual({
      from: 12,
      to: 14
    });

    expect(getCaptionTextSelectionRange(null, 10)).toEqual({
      from: 12,
      to: 12
    });
  });

  it("creates caption block node with placeholder text", () => {
    const schema = createPmSchema();
    const captionNode = createCaptionBlockNode(schema, {
      targetId: "image-1",
      targetType: "image"
    });

    expect(captionNode.type.name).toBe(CAPTION_BLOCK_TYPE);
    expect(captionNode.attrs).toMatchObject({
      targetId: "image-1",
      targetType: "image"
    });
    expect(captionNode.textContent).toBe(CAPTION_PLACEHOLDER_TEXT);
  });

  it("enables caption insertion for node-selected image only", () => {
    const schema = createPmSchema();
    const imageNode = schema.nodes.image.create({});
    const paragraph = schema.nodes.paragraph.create(null, schema.text("본문"));
    const doc = schema.nodes.doc.create(null, [imageNode, paragraph]);
    const imageState = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0)
    });

    expect(isCaptionInsertionEnabled(imageState)).toBe(true);
    expect(getCaptionTargetFromSelection(imageState)).toMatchObject({
      pos: 0,
      type: "image"
    });

    const paragraphSelection = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, imageNode.nodeSize)
    });

    expect(isCaptionInsertionEnabled(paragraphSelection)).toBe(false);
    expect(getCaptionTargetFromSelection(paragraphSelection)).toBeNull();
  });

  it("upserts caption for selected image and selects placeholder text", () => {
    const schema = createPmSchema();
    const imageNode = schema.nodes.image.create({});
    const doc = schema.nodes.doc.create(null, [imageNode]);
    const editor = createEditorHarness(doc, NodeSelection.create(doc, 0));

    const result = upsertCaptionForSelection(editor);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("created");
    expect(result.targetType).toBe("image");
    expect(result.objectId).toBeTruthy();

    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).attrs.objectId).toBe(result.objectId);
    expect(editor.state.doc.child(1).type.name).toBe(CAPTION_BLOCK_TYPE);
    expect(editor.state.doc.child(1).attrs).toMatchObject({
      targetId: result.objectId,
      targetType: "image"
    });
    expect(editor.state.doc.child(1).textContent).toBe(CAPTION_PLACEHOLDER_TEXT);
    expect(editor.state.selection.from).toBeLessThan(editor.state.selection.to);
  });

  it("reuses and moves an existing caption back under the selected object", () => {
    const schema = createPmSchema();
    const imageNode = schema.nodes.image.create({
      objectId: "image-1"
    });
    const spacerParagraph = schema.nodes.paragraph.create(
      null,
      schema.text("중간 문단")
    );
    const captionNode = createCaptionBlockNode(schema, {
      targetId: "image-1",
      targetType: "image"
    });
    const doc = schema.nodes.doc.create(null, [
      imageNode,
      spacerParagraph,
      captionNode
    ]);
    const editor = createEditorHarness(doc, NodeSelection.create(doc, 0));

    const result = upsertCaptionForSelection(editor);

    expect(result).toMatchObject({
      ok: true,
      status: "existing",
      targetType: "image",
      objectId: "image-1"
    });

    expect(editor.state.doc.child(0).type.name).toBe("image");
    expect(editor.state.doc.child(1).type.name).toBe(CAPTION_BLOCK_TYPE);
    expect(editor.state.doc.child(2).type.name).toBe("paragraph");
    expect(editor.state.doc.child(1).attrs).toMatchObject({
      targetId: "image-1",
      targetType: "image"
    });
  });

  it("toggles existing caption off for selected object", () => {
    const schema = createPmSchema();
    const imageNode = schema.nodes.image.create({
      objectId: "image-1"
    });
    const captionNode = createCaptionBlockNode(schema, {
      targetId: "image-1",
      targetType: "image"
    });
    const doc = schema.nodes.doc.create(null, [imageNode, captionNode]);
    const editor = createEditorHarness(doc, NodeSelection.create(doc, 0));

    const result = toggleCaptionForSelection(editor);

    expect(result).toEqual({
      ok: true,
      status: "deleted",
      targetType: "image",
      objectId: "image-1"
    });
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).type.name).toBe("image");
  });
});
