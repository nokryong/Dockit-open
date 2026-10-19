import { Fragment, Slice } from "@tiptap/pm/model";
import {
  NOTE_ID_MAX_LENGTH,
  isValidNoteId,
  isValidNoteKind,
  validateNoteSemantics
} from "./noteSemanticUtils";
import { normalizeNoteBodyOrderInTransaction } from "../extensions/noteBodyOrderUtils";

export const NOTE_CLIPBOARD_ERROR_CODES = Object.freeze({
  PREFLIGHT_FAILED: "NOTE_CLIPBOARD_PREFLIGHT_FAILED",
  INVALID_PAIR: "NOTE_CLIPBOARD_INVALID_PAIR",
  INCOMPLETE_PAIR: "NOTE_CLIPBOARD_INCOMPLETE_PAIR",
  DUPLICATE_PAIR: "NOTE_CLIPBOARD_DUPLICATE_PAIR",
  RAW_HTML_INVALID: "NOTE_CLIPBOARD_RAW_HTML_INVALID",
  CANDIDATE_INVALID: "NOTE_CLIPBOARD_CANDIDATE_INVALID",
  DISPATCH_REJECTED: "NOTE_CLIPBOARD_DISPATCH_REJECTED",
  DISPATCH_FAILED: "NOTE_CLIPBOARD_DISPATCH_FAILED",
  POST_DISPATCH_INVALID: "NOTE_CLIPBOARD_POST_DISPATCH_INVALID",
  POST_DISPATCH_DIVERGED: "NOTE_CLIPBOARD_POST_DISPATCH_DIVERGED"
});

const fail = (code, details = {}) => ({
  ok: false,
  result: "rejected",
  error: { code, ...details }
});

const semanticDetails = (validation) => ({
  semanticCodes: [...new Set(validation.errors.map(({ code }) => code))]
});

const sliceJson = (slice) => JSON.stringify({
  content: slice.content.toJSON(),
  openStart: slice.openStart,
  openEnd: slice.openEnd
});

const noteNodesInSlice = (slice) => {
  const references = [];
  const bodies = [];
  slice.content.descendants((node) => {
    if (node.type.name === "noteReference") references.push(node);
    if (node.type.name === "noteBody") bodies.push(node);
  });
  return { references, bodies };
};

const destinationNoteIds = (document) => {
  const ids = new Set();
  document.descendants((node) => {
    if (node.type.name === "noteReference" || node.type.name === "noteBody") {
      ids.add(node.attrs.noteId);
    }
  });
  return ids;
};

const stableHash = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const allocateId = (sourceId, usedIds) => {
  const base = `note-v1-paste-${stableHash(sourceId)}`;
  let suffix = 1;
  let candidate = base;
  while (usedIds.has(candidate) || !isValidNoteId(candidate)) {
    suffix += 1;
    const reserved = `-${suffix}`;
    candidate = `${base.slice(0, NOTE_ID_MAX_LENGTH - reserved.length)}${reserved}`;
  }
  usedIds.add(candidate);
  return candidate;
};

const replaceNoteIds = (node, mapping) => {
  if (node.isText) return node;
  const mappedContent = node.content.size
    ? Fragment.fromArray(node.content.content.map((child) => replaceNoteIds(child, mapping)))
    : null;
  const mappedId = mapping.get(node.attrs?.noteId);
  const attrs = mappedId && (node.type.name === "noteReference" || node.type.name === "noteBody")
    ? { ...node.attrs, noteId: mappedId }
    : node.attrs;
  return node.type.create(attrs, mappedContent, node.marks);
};

const replaceSliceNoteIds = (slice, mapping) => new Slice(
  Fragment.fromArray(slice.content.content.map((node) => replaceNoteIds(node, mapping))),
  slice.openStart,
  slice.openEnd
);

