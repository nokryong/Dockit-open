import { performance } from "node:perf_hooks";

import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { generateHTML, generateJSON } from "@tiptap/html/server";
import { Fragment, Slice } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";

import BlockIdentity from "../../app/LIB/extensions/BlockIdentity";
import HeadingWithId from "../../app/LIB/extensions/HeadingWithId";
import { ShapeBlock } from "../../app/LIB/extensions/ShapeBlock";
import SemanticAttributes from "../../app/LIB/extensions/SemanticAttributes";
import {
  DKT_SEMANTIC_SCHEMA_VERSION,
  createDockitDocumentSnapshot,
  normalizeDockitDocumentForImport
} from "../../app/LIB/utils/dktDocumentUtils";
import {
  remapSemanticCopySlice,
  transformSemanticTransferSlice
} from "../../app/LIB/utils/semanticCopyUtils";

const journeyExtensions = [
  Document,
  Paragraph,
  Text,
  HeadingWithId.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  ShapeBlock,
  BlockIdentity,
  SemanticAttributes
];

const performanceExtensions = [
  Document,
  Paragraph,
  Text,
  BlockIdentity,
  SemanticAttributes
];

const journeyDocument = {
  type: "doc",
  content: [
    {
      type: "shapeBlock",
      attrs: {
        objectId: "object-cover",
        semanticKey: "cover.hero",
        semanticRole: "visualBlock",
        semanticTags: ["accent", "cover"],
        backgroundColor: "#e9f8f5",
        borderColor: "#147d73"
      },
      content: [
        {
          type: "heading",
          attrs: {
            level: 1,
            blockId: "block-cover-title",
            headingId: "heading-cover-title",
            semanticKey: "cover.title",
            semanticRole: "documentTitle",
            semanticTags: ["cover"]
          },
          content: [{ type: "text", text: "Dockit meaning journey" }]
        }
      ]
    },
    {
      type: "shapeBlock",
      attrs: {
        objectId: "object-summary",
        semanticKey: "summary.card",
        semanticRole: "visualBlock",
        semanticTags: ["summary"]
      },
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "block-summary-body" },
          content: [{ type: "text", text: "Summary" }]
        }
      ]
    },
    {
      type: "shapeBlock",
      attrs: {
        objectId: "object-next",
        semanticKey: "next.card",
        semanticRole: "visualBlock",
        semanticTags: ["action"]
      },
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "block-next-body" },
          content: [{ type: "text", text: "Next action" }]
        }
      ]
    }
  ]
};

const median = (values) =>
  [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];

const measureMedian = (operation, runs = 3) => {
  const samples = [];
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    operation();
    samples.push(performance.now() - startedAt);
  }
  return median(samples);
};

const createPerformanceFixture = (nodeCount) => {
  const json = {
    type: "doc",
    content: Array.from({ length: nodeCount }, (_, index) => ({
      type: "paragraph",
      attrs: {
        blockId: `block-${index}`,
        semanticKey: `section.item-${index}`,
        semanticRole: "body"
      },
      content: [{ type: "text", text: `Item ${index}` }]
    }))
  };
  const schema = getSchema(performanceExtensions);
  return {
    proseMirrorDocument: schema.nodeFromJSON(json)
  };
};

describe("semantic labeling M5 integrated journey", () => {
  it("keeps meaning through nested objects, DKT, and copy/move", () => {
    const schema = getSchema(journeyExtensions);
    const sourceDocument = schema.nodeFromJSON(journeyDocument);
    const html = generateHTML(sourceDocument.toJSON(), journeyExtensions);
    const snapshot = createDockitDocumentSnapshot({
      title: "M5 journey",
      content: html,
      docSetting: {},
      bulletStyle: {},
      viewPage: true,
      pageNumber: "center",
      focus: 0
    });
    const reopened = normalizeDockitDocumentForImport(snapshot);
    const reopenedJson = generateJSON(reopened.content, journeyExtensions);

    expect(snapshot.schemaVersion).toBe(DKT_SEMANTIC_SCHEMA_VERSION);
    expect(reopenedJson.content[0]).toMatchObject({
      type: "shapeBlock",
      attrs: {
        objectId: "object-cover",
        semanticKey: "cover.hero",
        semanticRole: "visualBlock",
        semanticTags: ["accent", "cover"]
      },
      content: [
        {
          type: "heading",
          attrs: {
            blockId: "block-cover-title",
            headingId: "heading-cover-title",
            semanticKey: "cover.title",
            semanticRole: "documentTitle",
            semanticTags: ["cover"]
          }
        }
      ]
    });

    const shapeNodes = reopenedJson.content.filter(
      (node) => node.type === "shapeBlock"
    );
    expect(shapeNodes.map((node) => node.attrs.semanticRole)).toEqual([
      "visualBlock",
      "visualBlock",
      "visualBlock"
    ]);
    expect(new Set(shapeNodes.map((node) => node.attrs.semanticKey)).size).toBe(
      3
    );

    const reopenedDocument = schema.nodeFromJSON(reopenedJson);
    const source = new Slice(Fragment.from(reopenedDocument.child(0)), 0, 0);
    let technicalIdSequence = 0;
    const copied = remapSemanticCopySlice(source, reopenedDocument, {
      createTechnicalId: (prefix) =>
        `${prefix}-m5-copy-${++technicalIdSequence}`
    });
    const copiedShape = copied.content.child(0);
    const copiedHeading = copiedShape.child(0);

    expect(copiedShape.attrs).toMatchObject({
      objectId: "object-m5-copy-1",
      semanticKey: "cover.hero~2",
      semanticRole: "visualBlock",
      semanticTags: ["accent", "cover"],
      backgroundColor: "#e9f8f5",
      borderColor: "#147d73"
    });
    expect(copiedHeading.attrs).toMatchObject({
      blockId: "block-m5-copy-2",
      headingId: "heading-m5-copy-3",
      semanticKey: "cover.title~2",
      semanticRole: "documentTitle",
      semanticTags: ["cover"]
    });
    expect(
      transformSemanticTransferSlice(source, {
        dragging: { move: true },
        state: { doc: reopenedDocument }
      })
    ).toBe(source);

  });

  it("keeps semantic copy scans within a linear large-document slope", () => {
    const smallNodeCount = 2_000;
    const largeNodeCount = 8_000;
    const small = createPerformanceFixture(smallNodeCount);
    const large = createPerformanceFixture(largeNodeCount);
    const copySource = new Slice(
      Fragment.from(small.proseMirrorDocument.child(0)),
      0,
      0
    );

    let copyId = 0;
    const measureCopy = (destination) => measureMedian(() => {
      const copied = remapSemanticCopySlice(copySource, destination, {
        createTechnicalId: (prefix) => `${prefix}-performance-${++copyId}`
      });
      expect(copied.content.child(0).attrs.semanticKey).toBe("section.item-0~2");
    });
    const smallCopyMs = measureCopy(small.proseMirrorDocument);
    const largeCopyMs = measureCopy(large.proseMirrorDocument);

    const evidence = {
      nodes: { small: smallNodeCount, large: largeNodeCount },
      copyMs: {
        small: Number(smallCopyMs.toFixed(2)),
        large: Number(largeCopyMs.toFixed(2))
      }
    };
    console.log("M5 semantic large-document performance", JSON.stringify(evidence));

    expect(largeCopyMs).toBeLessThan(smallCopyMs * 7 + 250);
    expect(largeCopyMs).toBeLessThan(1_000);
  }, 20_000);
});
