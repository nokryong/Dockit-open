import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { collectPaginationDomModel } from "../../app/LIB/pagination/model/collectDomMeasurements";
import { buildPaginationInput } from "../../app/LIB/pagination/model/buildPaginationInput";
import { calculateFootnotePaginationPlan } from "../../app/LIB/pagination/notes/calculateFootnotePaginationPlan";
import {
  collectFootnoteDomCandidate,
  stageFootnoteBodiesForMeasurement
} from "../../app/LIB/pagination/notes/collectFootnoteDomCandidate";
import {
  createMeasurement,
  spikePageMetrics
} from "./fixtures/paginationSpikeFixtures";

const noteId = (suffix) => `note-v1-${suffix}`;
const rect = ({ top = 0, left = 0, width = 100, height = 10 }) => ({
  top,
  left,
  width,
  height,
  right: left + width,
  bottom: top + height
});

const setRect = (element, value) => {
  element.__testRect = { ...value };
  element.getBoundingClientRect = () => rect(element.__testRect);
};

const createNode = (name, attrs = {}, content = [], extra = {}) => ({
  type: { name },
  attrs,
  content,
  nodeSize: extra.nodeSize ?? (content.reduce((size, child) => size + child.nodeSize, 0) + 2),
  childCount: content.length,
  isInline: extra.isInline,
  isBlock: extra.isBlock ?? name !== "noteReference",
  forEach(callback) {
    let offset = 0;
    content.forEach((child, index) => {
      callback(child, offset, index);
      offset += child.nodeSize;
    });
  },
  toJSON() {
    return {
      type: name,
      ...(Object.keys(attrs).length ? { attrs } : {}),
      ...(content.length ? { content: content.map((child) => child.toJSON()) } : {})
    };
  }
});

const createDocument = (content) => createNode("doc", {}, content, {
  nodeSize: content.reduce((size, child) => size + child.nodeSize, 0) + 2
});

const createFootnoteNodes = (id, paragraphCount = 1) => {
  const reference = createNode("noteReference", { noteId: id, kind: "footnote" }, [], {
    nodeSize: 1,
    isInline: true
  });
  const referenceParagraph = createNode("paragraph", {}, [reference]);
  const paragraphs = Array.from({ length: paragraphCount }, () =>
    createNode("paragraph")
  );
  const body = createNode("noteBody", { noteId: id, kind: "footnote" }, paragraphs);

  return { reference, referenceParagraph, body };
};

const topLevelPositions = (doc) => {
  const positions = new Map();
  let pos = 0;

  doc.content.forEach((node) => {
    positions.set(node, pos);
    pos += node.nodeSize;
  });
  return positions;
};

const collectNodePositions = (doc) => {
  const positions = new Map();
  const visit = (node, pos = 0) => {
    node.forEach((child, offset) => {
      const childPos = pos + offset;
      positions.set(child, childPos);
      visit(child, childPos + 1);
    });
  };

  visit(doc);
  return positions;
};

const setNoteAttributes = (element, marker, id, kind) => {
  element.setAttribute(marker, "true");
  element.setAttribute("data-dockit-note-id", id);
  element.setAttribute("data-dockit-note-kind", kind);
};

const containsHtmlElement = (value, visited = new Set()) => {
  if (value instanceof HTMLElement) return true;
  if (!value || typeof value !== "object" || visited.has(value)) return false;
  visited.add(value);
  return Object.values(value).some((entry) => containsHtmlElement(entry, visited));
};

