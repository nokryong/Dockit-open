import {
  mergeTextRectFragmentsIntoLines,
  resolveMeasuredLineSlots
} from "../model/collectDomMeasurements";
import {
  isValidNoteId,
  NOTE_PAIR_LIMIT,
  validateNoteSemantics
} from "../../utils/noteSemanticUtils";

const FOOTNOTE_KIND = "footnote";
const ENDNOTE_KIND = "endnote";

export class FootnoteDomMeasurementError extends Error {
  constructor(code, details = {}) {
    super(`Footnote DOM measurement failed: ${code}`);
    this.name = "FootnoteDomMeasurementError";
    this.code = code;
    this.details = details;
  }
}

const fail = (code, details) => {
  throw new FootnoteDomMeasurementError(code, details);
};

const isHtmlElement = (value) =>
  typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
const isPositiveFinite = (value) => Number.isFinite(value) && value > 0;
const GEOMETRY_TOLERANCE = 0.000001;
const getNodeName = (node) => node?.type?.name || null;
const getComputedStyles = (element) =>
  typeof window !== "undefined" && typeof window.getComputedStyle === "function"
    ? window.getComputedStyle(element)
    : null;
const parsePixelValue = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const getEffectiveLineHeight = (styles, fallbackHeight) => {
  const lineHeight = parsePixelValue(styles?.lineHeight);

  if (lineHeight > 0) return lineHeight;

  const fontSize = parsePixelValue(styles?.fontSize);
  return Math.max(fallbackHeight, fontSize > 0 ? fontSize * 1.5 : 0);
};

const MEASUREMENT_STYLE_PROPERTIES = Object.freeze([
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-variant",
  "font-stretch",
  "font-feature-settings",
  "font-variation-settings",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "white-space",
  "word-break",
  "overflow-wrap",
  "text-indent",
  "text-transform",
  "text-rendering",
  "direction",
  "writing-mode",
  "tab-size",
  "box-sizing",
  "min-height",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left"
]);

const copyComputedMeasurementStyles = (
  source,
  target,
  { copyCustomProperties = false } = {}
) => {
  const styles = getComputedStyles(source);
  if (!styles || typeof styles.getPropertyValue !== "function") return;

  MEASUREMENT_STYLE_PROPERTIES.forEach((property) => {
    const value = styles.getPropertyValue(property);
    if (value) target.style.setProperty(property, value);
  });

  if (!copyCustomProperties || !Number.isSafeInteger(styles.length)) return;
  for (let index = 0; index < styles.length; index += 1) {
    const property = styles[index];
    if (typeof property === "string" && property.startsWith("--")) {
      target.style.setProperty(property, styles.getPropertyValue(property));
    }
  }
};

const copyMeasurementTreeStyles = (sourceRoot, targetRoot) => {
  const sourceElements = [sourceRoot, ...sourceRoot.querySelectorAll("*")];
  const targetElements = [targetRoot, ...targetRoot.querySelectorAll("*")];

  if (sourceElements.length !== targetElements.length) {
    fail("FOOTNOTE_STAGING_CLONE_MISMATCH");
  }
  sourceElements.forEach((source, index) => {
    copyComputedMeasurementStyles(source, targetElements[index]);
  });
};

const stripMeasurementCloneIdentifiers = (root) => {
  [root, ...root.querySelectorAll("[id]")].forEach((element) => {
    element.removeAttribute("id");
  });
};

const normalizeProjectedMeasurementClone = (root) => {
  root.removeAttribute("data-dockit-footnote-projection-canonical");
  [
    "position",
    "z-index",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
    "height",
    "min-height",
    "max-height",
    "overflow",
    "transform"
  ].forEach((property) => root.style.removeProperty(property));
  root.style.removeProperty("--dockit-footnote-canonical-fragment-height");
};

const visitDocumentNodes = (
  node,
  callback,
  parent = null,
  pos = 0,
  ancestors = [],
  topLevelPos = null
) => {
  if (!node || typeof node.forEach !== "function") return;

  node.forEach((child, offset = 0) => {
    const childPos = pos + offset;
    const childAncestors = [...ancestors, node];
    const childTopLevelPos = parent === null ? childPos : topLevelPos;

    callback(child, childPos, node, childAncestors, childTopLevelPos);
    visitDocumentNodes(
      child,
      callback,
      node,
      childPos + 1,
      childAncestors,
      childTopLevelPos
    );
  });
};

