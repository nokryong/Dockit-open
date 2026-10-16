const getResolvedPositionNoteBodyId = (resolvedPosition) => {
  if (!resolvedPosition) return null;

  for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
    const node = resolvedPosition.node(depth);
    if (node.type.name === "noteBody") {
      return node.attrs?.noteId || null;
    }
  }

  return null;
};

const resolveSelectionPosition = (selection, documentNode, side) => {
  const resolved = selection?.[`$${side}`];
  if (resolved) return resolved;

  const position = selection?.[side];
  if (!documentNode || !Number.isInteger(position)) return null;

  try {
    return documentNode.resolve(position);
  } catch {
    return null;
  }
};

export const getSelectionNoteBodyId = (selection, documentNode = null) => {
  return getResolvedPositionNoteBodyId(
    resolveSelectionPosition(selection, documentNode, "from")
  );
};

export const getContainedSelectionNoteBodyId = (
  selection,
  documentNode = null
) => {
  const fromNoteId = getSelectionNoteBodyId(selection, documentNode);
  if (!fromNoteId) return null;

  const toNoteId = getResolvedPositionNoteBodyId(
    resolveSelectionPosition(selection, documentNode, "to")
  );
  return toNoteId === fromNoteId ? fromNoteId : null;
};

export const isSelectionInsideNoteBody = (selection, documentNode = null) =>
  Boolean(getSelectionNoteBodyId(selection, documentNode));
