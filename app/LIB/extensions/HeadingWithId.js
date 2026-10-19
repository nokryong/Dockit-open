import Heading from "@tiptap/extension-heading";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const HEADING_ID_SYNC_META = "headingIdSync";

const createHeadingId = () =>
  `heading-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const getUniqueHeadingId = (usedIds) => {
  let nextId = createHeadingId();

  while (usedIds.has(nextId)) {
    nextId = createHeadingId();
  }

  return nextId;
};

export const buildHeadingIdSyncTransaction = (state) => {
  if (!state?.doc) {
    return null;
  }

  const usedIds = new Set();
  const tr = state.tr;
  let modified = false;

  state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") {
      return true;
    }

    const currentId = node.attrs.headingId;

    if (currentId && !usedIds.has(currentId)) {
      usedIds.add(currentId);
      return true;
    }

    const nextId = getUniqueHeadingId(usedIds);
    usedIds.add(nextId);

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      headingId: nextId
    });
    modified = true;
    return true;
  });

  if (!modified) {
    return null;
  }

  tr.setMeta(HEADING_ID_SYNC_META, true);
  return tr;
};

const HeadingWithId = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      headingId: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-heading-id") || element.getAttribute("id"),
        renderHTML: (attributes) => {
          if (!attributes.headingId) {
            return {};
          }

          return {
            id: attributes.headingId,
            "data-heading-id": attributes.headingId
          };
        }
      }
    };
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() || [];

    return [
      ...parentPlugins,
      new Plugin({
        key: new PluginKey("headingIdSync"),
        appendTransaction(transactions, _oldState, newState) {
          if (transactions.every((transaction) => transaction.getMeta(HEADING_ID_SYNC_META))) {
            return null;
          }

          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          return buildHeadingIdSyncTransaction(newState);
        }
      })
    ];
  }
});

export default HeadingWithId;