const deriveSemanticNotePairs = (doc) => {
  if (!doc || typeof doc.forEach !== "function") {
    fail("INVALID_FOOTNOTE_DOCUMENT");
  }

  const references = new Map();
  const bodies = new Map();
  let footnoteReferenceOrder = 0;

  const addUnique = (target, noteId, entry, duplicateCode) => {
    if (target.has(noteId)) fail(duplicateCode, { noteId });
    target.set(noteId, entry);
  };

  visitDocumentNodes(doc, (node, pos, parent, ancestors, topLevelPos) => {
    const nodeType = getNodeName(node);

    if (nodeType !== "noteReference" && nodeType !== "noteBody") return;

    const noteId = node.attrs?.noteId;
    const kind = node.attrs?.kind;

    if (!isValidNoteId(noteId)) fail("INVALID_FOOTNOTE_ID", { noteId: noteId ?? null });
    if (kind !== FOOTNOTE_KIND && kind !== ENDNOTE_KIND) {
      fail("INVALID_FOOTNOTE_KIND", { noteId, kind: kind ?? null });
    }

    if (nodeType === "noteReference") {
      if (node.isInline === false || ancestors.some((ancestor) => getNodeName(ancestor) === "noteBody")) {
        fail("INVALID_FOOTNOTE_REFERENCE", { noteId });
      }
      if (kind === ENDNOTE_KIND) return;

      footnoteReferenceOrder += 1;
      addUnique(references, noteId, {
        noteId,
        kind,
        pos,
        blockPos: topLevelPos,
        order: footnoteReferenceOrder
      }, "DUPLICATE_FOOTNOTE_REFERENCE");
      return;
    }

    if (parent !== doc || ancestors.length !== 1) {
      fail("INVALID_FOOTNOTE_BODY", { noteId });
    }
    if (kind === ENDNOTE_KIND) return;

    addUnique(bodies, noteId, {
      noteId,
      kind,
      pos,
      node
    }, "DUPLICATE_FOOTNOTE_BODY");
  });

  if (references.size > NOTE_PAIR_LIMIT || bodies.size > NOTE_PAIR_LIMIT) {
    fail("FOOTNOTE_PAIR_LIMIT_EXCEEDED");
  }

  if (references.size !== bodies.size) {
    const missingBody = [...references.keys()].find((noteId) => !bodies.has(noteId));
    fail(missingBody ? "MISSING_FOOTNOTE_BODY" : "MISSING_FOOTNOTE_REFERENCE", {
      noteId: missingBody ?? [...bodies.keys()].find((noteId) => !references.has(noteId)) ?? null
    });
  }

  const pairs = [...references.values()].map((reference) => {
    const body = bodies.get(reference.noteId);

    if (!body || body.kind !== reference.kind) {
      fail("INVALID_FOOTNOTE_PAIR", { noteId: reference.noteId });
    }

    return { reference, body };
  });

  const semanticValidation = validateNoteSemantics(doc);
  if (!semanticValidation.valid) {
    fail("INVALID_NOTE_SEMANTICS", {
      semanticCode: semanticValidation.errors[0]?.code || null
    });
  }

  return pairs;
};

const assertLiveNodeDom = ({ element, marker, noteId, kind, code }) => {
  if (!isHtmlElement(element)) fail(code, { noteId });
  if (
    element.getAttribute(marker) !== "true" ||
    element.getAttribute("data-dockit-note-id") !== noteId ||
    element.getAttribute("data-dockit-note-kind") !== kind
  ) {
    fail(code, { noteId });
  }
};

