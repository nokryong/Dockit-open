import { getDocumentSemanticFingerprint } from "./documentOperationUtils";

const SUPPORTED_BLOCK_TYPES = new Set(["paragraph", "heading"]);

const isSupportedInlineLayout = (node) => {
  let supported = true;
  node.forEach((child) => {
    if (!child.isText) supported = false;
  });
  return supported;
};

const getBlockAt = ($pos) => {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (SUPPORTED_BLOCK_TYPES.has(node.type.name)) {
      return { node, pos: $pos.before(depth) };
    }
  }
  return null;
};

export const getSemanticBlockFingerprint = (node) =>
  getDocumentSemanticFingerprint(node);

export const createSemanticSelectionAnchor = (state) => {
  const selection = state?.selection;
  if (!selection || selection.empty || selection.node) return null;
  const fromBlock = getBlockAt(selection.$from);
  const toBlock = getBlockAt(selection.$to);
  if (!fromBlock || !toBlock || fromBlock.pos !== toBlock.pos) return null;
  if (!fromBlock.node.attrs?.blockId || !isSupportedInlineLayout(fromBlock.node)) return null;

  const contentFrom = fromBlock.pos + 1;
  const contentTo = contentFrom + fromBlock.node.content.size;
  if (selection.from < contentFrom || selection.to > contentTo || selection.from >= selection.to) {
    return null;
  }
  return {
    stableId: fromBlock.node.attrs.blockId,
    fromOffset: selection.from - contentFrom,
    toOffset: selection.to - contentFrom,
    blockFingerprint: getSemanticBlockFingerprint(fromBlock.node)
  };
};

export const resolveSemanticSelectionAnchor = (doc, anchor) => {
  if (!doc || !anchor || typeof anchor.stableId !== "string") return null;
  const matches = [];
  doc.descendants((node, pos) => {
    if (SUPPORTED_BLOCK_TYPES.has(node.type.name) && node.attrs?.blockId === anchor.stableId) {
      matches.push({ node, pos });
    }
    return true;
  });
  if (matches.length !== 1) return null;
  const { node, pos } = matches[0];
  if (!isSupportedInlineLayout(node)) return null;
  if (
    !Number.isInteger(anchor.fromOffset) ||
    !Number.isInteger(anchor.toOffset) ||
    anchor.fromOffset < 0 ||
    anchor.toOffset > node.content.size ||
    anchor.fromOffset >= anchor.toOffset
  ) return null;
  const blockFingerprint = getSemanticBlockFingerprint(node);
  if (anchor.blockFingerprint && blockFingerprint !== anchor.blockFingerprint) return null;
  const contentFrom = pos + 1;
  return {
    blockFingerprint,
    blockFrom: pos,
    blockId: anchor.stableId,
    blockTo: pos + node.nodeSize,
    from: contentFrom + anchor.fromOffset,
    node,
    to: contentFrom + anchor.toOffset
  };
};
