export const NOTE_ID_PREFIX = "note-v1-";
export const NOTE_ID_MAX_LENGTH = 128;
export const NOTE_PAIR_LIMIT = 1024;
export const NOTE_BODY_MAX_UTF8_BYTES = 32768;

const NOTE_KINDS = new Set(["footnote", "endnote"]);
const NOTE_ID_PATTERN = /^note-v1-[A-Za-z0-9_-]+$/;
const NOTE_BODY_INLINE_NODE_TYPES = new Set(["hardBreak", "text"]);
const NOTE_BODY_MARK_TYPES = new Set([
  "bold",
  "highlight",
  "italic",
  "link",
  "strike",
  "subscript",
  "superscript",
  "textStyle",
  "underline"
]);
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

const toJson = (document) => {
  if (document && typeof document.toJSON === "function") {
    return document.toJSON();
  }

  return document;
};

const getUtf8ByteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

const isSafeLinkHref = (href) => {
  if (typeof href !== "string" || !href.trim()) return false;
  try {
    return SAFE_LINK_PROTOCOLS.has(
      new URL(href, "https://dockit.invalid").protocol
    );
  } catch {
    return false;
  }
};

export const isValidNoteId = (noteId) =>
  typeof noteId === "string" &&
  noteId.length <= NOTE_ID_MAX_LENGTH &&
  NOTE_ID_PATTERN.test(noteId);

export const isValidNoteKind = (kind) => NOTE_KINDS.has(kind);

const createError = (code, details = {}) => ({ code, ...details });

const hasNestedNoteReference = (node) => {
  if (Array.isArray(node)) {
    return node.some(hasNestedNoteReference);
  }

  if (!node || typeof node !== "object") {
    return false;
  }

  if (node.type === "noteReference") {
    return true;
  }

  return Array.isArray(node.content) && node.content.some(hasNestedNoteReference);
};

const validateBodyContent = (body, errors) => {
  const content = body.content;
  const noteId = body.attrs?.noteId ?? null;

  if (!Array.isArray(content) || content.length === 0) {
    errors.push(createError("NOTE_BODY_UNSUPPORTED_CHILDREN", { noteId }));
  } else if (content.some((child) => !child || child.type !== "paragraph")) {
    errors.push(createError("NOTE_BODY_UNSUPPORTED_CHILDREN", { noteId }));
  } else {
    content.forEach((paragraph) => {
      const inlineContent = paragraph.content;
      if (inlineContent !== undefined && !Array.isArray(inlineContent)) {
        errors.push(createError("NOTE_BODY_UNSUPPORTED_INLINE", { noteId }));
        return;
      }
      (inlineContent || []).forEach((inlineNode) => {
        if (inlineNode?.type === "noteReference") return;
        if (!inlineNode || !NOTE_BODY_INLINE_NODE_TYPES.has(inlineNode.type)) {
          errors.push(createError("NOTE_BODY_UNSUPPORTED_INLINE", {
            noteId,
            type: inlineNode?.type ?? null
          }));
          return;
        }
        if (inlineNode.type !== "text") return;
        if (typeof inlineNode.text !== "string") {
          errors.push(createError("NOTE_BODY_UNSUPPORTED_INLINE", { noteId, type: "text" }));
        }
        if (inlineNode.marks !== undefined && !Array.isArray(inlineNode.marks)) {
          errors.push(createError("NOTE_BODY_UNSUPPORTED_MARK", { noteId }));
          return;
        }
        (inlineNode.marks || []).forEach((mark) => {
          if (!mark || !NOTE_BODY_MARK_TYPES.has(mark.type)) {
            errors.push(createError("NOTE_BODY_UNSUPPORTED_MARK", {
              noteId,
              type: mark?.type ?? null
            }));
            return;
          }
          if (mark.type === "link" && !isSafeLinkHref(mark.attrs?.href)) {
            errors.push(createError("NOTE_BODY_UNSAFE_LINK", { noteId }));
          }
        });
      });
    });
  }

  if (hasNestedNoteReference(content)) {
    errors.push(createError("NESTED_NOTE_REFERENCE", { noteId }));
  }

  if (getUtf8ByteLength(content ?? null) > NOTE_BODY_MAX_UTF8_BYTES) {
    errors.push(createError("NOTE_BODY_PAYLOAD_TOO_LARGE", { noteId }));
  }
};

