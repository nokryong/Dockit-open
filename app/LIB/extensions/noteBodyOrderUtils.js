import { Fragment } from "@tiptap/pm/model";
import { Selection, TextSelection } from "@tiptap/pm/state";

export const NOTE_BODY_ORDER_NORMALIZED_META =
  "dockitNoteBodyOrderNormalized";

const collectRootLayout = (documentNode) => {
  const mainNodes = [];
  const bodies = [];
  const bodyById = new Map();

  documentNode.forEach((node, offset) => {
    const entry = { node, offset };
    if (node.type.name === "noteBody") {
      bodies.push(entry);
      if (bodyById.has(node.attrs?.noteId)) return;
      bodyById.set(node.attrs?.noteId, entry);
      return;
    }
    mainNodes.push(entry);
  });

  return { mainNodes, bodies, bodyById };
};

const collectReferenceOrder = (documentNode) => {
  const order = [];
  const seen = new Set();
  let valid = true;

  documentNode.descendants((node) => {
    if (node.type.name === "noteBody") return false;
    if (node.type.name !== "noteReference") return true;
    const noteId = node.attrs?.noteId;
    if (!noteId || seen.has(noteId)) {
      valid = false;
      return false;
    }
    seen.add(noteId);
    order.push(noteId);
    return false;
  });

  return valid ? order : null;
};

const rootEntryAtPosition = (layout, position) => {
  const entries = [...layout.mainNodes, ...layout.bodies];
  return entries.find(({ node, offset }) =>
    position >= offset && position <= offset + node.nodeSize
  ) || null;
};

const describePosition = (documentNode, layout, position) => {
  const entry = rootEntryAtPosition(layout, position);
  if (!entry) return { type: "absolute", position };
  if (entry.node.type.name === "noteBody") {
    return {
      type: "body",
      noteId: entry.node.attrs?.noteId,
      relative: position - entry.offset
    };
  }
  return {
    type: "main",
    ordinal: layout.mainNodes.indexOf(entry),
    relative: position - entry.offset
  };
};

const positionFromDescriptor = (documentNode, layout, descriptor) => {
  let entry = null;
  if (descriptor.type === "body") {
    entry = layout.bodyById.get(descriptor.noteId) || null;
  } else if (descriptor.type === "main") {
    entry = layout.mainNodes[descriptor.ordinal] || null;
  }
  if (!entry) {
    return Math.max(0, Math.min(descriptor.position || 0, documentNode.content.size));
  }
  return entry.offset + Math.max(0, Math.min(descriptor.relative, entry.node.nodeSize));
};

const restoreSelection = (
  transaction,
  selection,
  beforeDocument,
  beforeLayout
) => {
  if (!(selection instanceof TextSelection)) return;
  const anchorDescriptor = describePosition(
    beforeDocument,
    beforeLayout,
    selection.anchor
  );
  const headDescriptor = describePosition(
    beforeDocument,
    beforeLayout,
    selection.head
  );
  const afterLayout = collectRootLayout(transaction.doc);
  const anchor = positionFromDescriptor(
    transaction.doc,
    afterLayout,
    anchorDescriptor
  );
  const head = positionFromDescriptor(
    transaction.doc,
    afterLayout,
    headDescriptor
  );

  try {
    transaction.setSelection(TextSelection.create(transaction.doc, anchor, head));
  } catch {
    const fallback = Math.max(0, Math.min(head, transaction.doc.content.size));
    transaction.setSelection(Selection.near(transaction.doc.resolve(fallback)));
  }
};

const isAlreadyNormalized = (documentNode, normalizedNodes) => {
  if (documentNode.childCount !== normalizedNodes.length) return false;
  return normalizedNodes.every((node, index) => documentNode.child(index) === node);
};

/**
 * Moves every canonical root noteBody behind the main flow and orders the bodies
 * by their noteReference positions. It mutates only the supplied transaction so
 * typed note operations and clipboard validation still observe one candidate.
 */
export const normalizeNoteBodyOrderInTransaction = (transaction) => {
  if (!transaction?.doc) return false;
  const referenceOrder = collectReferenceOrder(transaction.doc);
  const layout = collectRootLayout(transaction.doc);
  if (
    !referenceOrder ||
    referenceOrder.length !== layout.bodies.length ||
    layout.bodyById.size !== layout.bodies.length ||
    referenceOrder.some((noteId) => !layout.bodyById.has(noteId))
  ) {
    return false;
  }

  const normalizedNodes = [
    ...layout.mainNodes.map(({ node }) => node),
    ...referenceOrder.map((noteId) => layout.bodyById.get(noteId).node)
  ];
  if (isAlreadyNormalized(transaction.doc, normalizedNodes)) return false;

  const beforeDocument = transaction.doc;
  const selection = transaction.selection;
  const beforeLayout = layout;
  transaction.replaceWith(
    0,
    transaction.doc.content.size,
    Fragment.fromArray(normalizedNodes)
  );
  restoreSelection(transaction, selection, beforeDocument, beforeLayout);
  transaction.setMeta(NOTE_BODY_ORDER_NORMALIZED_META, true);
  return true;
};

export const createNoteBodyOrderAppendTransaction = () => (
  transactions,
  _oldState,
  newState
) => {
  if (!transactions.some((transaction) => transaction.docChanged)) return null;
  const transaction = newState.tr;
  return normalizeNoteBodyOrderInTransaction(transaction) ? transaction : null;
};
