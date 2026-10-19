import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import {
  NOTE_ID_PREFIX,
  isValidNoteId,
  isValidNoteKind,
  validateNoteSemantics
} from "./noteSemanticUtils";

export const NOTE_OPERATION_TYPES = Object.freeze({
  INSERT: "insertNote",
  UPDATE_BODY: "updateNoteBody",
  DELETE: "deleteNote",
  CONVERT_KIND: "convertNoteKind"
});

export const NOTE_OPERATION_ERROR_CODES = Object.freeze({
  INVALID_EDITOR: "INVALID_EDITOR",
  UNKNOWN_OPERATION: "UNKNOWN_NOTE_OPERATION",
  INVALID_KIND: "INVALID_NOTE_KIND",
  INVALID_NOTE_ID: "INVALID_NOTE_ID",
  INVALID_POSITION: "INVALID_NOTE_INSERTION_POSITION",
  NOTE_NOT_FOUND: "NOTE_NOT_FOUND",
  NOTE_ID_COLLISION: "NOTE_ID_COLLISION",
  PREFLIGHT_FAILED: "NOTE_PREFLIGHT_FAILED",
  CANDIDATE_INVALID: "NOTE_CANDIDATE_INVALID",
  UNSUPPORTED_BODY_CONTENT: "NOTE_BODY_UNSUPPORTED_CONTENT",
  NO_CHANGE: "NOTE_OPERATION_NO_CHANGE",
  DISPATCH_REJECTED: "NOTE_DISPATCH_REJECTED",
  POST_DISPATCH_INVALID: "NOTE_POST_DISPATCH_INVALID",
  POST_DISPATCH_DIVERGED: "NOTE_POST_DISPATCH_DIVERGED",
  DISPATCH_FAILED: "NOTE_DISPATCH_FAILED"
});

let fallbackSequence = 0;