/**
 * Validates Dockit's N1a note-pair invariant without changing the input.
 * It accepts a Tiptap/ProseMirror JSON value or an object with toJSON().
 */
export const validateNoteSemantics = (document) => {
  const source = toJson(document);
  const errors = [];
  const references = [];
  const bodies = [];

  const visit = (node, depth = 0) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (node.type === "noteReference") {
      if (depth < 2) {
        errors.push(createError("NOTE_REFERENCE_NOT_INLINE", {
          noteId: node.attrs?.noteId ?? null
        }));
      }
      references.push(node);
      return;
    }

    if (node.type === "noteBody") {
      if (depth !== 1) {
        errors.push(createError("NOTE_BODY_NOT_DOCUMENT_OWNED", {
          noteId: node.attrs?.noteId ?? null
        }));
      }
      bodies.push(node);
      validateBodyContent(node, errors);
      return;
    }

    if (Array.isArray(node.content)) {
      node.content.forEach((child) => visit(child, depth + 1));
    }
  };

  if (
    !source ||
    typeof source !== "object" ||
    source.type !== "doc" ||
    !Array.isArray(source.content)
  ) {
    errors.push(createError("INVALID_NOTE_DOCUMENT"));
  } else {
    visit(source);
  }

  const referenceById = new Map();
  const bodyById = new Map();
  const collect = (nodes, target, duplicateCode) => {
    nodes.forEach((node) => {
      const noteId = node.attrs?.noteId;
      const kind = node.attrs?.kind;

      if (!isValidNoteId(noteId)) {
        errors.push(createError("INVALID_NOTE_ID", { noteId: noteId ?? null }));
      }
      if (!isValidNoteKind(kind)) {
        errors.push(createError("INVALID_NOTE_KIND", { noteId: noteId ?? null, kind: kind ?? null }));
      }
      if (target.has(noteId)) {
        errors.push(createError(duplicateCode, { noteId: noteId ?? null }));
        return;
      }
      target.set(noteId, node);
    });
  };

  collect(references, referenceById, "DUPLICATE_NOTE_REFERENCE");
  collect(bodies, bodyById, "DUPLICATE_NOTE_BODY");

  const noteIds = new Set([...referenceById.keys(), ...bodyById.keys()]);
  if (noteIds.size > NOTE_PAIR_LIMIT) {
    errors.push(createError("NOTE_PAIR_LIMIT_EXCEEDED", { limit: NOTE_PAIR_LIMIT }));
  }

  noteIds.forEach((noteId) => {
    const reference = referenceById.get(noteId);
    const body = bodyById.get(noteId);

    if (!reference) {
      errors.push(createError("ORPHAN_NOTE_BODY", { noteId }));
      return;
    }
    if (!body) {
      errors.push(createError("DANGLING_NOTE_REFERENCE", { noteId }));
      return;
    }
    if (reference.attrs?.kind !== body.attrs?.kind) {
      errors.push(createError("NOTE_KIND_MISMATCH", { noteId }));
    }
  });

  const numbering = [];
  const counters = { footnote: 0, endnote: 0 };
  references.forEach((reference) => {
    const { noteId, kind } = reference.attrs || {};
    if (!isValidNoteId(noteId) || !isValidNoteKind(kind) || !bodyById.has(noteId)) {
      return;
    }
    if (bodyById.get(noteId).attrs?.kind !== kind) {
      return;
    }
    counters[kind] += 1;
    numbering.push({ noteId, kind, number: counters[kind] });
  });

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    numbering: valid ? numbering : []
  };
};

export const deriveNoteReferenceNumbers = (document) =>
  validateNoteSemantics(document).numbering;