const collectCompletePairs = (slice) => {
  const { references, bodies } = noteNodesInSlice(slice);
  if (references.length === 0 && bodies.length === 0) return { pairs: [], hasNotes: false };
  const byId = new Map();
  let invalid = false;
  let duplicate = false;
  const add = (node, field) => {
    const noteId = node.attrs?.noteId;
    if (!isValidNoteId(noteId) || !isValidNoteKind(node.attrs?.kind)) {
      invalid = true;
      return;
    }
    const pair = byId.get(noteId) || {};
    if (pair[field]) {
      duplicate = true;
      return;
    }
    pair[field] = node;
    byId.set(noteId, pair);
  };
  references.forEach((node) => add(node, "reference"));
  bodies.forEach((node) => add(node, "body"));
  if (invalid) return { error: NOTE_CLIPBOARD_ERROR_CODES.INVALID_PAIR, hasNotes: true };
  if (duplicate) return { error: NOTE_CLIPBOARD_ERROR_CODES.DUPLICATE_PAIR, hasNotes: true };
  const pairs = [...byId.entries()].map(([noteId, pair]) => ({ noteId, ...pair }));
  if (pairs.some(({ reference, body }) => !reference || !body)) {
    return { error: NOTE_CLIPBOARD_ERROR_CODES.INCOMPLETE_PAIR, hasNotes: true };
  }
  if (pairs.some(({ reference, body }) => reference.attrs.kind !== body.attrs.kind)) {
    return { error: NOTE_CLIPBOARD_ERROR_CODES.INVALID_PAIR, hasNotes: true };
  }
  return { pairs, hasNotes: true };
};

const RAW_NOTE_MARKER_PATTERN = /data-dockit-note-(?:reference|body)\b/i;
const NOTE_BODY_ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BR",
  "DEL",
  "EM",
  "I",
  "MARK",
  "P",
  "S",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "U"
]);
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

const isSafeRawLink = (href) => {
  if (typeof href !== "string" || !href.trim()) return false;
  try {
    return SAFE_LINK_PROTOCOLS.has(
      new URL(href, "https://dockit.invalid").protocol
    );
  } catch {
    return false;
  }
};

const rawSignature = (element, type) =>
  `${type}:${element.getAttribute("data-dockit-note-id") || ""}:${
    element.getAttribute("data-dockit-note-kind") || ""
  }`;

const sliceSignatures = (slice) => {
  const { references, bodies } = noteNodesInSlice(slice);
  return [
    ...references.map(
      (node) => `reference:${node.attrs?.noteId || ""}:${node.attrs?.kind || ""}`
    ),
    ...bodies.map(
      (node) => `body:${node.attrs?.noteId || ""}:${node.attrs?.kind || ""}`
    )
  ].sort();
};

/** Rejects raw note HTML that the schema parser would otherwise silently drop. */
export const preflightRawNoteClipboardHtml = ({ html, slice }) => {
  if (typeof html !== "string" || !RAW_NOTE_MARKER_PATTERN.test(html)) {
    return { ok: true, result: "not-note-html" };
  }

  try {
    const host = document.createElement("div");
    host.innerHTML = html;
    const references = [...host.querySelectorAll("[data-dockit-note-reference]")];
    const bodies = [...host.querySelectorAll("[data-dockit-note-body]")];
    const markerIsCanonical =
      references.every(
        (element) =>
          element.tagName === "SPAN" &&
          element.getAttribute("data-dockit-note-reference") === "true"
      ) &&
      bodies.every(
        (element) =>
          element.tagName === "SECTION" &&
          element.getAttribute("data-dockit-note-body") === "true"
      );
    const bodyMarkupIsSupported = bodies.every((body) =>
      [...body.childNodes].every(
        (node) =>
          (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) ||
          (node.nodeType === Node.ELEMENT_NODE && node.tagName === "P")
      ) &&
      [...body.querySelectorAll("*")].every((element) => {
        if (!NOTE_BODY_ALLOWED_TAGS.has(element.tagName)) return false;
        return element.tagName !== "A" || isSafeRawLink(element.getAttribute("href"));
      })
    );
    const rawSignatures = [
      ...references.map((element) => rawSignature(element, "reference")),
      ...bodies.map((element) => rawSignature(element, "body"))
    ].sort();
    if (
      !markerIsCanonical ||
      !bodyMarkupIsSupported ||
      JSON.stringify(rawSignatures) !== JSON.stringify(sliceSignatures(slice))
    ) {
      return fail(NOTE_CLIPBOARD_ERROR_CODES.RAW_HTML_INVALID);
    }
    return { ok: true, result: "validated-note-html" };
  } catch {
    return fail(NOTE_CLIPBOARD_ERROR_CODES.RAW_HTML_INVALID);
  }
};

