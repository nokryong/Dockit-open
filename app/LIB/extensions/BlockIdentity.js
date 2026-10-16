import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const BLOCK_ID_SYNC_META = "dockitBlockIdSync";
const SUPPORTED_BLOCKS = new Set(["paragraph", "heading"]);
const RESERVED_BLOCK_IDS = new Set(["document-root"]);
const BLOCK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

export const isValidDockitBlockId = (value) =>
  typeof value === "string" &&
  BLOCK_ID_PATTERN.test(value) &&
  !RESERVED_BLOCK_IDS.has(value);

const createBlockId = () =>
  `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const getUniqueBlockId = (usedIds) => {
  let id = createBlockId();
  while (usedIds.has(id)) id = createBlockId();
  return id;
};

export const buildBlockIdentitySyncTransaction = (state) => {
  if (!state?.doc) return null;

  const usedIds = new Set();
  const tr = state.tr;
  let modified = false;

  state.doc.descendants((node, pos) => {
    if (!SUPPORTED_BLOCKS.has(node.type.name)) return true;
    const blockId = node.attrs?.blockId;
    if (isValidDockitBlockId(blockId) && !usedIds.has(blockId)) {
      usedIds.add(blockId);
      return true;
    }
    const nextId = getUniqueBlockId(usedIds);
    usedIds.add(nextId);
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: nextId });
    modified = true;
    return true;
  });

  if (!modified) return null;
  tr.setMeta(BLOCK_ID_SYNC_META, true);
  tr.setMeta("addToHistory", false);
  return tr;
};

export const BlockIdentity = Extension.create({
  name: "blockIdentity",
  addGlobalAttributes() {
    return [
      {
        types: [...SUPPORTED_BLOCKS],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-dockit-block-id"),
            renderHTML: (attributes) =>
              attributes.blockId
                ? { "data-dockit-block-id": attributes.blockId }
                : {}
          }
        }
      }
    ];
  },
  onCreate() {
    const transaction = buildBlockIdentitySyncTransaction(this.editor.state);
    if (transaction) this.editor.view.dispatch(transaction);
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("dockitBlockIdentity"),
        appendTransaction(transactions, _oldState, newState) {
          if (transactions.every((transaction) => transaction.getMeta(BLOCK_ID_SYNC_META))) {
            return null;
          }
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          return buildBlockIdentitySyncTransaction(newState);
        }
      })
    ];
  }
});

export default BlockIdentity;