const resolveLiveFootnotePairs = (view, pairs) => {
  if (!isHtmlElement(view?.dom) || typeof view?.nodeDOM !== "function") {
    fail("MISSING_FOOTNOTE_DOM");
  }

  return pairs.map(({ reference, body }) => {
    const referenceDom = view.nodeDOM(reference.pos);
    const bodyDom = view.nodeDOM(body.pos);

    assertLiveNodeDom({
      element: referenceDom,
      marker: "data-dockit-note-reference",
      noteId: reference.noteId,
      kind: reference.kind,
      code: "MISSING_FOOTNOTE_REFERENCE_DOM"
    });
    assertLiveNodeDom({
      element: bodyDom,
      marker: "data-dockit-note-body",
      noteId: body.noteId,
      kind: body.kind,
      code: "MISSING_FOOTNOTE_BODY_DOM"
    });

    const bodyRect = bodyDom.getBoundingClientRect();

    if (!isPositiveFinite(bodyRect?.width)) {
      fail("UNMEASURABLE_FOOTNOTE_BODY", { noteId: body.noteId });
    }

    return { reference, body, referenceDom, bodyDom };
  });
};

const removeMeasurementStage = (stage) => {
  try {
    stage?.remove();
  } catch (error) {
    fail("FOOTNOTE_STAGING_RESTORE_FAILED");
  }
};

/**
 * Creates a short-lived clone portal outside ProseMirror. Canonical NodeView
 * DOM is never reparented or mutated, so editor DOMObserver state and active
 * selections remain untouched. Portal DOM never leaves this lifecycle.
 */
export const stageFootnoteBodiesForMeasurement = ({ root, bodies }) => {
  if (!isHtmlElement(root) || !Array.isArray(bodies) || !bodies.length) {
    fail("INVALID_FOOTNOTE_STAGING_INPUT");
  }

  const rootRect = root.getBoundingClientRect();

  if (!isPositiveFinite(rootRect?.width)) fail("UNMEASURABLE_FOOTNOTE_ROOT");

  const uniqueBodies = new Set();
  bodies.forEach((body) => {
    if (
      !isHtmlElement(body) ||
      body.parentNode !== root ||
      uniqueBodies.has(body)
    ) {
      fail("INVALID_FOOTNOTE_STAGING_BODY");
    }
    if (
      body.getAttribute("data-dockit-note-body") !== "true" ||
      body.getAttribute("data-dockit-note-kind") !== FOOTNOTE_KIND ||
      !isValidNoteId(body.getAttribute("data-dockit-note-id"))
    ) {
      fail("INVALID_FOOTNOTE_STAGING_BODY");
    }
    uniqueBodies.add(body);
  });

  const host = root.ownerDocument?.body;
  if (!isHtmlElement(host)) fail("MISSING_FOOTNOTE_MEASUREMENT_HOST");

  const stage = root.cloneNode(false);
  if (!isHtmlElement(stage)) fail("FOOTNOTE_STAGING_FAILED");
  copyComputedMeasurementStyles(root, stage, { copyCustomProperties: true });
  stage.removeAttribute("id");
  stage.removeAttribute("contenteditable");
  stage.classList.add("dockit-footnote-measurement-stage");
  stage.setAttribute("data-dockit-footnote-measurement-stage", "true");
  stage.setAttribute("aria-hidden", "true");
  stage.style.position = "fixed";
  stage.style.top = "0";
  stage.style.left = "0";
  stage.style.width = `${isPositiveFinite(root.clientWidth) ? root.clientWidth : rootRect.width}px`;
  stage.style.margin = "0";
  stage.style.transform = "none";
  stage.style.visibility = "hidden";
  stage.style.pointerEvents = "none";

  const stagedBodies = [];
  let restored = false;

  const restore = () => {
    if (restored) return;
    removeMeasurementStage(stage);
    restored = true;
  };

  try {
    bodies.forEach((body) => {
      const sourceRect = body.getBoundingClientRect();
      if (!isPositiveFinite(sourceRect?.width)) {
        fail("UNMEASURABLE_FOOTNOTE_BODY", {
          noteId: body.getAttribute("data-dockit-note-id")
        });
      }
      const sourceLayoutWidth = isPositiveFinite(body.offsetWidth)
        ? body.offsetWidth
        : sourceRect.width;
      const stagedBody = body.cloneNode(true);
      if (!isHtmlElement(stagedBody)) fail("FOOTNOTE_STAGING_FAILED");
      copyMeasurementTreeStyles(body, stagedBody);
      normalizeProjectedMeasurementClone(stagedBody);
      // Keep the source DOM as the only owner of document identifiers while
      // the off-flow clone is attached. Styles are copied first so an
      // identifier-based selector cannot change the measured geometry.
      stripMeasurementCloneIdentifiers(stagedBody);
      stagedBody.classList.add("dockit-footnote-measurement-body");
      stagedBody.setAttribute("aria-hidden", "true");
      stagedBody.style.width = `${sourceLayoutWidth}px`;
      stagedBody.style.minWidth = `${sourceLayoutWidth}px`;
      stagedBody.style.maxWidth = `${sourceLayoutWidth}px`;
      stagedBody.style.boxSizing = "border-box";
      stagedBody.style.margin = "0";
      stage.appendChild(stagedBody);
      stagedBodies.push(stagedBody);
    });
    host.appendChild(stage);
  } catch (error) {
    try {
      restore();
    } catch (restoreError) {
      throw restoreError;
    }
    if (error instanceof FootnoteDomMeasurementError) throw error;
    fail("FOOTNOTE_STAGING_FAILED");
  }

  return Object.freeze({
    stagedBodies: Object.freeze(stagedBodies),
    restore
  });
};