const createLiveView = ({ doc, footnoteBodies = new Map(), references = new Map() }) => {
  const root = document.createElement("div");
  const positions = collectNodePositions(doc);
  const domByPos = new Map();

  setRect(root, { width: 420, height: 300 });
  doc.content.forEach((node) => {
    const bodyElement = footnoteBodies.get(node.attrs?.noteId);
    const element = bodyElement || document.createElement(node.type.name === "paragraph" ? "p" : "section");

    if (!bodyElement) setRect(element, { width: 400, height: 30 });
    root.appendChild(element);
    domByPos.set(positions.get(node), element);
  });
  references.forEach((element, node) => {
    root.firstChild.appendChild(element);
    domByPos.set(positions.get(node), element);
  });

  return {
    dom: root,
    state: { doc },
    nodeDOM(pos) {
      return domByPos.get(pos) || null;
    }
  };
};

const createBodyDom = ({ id, kind = "footnote", paragraphs }) => {
  const body = document.createElement("section");
  const content = document.createElement("div");

  body.className = "dockit-note-body existing-class";
  setNoteAttributes(body, "data-dockit-note-body", id, kind);
  setRect(body, { width: 400, height: 60 });
  paragraphs.forEach(({ html = "", rect: paragraphRect, lineRects = [] }) => {
    const paragraph = document.createElement("p");
    paragraph.innerHTML = html;
    paragraph.__lineRects = lineRects;
    setRect(paragraph, paragraphRect);
    content.appendChild(paragraph);
  });
  body.appendChild(content);
  const nativeCloneNode = body.cloneNode.bind(body);
  body.cloneNode = (deep) => {
    const clone = nativeCloneNode(deep);
    setRect(clone, body.__testRect);
    const sourceParagraphs = Array.from(body.querySelectorAll("p"));
    const clonedParagraphs = Array.from(clone.querySelectorAll("p"));
    clonedParagraphs.forEach((paragraph, index) => {
      const source = sourceParagraphs[index];
      setRect(paragraph, source.__testRect);
      paragraph.__lineRects = source.__lineRects.map((lineRect) => ({ ...lineRect }));
    });
    return clone;
  };
  return body;
};

let windowInstance;
let originalGlobals;

beforeEach(() => {
  windowInstance = new Window();
  originalGlobals = {
    window: global.window,
    document: global.document,
    HTMLElement: global.HTMLElement,
    NodeFilter: global.NodeFilter
  };
  global.window = windowInstance;
  global.document = windowInstance.document;
  global.HTMLElement = windowInstance.HTMLElement;
  global.NodeFilter = windowInstance.NodeFilter;
  windowInstance.getComputedStyle = () => ({ lineHeight: "10px", fontSize: "10px" });
  document.createRange = () => {
    let selected = null;
    return {
      selectNodeContents(element) {
        selected = element;
      },
      getClientRects() {
        return selected?.__lineRects || [];
      },
      detach() {}
    };
  };
});

afterEach(() => {
  global.window = originalGlobals.window;
  global.document = originalGlobals.document;
  global.HTMLElement = originalGlobals.HTMLElement;
  global.NodeFilter = originalGlobals.NodeFilter;
  windowInstance?.close();
});