/** Pure, deterministic remap/preflight. It does not dispatch or mutate the input slice. */
export const preflightNoteClipboardSlice = ({ slice, destinationDocument, preserveIds = false }) => {
  const current = validateNoteSemantics(destinationDocument);
  if (!current.valid) {
    return fail(NOTE_CLIPBOARD_ERROR_CODES.PREFLIGHT_FAILED, semanticDetails(current));
  }
  const collected = collectCompletePairs(slice);
  if (collected.error) return fail(collected.error);
  if (!collected.hasNotes) return { ok: true, result: "passthrough", slice, mapping: [] };

  const usedIds = destinationNoteIds(destinationDocument);
  const mapping = new Map();
  for (const { noteId } of collected.pairs) {
    if (preserveIds) {
      if (usedIds.has(noteId)) return fail(NOTE_CLIPBOARD_ERROR_CODES.CANDIDATE_INVALID);
      usedIds.add(noteId);
      mapping.set(noteId, noteId);
    } else {
      mapping.set(noteId, allocateId(noteId, usedIds));
    }
  }
  return {
    ok: true,
    result: "remapped",
    slice: replaceSliceNoteIds(slice, mapping),
    mapping: [...mapping.entries()].map(([sourceId, noteId]) => ({ sourceId, noteId }))
  };
};

/** Session-only provenance. HTML attributes are intentionally never considered provenance. */
export const createNoteClipboardProvenance = () => {
  let pendingAction = null;
  let cutRecord = null;
  return {
    begin(action) {
      pendingAction = action === "cut" ? "cut" : "copy";
      cutRecord = null;
    },
    record(slice, view) {
      const action = pendingAction;
      pendingAction = null;
      if (action !== "cut") return;
      const pairs = collectCompletePairs(slice);
      const ids = pairs.pairs?.map(({ noteId }) => noteId) || [];
      const sourceDocument = view?.state?.doc;
      const sourceIds = sourceDocument ? destinationNoteIds(sourceDocument) : new Set();
      cutRecord =
        sourceDocument &&
        pairs.hasNotes &&
        !pairs.error &&
        validateNoteSemantics(sourceDocument).valid &&
        ids.every((noteId) => sourceIds.has(noteId))
        ? { confirmed: false, signature: sliceJson(slice), ids, sourceView: view }
        : null;
    },
    confirmCut(view) {
      if (!cutRecord) return;
      if (view !== cutRecord.sourceView) {
        cutRecord = null;
        return;
      }
      const removed = cutRecord.ids.every(
        (noteId) => !destinationNoteIds(view.state.doc).has(noteId)
      );
      if (removed) cutRecord.confirmed = true;
      else cutRecord = null;
    },
    canPreserve(slice, view) {
      return Boolean(
        cutRecord?.confirmed &&
        cutRecord.sourceView === view &&
        cutRecord.signature === sliceJson(slice)
      );
    },
    consume(slice, view) {
      if (!this.canPreserve(slice, view)) return false;
      cutRecord = null;
      return true;
    }
  };
};

export const executeNoteClipboardPaste = (view, slice, provenance) => {
  const preserveIds = Boolean(provenance?.canPreserve(slice, view));
  const prepared = preflightNoteClipboardSlice({
    slice,
    destinationDocument: view.state.doc,
    preserveIds
  });
  if (!prepared.ok || prepared.result === "passthrough") return prepared;
  let transaction;
  try {
    transaction = view.state.tr.replaceSelection(prepared.slice);
    normalizeNoteBodyOrderInTransaction(transaction);
  } catch {
    return fail(NOTE_CLIPBOARD_ERROR_CODES.CANDIDATE_INVALID, { stage: "transaction-build" });
  }
  const candidate = validateNoteSemantics(transaction.doc);
  if (!candidate.valid) {
    return fail(NOTE_CLIPBOARD_ERROR_CODES.CANDIDATE_INVALID, semanticDetails(candidate));
  }
  const expected = JSON.stringify(transaction.doc.toJSON());
  const previous = view.state.doc;
  try {
    view.dispatch(transaction);
  } catch {
    return fail(NOTE_CLIPBOARD_ERROR_CODES.DISPATCH_FAILED, {
      recoveryRequired: !view.state.doc.eq(previous)
    });
  }
  if (view.state.doc.eq(previous)) return fail(NOTE_CLIPBOARD_ERROR_CODES.DISPATCH_REJECTED);
  const final = validateNoteSemantics(view.state.doc);
  if (!final.valid) {
    return fail(NOTE_CLIPBOARD_ERROR_CODES.POST_DISPATCH_INVALID, {
      ...semanticDetails(final),
      recoveryRequired: true
    });
  }
  if (JSON.stringify(view.state.doc.toJSON()) !== expected) {
    return fail(NOTE_CLIPBOARD_ERROR_CODES.POST_DISPATCH_DIVERGED, { recoveryRequired: true });
  }
  if (preserveIds) provenance.consume(slice, view);
  return { ok: true, result: "applied", mapping: prepared.mapping, numbering: final.numbering };
};