const collectParagraphFragments = ({ paragraph, paragraphIndex }) => {
  const paragraphRect = paragraph.getBoundingClientRect();
  const styles = getComputedStyles(paragraph);
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  const rawLineFragments = Array.from(range.getClientRects())
    .filter((rect) => isPositiveFinite(rect.width) && isPositiveFinite(rect.height))
    .map((rect) => ({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      lineHeight: getEffectiveLineHeight(styles, rect.height)
    }));

  if (typeof range.detach === "function") range.detach();

  if (!rawLineFragments.length) {
    if (!isPositiveFinite(paragraphRect?.width) || !isPositiveFinite(paragraphRect?.height)) {
      fail("INVALID_FOOTNOTE_LINE_MEASUREMENT", { paragraphIndex });
    }
    rawLineFragments.push({
      top: paragraphRect.top,
      bottom: paragraphRect.bottom,
      left: paragraphRect.left,
      right: paragraphRect.right,
      lineHeight: getEffectiveLineHeight(styles, paragraphRect.height)
    });
  }

  const fallbackLineHeight = rawLineFragments[0]
    ? rawLineFragments[0].bottom - rawLineFragments[0].top
    : paragraphRect.height;
  const lineSlots = resolveMeasuredLineSlots({
    rawLineFragments: mergeTextRectFragmentsIntoLines(rawLineFragments),
    containerRect: paragraphRect,
    lineHeight: getEffectiveLineHeight(styles, fallbackLineHeight)
  });

  if (!lineSlots.length || lineSlots.some((line) => !isPositiveFinite(line.bottom - line.top))) {
    fail("INVALID_FOOTNOTE_LINE_MEASUREMENT", { paragraphIndex });
  }

  return {
    top: paragraphRect.top,
    bottom: paragraphRect.bottom,
    fragments: lineSlots.map((line, lineIndex) => ({
      paragraphIndex,
      lineIndex,
      measuredHeight: line.bottom - line.top
    }))
  };
};