describe("N4b1b semantic footnote DOM candidates", () => {
  it("measures reference-ordered pairs, preserves rich DOM, and restores after repeated runs", () => {
    const firstId = noteId("first");
    const secondId = noteId("second");
    const first = createFootnoteNodes(firstId, 2);
    const second = createFootnoteNodes(secondId);
    const doc = createDocument([
      first.referenceParagraph,
      second.referenceParagraph,
      second.body,
      first.body
    ]);
    const firstBody = createBodyDom({
      id: firstId,
      paragraphs: [
        {
          html: '<a href="https://example.test"><strong>rich text</strong></a>',
          rect: { top: 0, width: 300, height: 25 },
          lineRects: [rect({ top: 0, width: 120, height: 10 }), rect({ top: 15, width: 80, height: 10 })]
        },
        { rect: { top: 30, width: 300, height: 10 }, lineRects: [] }
      ]
    });
    const secondBody = createBodyDom({
      id: secondId,
      paragraphs: [{ html: "second", rect: { top: 0, width: 300, height: 10 }, lineRects: [rect({ width: 80, height: 10 })] }]
    });
    const firstReference = document.createElement("span");
    const secondReference = document.createElement("span");
    setNoteAttributes(firstReference, "data-dockit-note-reference", firstId, "footnote");
    setNoteAttributes(secondReference, "data-dockit-note-reference", secondId, "footnote");
    const view = createLiveView({
      doc,
      footnoteBodies: new Map([[firstId, firstBody], [secondId, secondBody]]),
      references: new Map([[first.reference, firstReference], [second.reference, secondReference]])
    });
    const blockPositions = topLevelPositions(doc);
    const originalHtml = firstBody.innerHTML;
    const originalParent = firstBody.parentNode;

    const firstResult = collectFootnoteDomCandidate(view);
    const secondResult = collectFootnoteDomCandidate(view);

    expect(firstResult).toEqual(secondResult);
    expect(firstResult.status, firstResult.code).toBe("ok");
    expect(firstResult.footnotes.map((entry) => entry.reference.noteId)).toEqual([firstId, secondId]);
    expect(firstResult.footnotes[0].reference.blockPos).toBe(
      blockPositions.get(first.referenceParagraph)
    );
    expect(firstResult.footnotes[1].reference.blockPos).toBe(
      blockPositions.get(second.referenceParagraph)
    );
    expect(firstResult.footnotes[0].body.measuredHeight).toBe(60);
    expect(firstResult.footnotes[0].body.fragments.map((fragment) => fragment.fragmentIndex)).toEqual([0, 1, 2]);
    expect(firstResult.footnotes[0].body.fragments.map((fragment) => fragment.measuredHeight)).toEqual([12.5, 12.5, 35]);
    expect(firstResult.footnotes[0].body.fragments.reduce(
      (total, fragment) => total + fragment.measuredHeight,
      0
    )).toBe(firstResult.footnotes[0].body.measuredHeight);
    expect(firstBody.parentNode).toBe(originalParent);
    expect(firstBody.innerHTML).toBe(originalHtml);
    expect(firstBody.querySelector("a strong").textContent).toBe("rich text");
    expect(view.dom.querySelector(".dockit-footnote-measurement-stage")).toBeNull();
    expect(containsHtmlElement(firstResult)).toBe(false);
    expect(Object.isFrozen(firstResult)).toBe(true);
    expect(Object.isFrozen(firstResult.footnotes)).toBe(true);
    expect(Object.isFrozen(firstResult.footnotes[0].body.fragments[0])).toBe(true);

    const referenceBlocks = [first.referenceParagraph, second.referenceParagraph].map(
      (paragraph, index) => ({
        pos: blockPositions.get(paragraph),
        index,
        nodeType: "paragraph"
      })
    );
    const integration = calculateFootnotePaginationPlan({
      paginationInput: {
        measurements: referenceBlocks.map((block, measurementIndex) =>
          createMeasurement({
            pos: block.pos,
            blockPos: block.pos,
            blockIndex: block.index,
            measurementIndex,
            offsetHeight: 20
          })
        ),
        contentAreaHeight: 300,
        pageMetrics: { width: 400, padding: { left: 0, right: 0 } },
        blocks: referenceBlocks
      },
      footnotes: firstResult.footnotes,
      maxFootnoteAreaHeight: 150
    });
    expect(integration).toMatchObject({ status: "stable" });
    expect(integration.plan.pages[0].footnote.segments).toHaveLength(2);
  });

  it("fails closed and restores every staged body when a paragraph cannot be measured", () => {
    const id = noteId("unmeasurable");
    const nodes = createFootnoteNodes(id);
    const doc = createDocument([nodes.referenceParagraph, nodes.body]);
    const body = createBodyDom({
      id,
      paragraphs: [{ html: "bad", rect: { top: 0, width: 0, height: 0 }, lineRects: [] }]
    });
    const reference = document.createElement("span");
    setNoteAttributes(reference, "data-dockit-note-reference", id, "footnote");
    const view = createLiveView({
      doc,
      footnoteBodies: new Map([[id, body]]),
      references: new Map([[nodes.reference, reference]])
    });
    const originalParent = body.parentNode;
    const result = collectFootnoteDomCandidate(view);

    expect(result).toEqual({
      status: "fallback",
      code: "INVALID_FOOTNOTE_LINE_MEASUREMENT",
      footnotes: [],
      excludedBodyPositions: []
    });
    expect(body.parentNode).toBe(originalParent);
    expect(body.className).toBe("dockit-note-body existing-class");
    expect(view.dom.querySelector(".dockit-footnote-measurement-stage")).toBeNull();
  });

  it("leaves endnotes in place and treats missing semantic counterparts as typed fallback", () => {
    const footId = noteId("foot");
    const endId = noteId("end");
    const foot = createFootnoteNodes(footId);
    const endReference = createNode(
      "noteReference",
      { noteId: endId, kind: "endnote" },
      [],
      { nodeSize: 1, isInline: true }
    );
    const endReferenceParagraph = createNode("paragraph", {}, [endReference]);
    const endBody = createNode("noteBody", { noteId: endId, kind: "endnote" }, [createNode("paragraph")]);
    const doc = createDocument([
      foot.referenceParagraph,
      endReferenceParagraph,
      foot.body,
      endBody
    ]);
    const footBody = createBodyDom({
      id: footId,
      paragraphs: [{ html: "foot", rect: { width: 300, height: 10 }, lineRects: [rect({ width: 80, height: 10 })] }]
    });
    const endBodyDom = createBodyDom({ id: endId, kind: "endnote", paragraphs: [{ rect: { width: 300, height: 10 } }] });
    const reference = document.createElement("span");
    const endReferenceDom = document.createElement("span");
    setNoteAttributes(reference, "data-dockit-note-reference", footId, "footnote");
    setNoteAttributes(endReferenceDom, "data-dockit-note-reference", endId, "endnote");
    const view = createLiveView({
      doc,
      footnoteBodies: new Map([[footId, footBody], [endId, endBodyDom]]),
      references: new Map([
        [foot.reference, reference],
        [endReference, endReferenceDom]
      ])
    });

    expect(collectFootnoteDomCandidate(view).status).toBe("ok");
    expect(endBodyDom.parentNode).toBe(view.dom);
    expect(endBodyDom.classList.contains("dockit-footnote-measurement-body")).toBe(false);

    const missingBody = createDocument([foot.referenceParagraph]);
    expect(collectFootnoteDomCandidate({ state: { doc: missingBody } })).toMatchObject({
      status: "fallback",
      code: "MISSING_FOOTNOTE_BODY",
      footnotes: []
    });
  });

  it("fails closed for duplicate semantics or malformed live references without staging bodies", () => {
    const id = noteId("duplicate");
    const first = createFootnoteNodes(id);
    const secondReferenceParagraph = createNode("paragraph", {}, [createNode(
      "noteReference",
      { noteId: id, kind: "footnote" },
      [],
      { nodeSize: 1, isInline: true }
    )]);
    const duplicateDocument = createDocument([
      first.referenceParagraph,
      secondReferenceParagraph,
      first.body
    ]);

    expect(collectFootnoteDomCandidate({ state: { doc: duplicateDocument } })).toMatchObject({
      status: "fallback",
      code: "DUPLICATE_FOOTNOTE_REFERENCE",
      footnotes: []
    });

    const validDocument = createDocument([first.referenceParagraph, first.body]);
    const body = createBodyDom({
      id,
      paragraphs: [{ html: "body", rect: { width: 300, height: 10 }, lineRects: [rect({ width: 80, height: 10 })] }]
    });
    const malformedReference = document.createElement("span");
    const view = createLiveView({
      doc: validDocument,
      footnoteBodies: new Map([[id, body]]),
      references: new Map([[first.reference, malformedReference]])
    });
    const originalParent = body.parentNode;

    expect(collectFootnoteDomCandidate(view)).toMatchObject({
      status: "fallback",
      code: "MISSING_FOOTNOTE_REFERENCE_DOM",
      footnotes: []
    });
    expect(body.parentNode).toBe(originalParent);
    expect(view.dom.querySelector(".dockit-footnote-measurement-stage")).toBeNull();
  });

  it("keeps legacy default inputs unchanged while candidate mode excludes only footnote bodies", () => {
    const footId = noteId("flow-foot");
    const endId = noteId("flow-end");
    const pmDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "before" },
            { type: "noteReference", attrs: { noteId: footId, kind: "footnote" } },
            { type: "noteReference", attrs: { noteId: endId, kind: "endnote" } }
          ]
        },
        { type: "noteBody", attrs: { noteId: footId, kind: "footnote" }, content: [{ type: "paragraph" }] },
        { type: "noteBody", attrs: { noteId: endId, kind: "endnote" }, content: [{ type: "paragraph" }] },
        { type: "paragraph", content: [{ type: "text", text: "after" }] }
      ]
    };
    const editorState = {
      doc: {
        forEach(callback) {
          pmDoc.content.forEach((node, index) => {
            callback({
              type: { name: node.type },
              attrs: node.attrs || {},
              nodeSize: 10
            }, [0, 8, 12, 16][index]);
          });
        },
        toJSON() {
          return pmDoc;
        }
      }
    };
    const domModel = {
      blocks: [
        { pos: 0, type: "paragraph" },
        { pos: 8, type: "noteBody" },
        { pos: 12, type: "noteBody" },
        { pos: 16, type: "paragraph" }
      ],
      measurements: [
        createMeasurement({ pos: 0, blockPos: 0, offsetHeight: 10 }),
        createMeasurement({ pos: 8, blockPos: 8, offsetHeight: 20 }),
        createMeasurement({ pos: 12, blockPos: 12, offsetHeight: 30 }),
        createMeasurement({ pos: 16, blockPos: 16, offsetHeight: 10 })
      ]
    };
    const legacy = buildPaginationInput({ editorState, pageMetrics: spikePageMetrics, domModel });
    const candidate = buildPaginationInput({
      editorState,
      pageMetrics: spikePageMetrics,
      domModel,
      footnoteCandidate: { status: "ok", excludedBodyPositions: [8, 0] }
    });
    const unvalidatedCandidate = buildPaginationInput({
      editorState,
      pageMetrics: spikePageMetrics,
      domModel,
      footnoteCandidate: { excludedBodyPositions: [8] }
    });

    const currentLegacy = buildPaginationInput({ editorState, pageMetrics: spikePageMetrics, domModel });
    expect({ ...currentLegacy.ir.metadata, extractedAt: null }).toEqual({
      ...legacy.ir.metadata,
      extractedAt: null
    });
    expect({ ...currentLegacy, ir: undefined }).toEqual({ ...legacy, ir: undefined });
    expect(candidate.blocks.map((block) => [block.pos, block.index, block.irBlock?.type])).toEqual([
      [0, 0, "paragraph"],
      [12, 2, undefined],
      [16, 3, "paragraph"]
    ]);
    expect(candidate.measurements.map((measurement) => measurement.blockPos)).toEqual([0, 12, 16]);
    expect(unvalidatedCandidate.blocks.map((block) => block.pos)).toEqual([0, 8, 12, 16]);
  });

  it("excludes staged footnotes from collector block accounting without excluding endnotes", () => {
    const footnote = createNode("noteBody", { noteId: noteId("collector-foot"), kind: "footnote" });
    const endnote = createNode("noteBody", { noteId: noteId("collector-end"), kind: "endnote" });
    const doc = createDocument([createNode("paragraph"), footnote, endnote]);
    const positions = topLevelPositions(doc);
    const root = document.createElement("div");

    setRect(root, { width: 400, height: 100 });
    const domByPos = new Map([...positions.entries()].map(([node, pos]) => {
      const element = document.createElement("section");
      setRect(element, { width: 300, height: 10 });
      root.appendChild(element);
      return [pos, element];
    }));
    const view = { dom: root, state: { doc }, nodeDOM: (pos) => domByPos.get(pos) };

    const defaultModel = collectPaginationDomModel(view);
    const candidateModel = collectPaginationDomModel(view, {
      footnoteCandidate: {
        status: "ok",
        excludedBodyPositions: [positions.get(footnote)]
      }
    });
    const fallbackModel = collectPaginationDomModel(view, {
      footnoteCandidate: {
        status: "fallback",
        excludedBodyPositions: [positions.get(footnote)]
      }
    });

    expect(defaultModel.blocks.map((block) => block.pos)).toEqual([0, positions.get(footnote), positions.get(endnote)]);
    expect(candidateModel.blocks.map((block) => block.pos)).toEqual([0, positions.get(endnote)]);
    expect(fallbackModel.blocks).toEqual(defaultModel.blocks);
  });

  it("provides a measurable, idempotently restorable off-flow staging lifecycle", () => {
    const root = document.createElement("div");
    const body = document.createElement("section");
    const sibling = document.createElement("p");
    const identifiedChild = document.createElement("strong");

    setRect(root, { width: 400, height: 100 });
    identifiedChild.id = "footnote-source-identifier";
    identifiedChild.textContent = "source identity";
    body.appendChild(identifiedChild);
    root.append(body, sibling);
    document.body.appendChild(root);
    root.className = "original-root";
    body.className = "original";
    setNoteAttributes(body, "data-dockit-note-body", noteId("lifecycle"), "footnote");
    setRect(body, { width: 300, height: 20 });
    const originalChildren = [...root.children];
    const lifecycle = stageFootnoteBodiesForMeasurement({ root, bodies: [body] });

    const stage = document.body.querySelector(".dockit-footnote-measurement-stage");
    expect(stage).not.toBeNull();
    expect([...root.children]).toEqual(originalChildren);
    expect(root.className).toBe("original-root");
    expect(body.className).toBe("original");
    expect(body.parentNode).toBe(root);
    expect(body.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(lifecycle.stagedBodies).toHaveLength(1);
    expect(lifecycle.stagedBodies[0]).not.toBe(body);
    expect(lifecycle.stagedBodies[0].parentNode).toBe(stage);
    expect(document.querySelectorAll("#footnote-source-identifier")).toHaveLength(1);
    expect(lifecycle.stagedBodies[0].querySelector("[id]")).toBeNull();
    expect(body.querySelector("#footnote-source-identifier")).toBe(identifiedChild);
    lifecycle.restore();
    lifecycle.restore();
    expect([...root.children]).toEqual([body, sibling]);
    expect(root.className).toBe("original-root");
    expect(body.className).toBe("original");
    expect(document.body.querySelector(".dockit-footnote-measurement-stage")).toBeNull();

    const retryLifecycle = stageFootnoteBodiesForMeasurement({ root, bodies: [body] });
    const retryStage = document.body.querySelector(".dockit-footnote-measurement-stage");
    const removeStage = retryStage.remove.bind(retryStage);
    let removalAttempts = 0;
    retryStage.remove = () => {
      removalAttempts += 1;
      if (removalAttempts === 1) throw new Error("transient remove failure");
      removeStage();
    };
    expect(() => retryLifecycle.restore()).toThrow(
      expect.objectContaining({ code: "FOOTNOTE_STAGING_RESTORE_FAILED" })
    );
    expect(retryStage.isConnected).toBe(true);
    expect(() => retryLifecycle.restore()).not.toThrow();
    expect(retryStage.isConnected).toBe(false);
  });
});
