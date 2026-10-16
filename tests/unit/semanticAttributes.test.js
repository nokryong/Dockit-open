import { describe, expect, it, vi } from "vitest";
import { generateHTML, generateJSON } from "@tiptap/html/server";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import Image from "@tiptap/extension-image";
import { TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Text from "@tiptap/extension-text";
import { Node } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { Fragment, Slice } from "@tiptap/pm/model";
import { history, redo, undo } from "@tiptap/pm/history";
import { getSchema } from "@tiptap/core";
import CustomTable from "../../app/LIB/extensions/CustomTable.js";
import BlockIdentity from "../../app/LIB/extensions/BlockIdentity.js";
import CaptionBlock from "../../app/LIB/extensions/CaptionBlock.js";
import HeadingWithId from "../../app/LIB/extensions/HeadingWithId.js";
import { LazyImage } from "../../app/LIB/extensions/LazyImage.js";
import { ShapeBlock } from "../../app/LIB/extensions/ShapeBlock.js";
import SemanticAttributes, {
  buildSemanticAttributesNormalizationTransaction,
  validateSemanticAttributes
} from "../../app/LIB/extensions/SemanticAttributes.js";
import { validateSemanticHtmlPayload, validateSemanticKey } from "../../app/LIB/utils/semanticAttributes.js";
import {
  remapSemanticCopySlice,
  transformSemanticTransferSlice
} from "../../app/LIB/utils/semanticCopyUtils.js";
import { getDocumentOutputFingerprint } from "../../app/LIB/utils/documentOperationUtils.js";

const atom = (name, tag, attrs = {}) => Node.create({
  name, group: "block", atom: true,
  addAttributes: () => attrs,
  parseHTML: () => [{ tag: name === "chartBlock" ? "div[data-chart-block]" : name === "shapeBlock" ? 'div[data-type="shape-block"]' : name === "diagramBlock" ? "div[data-diagram-block]" : tag }],
  renderHTML: ({ HTMLAttributes }) => [tag, { ...HTMLAttributes, ...(name === "chartBlock" ? { "data-chart-block": "" } : {}), ...(name === "shapeBlock" ? { "data-type": "shape-block" } : {}), ...(name === "diagramBlock" ? { "data-diagram-block": "" } : {}) }]
});
const extensions = [
  Document, Paragraph, Heading, Image, Text,
  atom("table", "table"), atom("chartBlock", "div"), atom("shapeBlock", "div"), atom("diagramBlock", "div"),
  SemanticAttributes
];
const productionNodeExtensions = [
  Document,
  Paragraph,
  Heading,
  LazyImage.configure({ allowBase64: true }),
  Text,
  CustomTable,
  TableRow,
  TableHeader,
  TableCell,
  ShapeBlock,
  SemanticAttributes
];
const copyInvariantExtensions = [
  Document,
  Paragraph,
  Text,
  HeadingWithId.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  ShapeBlock,
  CaptionBlock,
  BlockIdentity,
  SemanticAttributes
];

describe("SemanticAttributes", () => {
  it("normalizes Korean identifiers and deterministically deduplicates unordered tags", () => {
    expect(validateSemanticAttributes({ semanticKey: "  문단~2 ", semanticRole: " 제목 ", semanticTags: ["나", "가", "나"] })).toEqual({
      valid: true, code: null, value: { semanticKey: "문단~2", semanticRole: "제목", semanticTags: ["가", "나"] }
    });
    expect(validateSemanticAttributes({ semanticKey: "bad key", semanticRole: "<script>", semanticTags: ["ok"] }).valid).toBe(false);
    expect(validateSemanticKey("항목~10").valid).toBe(true);
    expect(validateSemanticKey("항목~1").valid).toBe(false);
    expect(validateSemanticKey("항목~02").valid).toBe(false);
    expect(validateSemanticAttributes({ semanticTags: ["𐐀", "Ａ"] }).value.semanticTags).toEqual(["Ａ", "𐐀"]);
  });

  it("does not retain invalid parsed values or render invalid semantic values", () => {
    const attributes = SemanticAttributes.config.addGlobalAttributes()[0].attributes;
    const element = { getAttribute: (name) => ({
      "data-dockit-semantic-key": "bad key",
      "data-dockit-semantic-role": "bad role",
      "data-dockit-semantic-tags": '["ok", "bad tag"]'
    })[name] ?? null };
    expect(attributes.semanticKey.parseHTML(element)).toBeNull();
    expect(attributes.semanticRole.parseHTML(element)).toBeNull();
    expect(attributes.semanticTags.parseHTML(element)).toEqual([]);
    expect(attributes.semanticKey.renderHTML({ semanticKey: "bad key" })).toEqual({});
    expect(attributes.semanticRole.renderHTML({ semanticRole: "bad role" })).toEqual({});
    expect(attributes.semanticTags.renderHTML({ semanticTags: ["bad tag"] })).toEqual({});
  });

  it("fails closed for duplicate semantic attributes and fake div carrier markers", () => {
    expect(validateSemanticHtmlPayload('<p data-dockit-semantic-key="a" data-dockit-semantic-key="b">x</p>').valid).toBe(false);
    expect(validateSemanticHtmlPayload('<div title="data-chart-block" data-dockit-semantic-key="a"></div>').valid).toBe(false);
  });

  it("detects semantic data only in real attributes and keeps quoted greater-than signs intact", () => {
    expect(validateSemanticHtmlPayload('<p>data-dockit-semantic-key</p><p title="data-dockit-semantic-role">x</p><!-- data-dockit-semantic-key="x" -->')).toEqual({
      hasSemanticData: false,
      valid: true
    });
    expect(validateSemanticHtmlPayload('<img alt="a > b" data-dockit-semantic-key="image">')).toEqual({
      hasSemanticData: true,
      valid: true
    });
  });

  it("fails closed for reserved semantic attributes in unfinished tags", () => {
    const malformedInputs = [
      '<p data-dockit-semantic-key="x"',
      '<p data-dockit-semantic-key="x" garbage="unterminated>'
    ];

    const parserRetainsSemanticAttributes = [];
    for (const html of malformedInputs) {
      expect(validateSemanticHtmlPayload(html)).toEqual({
        hasSemanticData: true,
        valid: false
      });
      const parsed = generateJSON(html, [
        Document,
        Paragraph,
        Text,
        SemanticAttributes
      ]);
      parserRetainsSemanticAttributes.push(
        parsed.content?.some(
          (node) => node.attrs?.semanticKey || node.attrs?.semanticRole
        ) ?? false
      );
    }
    expect(parserRetainsSemanticAttributes).toEqual([true, false]);
    expect(
      validateSemanticHtmlPayload(
        '<p title="unfinished data-dockit-semantic-key x'
      )
    ).toEqual({ hasSemanticData: false, valid: true });
  });

  it("ignores empty semantic defaults but fingerprints meaningful values", () => {
    const plainDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "본문" }]
        }
      ]
    };
    const documentWithDefaults = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            semanticKey: null,
            semanticRole: null,
            semanticTags: []
          },
          content: [{ type: "text", text: "본문" }]
        }
      ]
    };
    const documentWithMeaning = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            semanticKey: "summary",
            semanticRole: null,
            semanticTags: []
          },
          content: [{ type: "text", text: "본문" }]
        }
      ]
    };

    expect(getDocumentOutputFingerprint(documentWithDefaults)).toBe(
      getDocumentOutputFingerprint(plainDocument)
    );
    expect(getDocumentOutputFingerprint(documentWithMeaning)).not.toBe(
      getDocumentOutputFingerprint(plainDocument)
    );
  });

  it("renders and parses every supported carrier with semantic tags", () => {
    const nodes = ["paragraph", "heading", "image", "table", "chartBlock", "shapeBlock", "diagramBlock"].map((type, index) => ({
      type,
      attrs: { ...(type === "heading" ? { level: 2 } : {}), ...(type === "image" ? { src: "x.png" } : {}), semanticKey: `항목-${index}`, semanticRole: "본문", semanticTags: ["가", "나"] },
      ...(type === "paragraph" || type === "heading" ? { content: [{ type: "text", text: type }] } : {})
    }));
    const doc = { type: "doc", content: nodes };
    const html = generateHTML(doc, extensions);
    expect(html).toContain("data-dockit-semantic-tags");
    expect(validateSemanticHtmlPayload(html)).toEqual({
      hasSemanticData: true,
      valid: true
    });
    const parsed = generateJSON(html, extensions);
    expect(
      parsed.content.map((node) => ({
        semanticKey: node.attrs.semanticKey,
        semanticRole: node.attrs.semanticRole,
        semanticTags: node.attrs.semanticTags
      }))
    ).toEqual(
      nodes.map((node) => ({
        semanticKey: node.attrs.semanticKey,
        semanticRole: "본문",
        semanticTags: ["가", "나"]
      }))
    );
  });

  it("round-trips semantic attributes through the production image, table, and nested shape nodes", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "image.png",
            semanticKey: "production-image",
            semanticRole: "illustration",
            semanticTags: ["visual"]
          }
        },
        {
          type: "table",
          attrs: {
            semanticKey: "production-table",
            semanticRole: "data-table",
            semanticTags: ["evidence"]
          },
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "cell" }]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "shapeBlock",
          attrs: {
            semanticKey: "production-shape",
            semanticRole: "title-box",
            semanticTags: ["cover"]
          },
          content: [
            {
              type: "heading",
              attrs: {
                level: 1,
                semanticKey: "production-title",
                semanticRole: "main-title"
              },
              content: [{ type: "text", text: "Title" }]
            }
          ]
        }
      ]
    };

    const html = generateHTML(doc, productionNodeExtensions);
    expect(html).toContain('data-dockit-semantic-key="production-image"');
    expect(html).toContain('data-dockit-semantic-key="production-table"');
    expect(html).toContain('data-dockit-semantic-key="production-shape"');
    expect(html).toContain('data-dockit-semantic-key="production-title"');

    const parsed = generateJSON(html, productionNodeExtensions);
    expect(parsed.content[0].attrs).toMatchObject({
      semanticKey: "production-image",
      semanticRole: "illustration",
      semanticTags: ["visual"]
    });
    expect(parsed.content[1].attrs).toMatchObject({
      semanticKey: "production-table",
      semanticRole: "data-table",
      semanticTags: ["evidence"]
    });
    expect(parsed.content[2].attrs).toMatchObject({
      semanticKey: "production-shape",
      semanticRole: "title-box",
      semanticTags: ["cover"]
    });
    expect(parsed.content[2].content[0].attrs).toMatchObject({
      semanticKey: "production-title",
      semanticRole: "main-title"
    });
  });

  it("keeps the first valid duplicate key and clears invalid semantic fields without history", () => {
    const schema = getSchema(extensions);
    const state = EditorState.create({ schema, doc: schema.nodeFromJSON({ type: "doc", content: [
      { type: "paragraph", attrs: { semanticKey: "first", semanticRole: "본문", semanticTags: ["나"] }, content: [{ type: "text", text: "a" }] },
      { type: "paragraph", attrs: { semanticKey: "first", semanticRole: "bad role", semanticTags: ["나"] }, content: [{ type: "text", text: "b" }] }
    ] }) });
    const tr = buildSemanticAttributesNormalizationTransaction(state);
    expect(tr.getMeta("addToHistory")).toBe(false);
    const result = state.apply(tr).doc;
    expect(result.child(0).attrs.semanticKey).toBe("first");
    expect(result.child(1).attrs).toMatchObject({ semanticKey: null, semanticRole: null, semanticTags: ["나"] });
  });

  it("rejects duplicate commands without dispatch and permits role/tag-only commands", () => {
    const schema = getSchema(extensions);
    const state = EditorState.create({ schema, doc: schema.nodeFromJSON({ type: "doc", content: [
      { type: "paragraph", attrs: { semanticKey: "first" }, content: [{ type: "text", text: "a" }] },
      { type: "paragraph", content: [{ type: "text", text: "b" }] }
    ] }) });
    const command = SemanticAttributes.config.addCommands().setSemanticAttributes;
    let dispatched = false;
    expect(command(3, { semanticKey: "first" })({ state, dispatch: () => { dispatched = true; } })).toBe(false);
    expect(dispatched).toBe(false);
    let transaction;
    expect(command(3, { semanticRole: "본문", semanticTags: ["나", "가", "나"] })({ state, dispatch: (tr) => { transaction = tr; } })).toBe(true);
    expect(transaction.doc.nodeAt(3).attrs).toMatchObject({ semanticKey: null, semanticRole: "본문", semanticTags: ["가", "나"] });
  });

  it("applies name and role in one history step and restores both with undo and redo", () => {
    const schema = getSchema(extensions);
    let currentState = EditorState.create({
      schema,
      doc: schema.nodeFromJSON({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "본문" }]
          }
        ]
      }),
      plugins: [history()]
    });
    const command = SemanticAttributes.config.addCommands().setSemanticAttributes;
    let semanticDispatchCount = 0;

    expect(
      command(0, {
        semanticKey: "summary",
        semanticRole: "executive"
      })({
        state: currentState,
        dispatch: (transaction) => {
          semanticDispatchCount += 1;
          currentState = currentState.apply(transaction);
        }
      })
    ).toBe(true);
    expect(semanticDispatchCount).toBe(1);
    expect(currentState.doc.nodeAt(0).attrs).toMatchObject({
      semanticKey: "summary",
      semanticRole: "executive"
    });

    expect(
      undo(currentState, (transaction) => {
        currentState = currentState.apply(transaction);
      })
    ).toBe(true);
    expect(currentState.doc.nodeAt(0).attrs).toMatchObject({
      semanticKey: null,
      semanticRole: null
    });

    expect(
      redo(currentState, (transaction) => {
        currentState = currentState.apply(transaction);
      })
    ).toBe(true);
    expect(currentState.doc.nodeAt(0).attrs).toMatchObject({
      semanticKey: "summary",
      semanticRole: "executive"
    });
  });

  it("reissues nested technical ids and deterministically remaps copy keys and references", () => {
    const schema = getSchema(copyInvariantExtensions);
    const originalShape = schema.nodeFromJSON({
      type: "shapeBlock",
      attrs: {
        objectId: "object-cover",
        semanticKey: "cover",
        semanticRole: "titleBox",
        semanticTags: ["accent", "cover"],
        backgroundColor: "#112233"
      },
      content: [
        {
          type: "heading",
          attrs: {
            level: 1,
            blockId: "block-title",
            headingId: "heading-title",
            semanticKey: "cover.title~2",
            semanticRole: "documentTitle",
            semanticTags: ["cover"]
          },
          content: [{ type: "text", text: "제목" }]
        }
      ]
    });
    const originalCaption = schema.nodeFromJSON({
      type: "captionBlock",
      attrs: { targetId: "object-cover", targetType: "shape" },
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "block-caption" },
          content: [{ type: "text", text: "표지 설명" }]
        }
      ]
    });
    const destination = schema.node("doc", null, [
      originalShape,
      originalCaption
    ]);
    const source = new Slice(
      Fragment.fromArray([originalShape, originalCaption]),
      0,
      0
    );
    let idSequence = 0;
    const createTechnicalId = (prefix) =>
      `${prefix}-copy-${++idSequence}`;

    const firstCopy = remapSemanticCopySlice(source, destination, {
      createTechnicalId
    });
    const firstShape = firstCopy.content.child(0);
    const firstHeading = firstShape.child(0);
    const firstCaption = firstCopy.content.child(1);

    expect(firstShape.attrs).toMatchObject({
      objectId: "object-copy-1",
      semanticKey: "cover~2",
      semanticRole: "titleBox",
      semanticTags: ["accent", "cover"],
      backgroundColor: "#112233"
    });
    expect(firstHeading.attrs).toMatchObject({
      blockId: "block-copy-2",
      headingId: "heading-copy-3",
      semanticKey: "cover.title~3",
      semanticRole: "documentTitle",
      semanticTags: ["cover"]
    });
    expect(firstCaption.attrs.targetId).toBe(firstShape.attrs.objectId);
    expect(firstCaption.child(0).attrs.blockId).toBe("block-copy-4");

    const destinationAfterFirstCopy = schema.node("doc", null, [
      originalShape,
      originalCaption,
      ...firstCopy.content.content
    ]);
    const secondCopy = remapSemanticCopySlice(source, destinationAfterFirstCopy, {
      createTechnicalId
    });
    expect(secondCopy.content.child(0).attrs.semanticKey).toBe("cover~3");
    expect(secondCopy.content.child(0).child(0).attrs.semanticKey).toBe(
      "cover.title~4"
    );
    expect(originalShape.attrs).toMatchObject({
      objectId: "object-cover",
      semanticKey: "cover"
    });
  });

  it("preserves the exact slice for an internal move", () => {
    const schema = getSchema(copyInvariantExtensions);
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            blockId: "block-move",
            semanticKey: "move.target",
            semanticRole: "body",
            semanticTags: ["stable"]
          },
          content: [{ type: "text", text: "이동" }]
        }
      ]
    });
    const source = new Slice(Fragment.from(doc.child(0)), 0, 0);

    expect(
      transformSemanticTransferSlice(source, {
        dragging: { move: true },
        state: { doc }
      })
    ).toBe(source);
  });

  it("uses the drop-time copy decision instead of the drag-start move hint", () => {
    const schema = getSchema(copyInvariantExtensions);
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            blockId: "block-drag",
            semanticKey: "drag.target"
          },
          content: [{ type: "text", text: "복사 드롭" }]
        }
      ]
    });
    const source = new Slice(Fragment.from(doc.child(0)), 0, 0);
    const plugin = SemanticAttributes.config.addProseMirrorPlugins()[0];
    const view = {
      dragging: { move: true },
      someProp: () => false,
      state: { doc }
    };

    expect(
      plugin.props.handleDOMEvents.drop(view, {
        altKey: false,
        ctrlKey: false
      })
    ).toBe(false);
    const copied = plugin.props.transformPasted(source, view);
    expect(copied).not.toBe(source);
    expect(copied.content.firstChild.attrs).toMatchObject({
      blockId: expect.not.stringMatching(/^block-drag$/),
      semanticKey: "drag.target~2"
    });
  });
});