const measureFootnoteBody = ({ body, bodyDom }) => {
  const paragraphs = Array.from(bodyDom.querySelectorAll("p"));

  if (paragraphs.length !== body.node.childCount || !paragraphs.every(isHtmlElement)) {
    fail("INVALID_FOOTNOTE_BODY_DOM", { noteId: body.noteId });
  }

  const bodyRect = bodyDom.getBoundingClientRect();
  if (!isPositiveFinite(bodyRect?.width) || !isPositiveFinite(bodyRect?.height)) {
    fail("UNMEASURABLE_FOOTNOTE_BODY", { noteId: body.noteId });
  }

  const paragraphMeasurements = paragraphs.map((paragraph, paragraphIndex) =>
    collectParagraphFragments({ paragraph, paragraphIndex })
  );
  const firstParagraph = paragraphMeasurements[0];
  const lastParagraph = paragraphMeasurements[paragraphMeasurements.length - 1];

  if (
    !firstParagraph ||
    !lastParagraph ||
    firstParagraph.top < bodyRect.top - GEOMETRY_TOLERANCE ||
    lastParagraph.bottom > bodyRect.bottom + GEOMETRY_TOLERANCE
  ) {
    fail("INVALID_FOOTNOTE_BODY_GEOMETRY", { noteId: body.noteId });
  }

  const fragments = [];
  let previousBottom = bodyRect.top;

  paragraphMeasurements.forEach((paragraphMeasurement, paragraphIndex) => {
    if (paragraphMeasurement.top < previousBottom - GEOMETRY_TOLERANCE) {
      fail("INVALID_FOOTNOTE_BODY_GEOMETRY", { noteId: body.noteId });
    }
    const leadingGap = Math.max(0, paragraphMeasurement.top - previousBottom);

    paragraphMeasurement.fragments.forEach((fragment, lineIndex) => {
      fragments.push({
        ...fragment,
        measuredHeight:
          fragment.measuredHeight + (lineIndex === 0 ? leadingGap : 0)
      });
    });
    previousBottom = paragraphMeasurement.bottom;

    if (paragraphIndex === paragraphMeasurements.length - 1) {
      const trailingGap = Math.max(0, bodyRect.bottom - previousBottom);
      fragments[fragments.length - 1].measuredHeight += trailingGap;
    }
  });

  const indexedFragments = fragments.map((fragment, fragmentIndex) => ({
    ...fragment,
    fragmentIndex
  }));
  const measuredHeight = indexedFragments.reduce(
    (total, fragment) => total + fragment.measuredHeight,
    0
  );

  if (
    !indexedFragments.length ||
    indexedFragments.some(
      (fragment, index) =>
        fragment.fragmentIndex !== index || !isPositiveFinite(fragment.measuredHeight)
    ) ||
    Math.abs(measuredHeight - bodyRect.height) > GEOMETRY_TOLERANCE
  ) {
    fail("INVALID_FOOTNOTE_FRAGMENTS", { noteId: body.noteId });
  }

  return Object.freeze({
    noteId: body.noteId,
    kind: FOOTNOTE_KIND,
    measuredHeight,
    fragments: Object.freeze(
      indexedFragments.map((fragment) => Object.freeze(fragment))
    )
  });
};

const createFallback = (error) => Object.freeze({
  status: "fallback",
  code: error instanceof FootnoteDomMeasurementError
    ? error.code
    : "FOOTNOTE_DOM_MEASUREMENT_FAILED",
  footnotes: Object.freeze([]),
  excludedBodyPositions: Object.freeze([])
});

const createOkCandidate = ({ footnotes = [], excludedBodyPositions = [] }) =>
  Object.freeze({
    status: "ok",
    footnotes: Object.freeze(footnotes),
    excludedBodyPositions: Object.freeze(excludedBodyPositions)
  });

/**
 * Builds a transient, opt-in footnote candidate. It always restores canonical
 * NodeView DOM before returning and intentionally contains no DOM references.
 */
export const collectFootnoteDomCandidate = (view) => {
  let lifecycle = null;

  try {
    const pairs = deriveSemanticNotePairs(view?.state?.doc);

    if (!pairs.length) {
      return createOkCandidate({});
    }

    const livePairs = resolveLiveFootnotePairs(view, pairs);
    lifecycle = stageFootnoteBodiesForMeasurement({
      root: view.dom,
      bodies: livePairs.map((pair) => pair.bodyDom)
    });
    const footnotes = livePairs.map(({ reference, body }, index) =>
      Object.freeze({
        reference: Object.freeze({ ...reference }),
        body: measureFootnoteBody({
          body,
          bodyDom: lifecycle.stagedBodies[index]
        })
      })
    );

    lifecycle.restore();
    lifecycle = null;

    return createOkCandidate({
      footnotes,
      excludedBodyPositions: livePairs.map(({ body }) => body.pos).sort((a, b) => a - b)
    });
  } catch (error) {
    if (lifecycle) {
      try {
        lifecycle.restore();
      } catch (restoreError) {
        return createFallback(restoreError);
      }
    }
    return createFallback(error);
  }
};