const defaultIdFactory = () => {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return `${NOTE_ID_PREFIX}${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
    }
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      const values = new Uint32Array(4);
      globalThis.crypto.getRandomValues(values);
      return `${NOTE_ID_PREFIX}${Array.from(values, (value) => value.toString(36)).join("_")}`;
    }
  } catch {
    // A monotonic fallback remains collision-resistant within this runtime.
  }
  fallbackSequence += 1;
  return `${NOTE_ID_PREFIX}fallback_${Date.now().toString(36)}_${fallbackSequence.toString(36)}`;
};

const fail = (code, details = {}) => ({
  ok: false,
  result: "rejected",
  error: { code, ...details }
});

const success = (validation) => ({
  ok: true,
  result: "applied",
  numbering: validation.numbering
});

const findNotes = (document) => {
  const references = new Map();
  const bodies = new Map();
  document.descendants((node, position) => {
    if (node.type.name === "noteReference") references.set(node.attrs.noteId, { node, position });
    if (node.type.name === "noteBody") bodies.set(node.attrs.noteId, { node, position });
    return true;
  });
  return { references, bodies };
};

const isInsideNoteBody = ($position) => {
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if ($position.node(depth).type.name === "noteBody") return true;
  }
  return false;
};

const resolveInsertionPosition = (state, referenceType, position) => {
  const candidate = position ?? (state.selection instanceof TextSelection && state.selection.empty
    ? state.selection.from
    : null);
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > state.doc.content.size) {
    return null;
  }
  try {
    const $position = state.doc.resolve(candidate);
    return $position.parent.isTextblock &&
      !isInsideNoteBody($position) &&
      $position.parent.canReplaceWith($position.index(), $position.index(), referenceType)
      ? candidate
      : null;
  } catch {
    return null;
  }
};

const createBodyContent = (schema, bodyType, content) => {
  if (!Array.isArray(content) || content.length === 0) return null;
  try {
    const fragment = Fragment.fromArray(
      content.map((node) => schema.nodeFromJSON(node))
    );
    return bodyType.validContent(fragment) ? fragment : null;
  } catch {
    return null;
  }
};

const validateCurrentDocument = (document) => {
  const validation = validateNoteSemantics(document);
  return validation.valid ? null : fail(NOTE_OPERATION_ERROR_CODES.PREFLIGHT_FAILED, {
    errors: validation.errors
  });
};

const validateCandidate = (transaction) => {
  const validation = validateNoteSemantics(transaction.doc);
  return validation.valid ? null : fail(NOTE_OPERATION_ERROR_CODES.CANDIDATE_INVALID, {
    errors: validation.errors
  });
};

const normalizeInlineNode = (node) => {
  const normalized = { type: node.type.name };
  if (node.isText) normalized.text = node.text;
  if (node.attrs && Object.keys(node.attrs).length > 0) {
    normalized.attrs = node.attrs;
  }
  if (node.marks.length > 0) {
    normalized.marks = node.marks.map((mark) => ({
      type: mark.type.name,
      ...(Object.keys(mark.attrs).length > 0 ? { attrs: mark.attrs } : {})
    }));
  }
  return normalized;
};

const createNoteSemanticProjection = (document) => {
  const references = [];
  const bodies = [];
  document.descendants((node) => {
    if (node.type.name === "noteReference") {
      references.push({ noteId: node.attrs.noteId, kind: node.attrs.kind });
      return false;
    }
    if (node.type.name !== "noteBody") return true;
    const content = [];
    node.forEach((paragraph) => {
      const inlineContent = [];
      paragraph.forEach((inlineNode) => {
        inlineContent.push(normalizeInlineNode(inlineNode));
      });
      content.push({
        type: paragraph.type.name,
        ...(inlineContent.length > 0 ? { content: inlineContent } : {})
      });
    });
    bodies.push({
      noteId: node.attrs.noteId,
      kind: node.attrs.kind,
      content
    });
    return false;
  });
  return JSON.stringify({ references, bodies });
};

const dispatchCandidate = (editor, transaction, previousDocument, transactionDecorator) => {
  const invalid = validateCandidate(transaction);
  if (invalid) return invalid;
  if (!transaction.docChanged || transaction.doc.eq(previousDocument)) {
    return fail(NOTE_OPERATION_ERROR_CODES.NO_CHANGE);
  }
  try {
    if (transactionDecorator) transactionDecorator(transaction);
  } catch {
    return fail(NOTE_OPERATION_ERROR_CODES.DISPATCH_FAILED, { stage: "transaction-decorator" });
  }
  const decoratedInvalid = validateCandidate(transaction);
  if (decoratedInvalid) return decoratedInvalid;
  if (!transaction.docChanged || transaction.doc.eq(previousDocument)) {
    return fail(NOTE_OPERATION_ERROR_CODES.NO_CHANGE);
  }
  const expectedProjection = createNoteSemanticProjection(transaction.doc);
  try {
    editor.view.dispatch(transaction);
  } catch {
    return fail(NOTE_OPERATION_ERROR_CODES.DISPATCH_FAILED, {
      recoveryRequired: !editor.state.doc.eq(previousDocument)
    });
  }
  if (editor.state.doc.eq(previousDocument)) {
    return fail(NOTE_OPERATION_ERROR_CODES.DISPATCH_REJECTED);
  }
  const finalValidation = validateNoteSemantics(editor.state.doc);
  if (!finalValidation.valid) {
    return fail(NOTE_OPERATION_ERROR_CODES.POST_DISPATCH_INVALID, {
      errors: finalValidation.errors,
      recoveryRequired: true
    });
  }
  if (createNoteSemanticProjection(editor.state.doc) !== expectedProjection) {
    return fail(NOTE_OPERATION_ERROR_CODES.POST_DISPATCH_DIVERGED, {
      recoveryRequired: true
    });
  }
  return success(finalValidation);
};

/**
 * Executes one N1b typed note operation through exactly one ProseMirror transaction.
 * Preflight/candidate rejections do not dispatch. Post-dispatch anomalies are
 * returned as recovery-required failures and are never reported as success.
 */
export const executeNoteOperation = (editor, operation, options = {}) => {
  const idFactory = options?.idFactory === undefined
    ? defaultIdFactory
    : options.idFactory;
  if (!editor?.state?.doc || !editor?.view?.dispatch) {
    return fail(NOTE_OPERATION_ERROR_CODES.INVALID_EDITOR);
  }

  const preflight = validateCurrentDocument(editor.state.doc);
  if (preflight) return preflight;
  if (!operation || typeof operation !== "object") {
    return fail(NOTE_OPERATION_ERROR_CODES.UNKNOWN_OPERATION);
  }

  const { type } = operation;
  if (!Object.values(NOTE_OPERATION_TYPES).includes(type)) {
    return fail(NOTE_OPERATION_ERROR_CODES.UNKNOWN_OPERATION);
  }

  const { state } = editor;
  const { schema } = state;
  const referenceType = schema.nodes.noteReference;
  const bodyType = schema.nodes.noteBody;
  if (!referenceType || !bodyType) return fail(NOTE_OPERATION_ERROR_CODES.INVALID_EDITOR);
  const notes = findNotes(state.doc);
  const transaction = state.tr;
  const buildAndDispatch = (build) => {
    try {
      build();
    } catch {
      return fail(NOTE_OPERATION_ERROR_CODES.CANDIDATE_INVALID, {
        stage: "transaction-build"
      });
    }
    return dispatchCandidate(editor, transaction, state.doc, options.transactionDecorator);
  };

  if (type === NOTE_OPERATION_TYPES.INSERT) {
    if (!isValidNoteKind(operation.kind)) return fail(NOTE_OPERATION_ERROR_CODES.INVALID_KIND);
    const position = resolveInsertionPosition(state, referenceType, operation.position);
    if (position === null) return fail(NOTE_OPERATION_ERROR_CODES.INVALID_POSITION);
    let noteId;
    try {
      noteId = idFactory();
    } catch {
      return fail(NOTE_OPERATION_ERROR_CODES.INVALID_NOTE_ID);
    }
    if (!isValidNoteId(noteId)) return fail(NOTE_OPERATION_ERROR_CODES.INVALID_NOTE_ID);
    if (notes.references.has(noteId) || notes.bodies.has(noteId)) {
      return fail(NOTE_OPERATION_ERROR_CODES.NOTE_ID_COLLISION, { noteId });
    }
    const bodyContent = createBodyContent(schema, bodyType, operation.bodyContent);
    if (!bodyContent) return fail(NOTE_OPERATION_ERROR_CODES.UNSUPPORTED_BODY_CONTENT);
    return buildAndDispatch(() => {
      const reference = referenceType.create({ noteId, kind: operation.kind });
      const body = bodyType.createChecked({ noteId, kind: operation.kind }, bodyContent);
      transaction.insert(position, reference);
      transaction.insert(transaction.doc.content.size, body);
    });
  }

  if (!isValidNoteId(operation.noteId)) return fail(NOTE_OPERATION_ERROR_CODES.INVALID_NOTE_ID);
  const reference = notes.references.get(operation.noteId);
  const body = notes.bodies.get(operation.noteId);
  if (!reference || !body) return fail(NOTE_OPERATION_ERROR_CODES.NOTE_NOT_FOUND, { noteId: operation.noteId });

  if (type === NOTE_OPERATION_TYPES.UPDATE_BODY) {
    const bodyContent = createBodyContent(schema, bodyType, operation.bodyContent);
    if (!bodyContent) return fail(NOTE_OPERATION_ERROR_CODES.UNSUPPORTED_BODY_CONTENT);
    return buildAndDispatch(() => {
      transaction.replaceWith(
        body.position + 1,
        body.position + body.node.nodeSize - 1,
        bodyContent
      );
    });
  }

  if (type === NOTE_OPERATION_TYPES.DELETE) {
    return buildAndDispatch(() => {
      transaction.delete(reference.position, reference.position + reference.node.nodeSize);
      const bodyPosition = transaction.mapping.map(body.position);
      transaction.delete(bodyPosition, bodyPosition + body.node.nodeSize);
    });
  }

  if (!isValidNoteKind(operation.kind)) return fail(NOTE_OPERATION_ERROR_CODES.INVALID_KIND);
  return buildAndDispatch(() => {
    transaction.setNodeMarkup(reference.position, undefined, {
      ...reference.node.attrs,
      kind: operation.kind
    });
    transaction.setNodeMarkup(body.position, undefined, {
      ...body.node.attrs,
      kind: operation.kind
    });
  });
};

export const createNoteOperationAdapter = (options = {}) => ({
  execute: (editor, operation) => executeNoteOperation(editor, operation, options)
});
