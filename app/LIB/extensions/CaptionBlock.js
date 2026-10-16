import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  CAPTION_BLOCK_TYPE,
  CAPTION_NUMBER_SYNC_META,
  CAPTION_SYNC_META,
  OBJECT_ID_SYNC_META,
  collectCaptionEntries,
  getCaptionDisplayAttrs,
  getUniqueObjectId,
  normalizeCaptionTargetType,
  walkNodeChildren
} from "../utils/captionUtils";
import {
  buildCaptionNumberStyle,
  getCaptionContextFromSelection,
  shouldPreventCaptionEnter
} from "./utils/captionBlockUtils";

const buildObjectIdSyncTransaction = (state) => {
  if (!state?.doc) {
    return null;
  }

  const tr = state.tr;
  const usedIds = new Set();
  let modified = false;

  walkNodeChildren(state.doc, -1, ({ node, pos, parent, parentPos, index }) => {
    const targetType = normalizeCaptionTargetType(node.type.name);

    if (!targetType) {
      return true;
    }

    const currentId = node.attrs?.objectId;

    if (currentId && !usedIds.has(currentId)) {
      usedIds.add(currentId);
      return true;
    }

    const nextObjectId = getUniqueObjectId(usedIds);
    usedIds.add(nextObjectId);

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      objectId: nextObjectId
    });
    modified = true;

    if (index >= parent.childCount - 1) {
      return true;
    }

    const nextSiblingPos = (() => {
      let nextPos = parentPos + 1;

      for (let siblingIndex = 0; siblingIndex < index + 1; siblingIndex += 1) {
        nextPos += parent.child(siblingIndex).nodeSize;
      }

      return nextPos;
    })();

    const nextSibling = parent.child(index + 1);

    if (nextSibling?.type?.name !== CAPTION_BLOCK_TYPE) {
      return true;
    }

    const nextTargetId = nextSibling.attrs?.targetId;

    if (nextTargetId && nextTargetId !== currentId) {
      return true;
    }

    tr.setNodeMarkup(nextSiblingPos, undefined, {
      ...nextSibling.attrs,
      targetId: nextObjectId,
      targetType
    });
    modified = true;

    return true;
  });

  if (!modified) {
    return null;
  }

  tr.setMeta(OBJECT_ID_SYNC_META, true);
  return tr;
};

const collectCaptionDocumentState = (doc) => {
  const objectsById = new Map();
  const captionsByTargetId = new Map();

  walkNodeChildren(doc, -1, (context) => {
    if (context.node.type.name === CAPTION_BLOCK_TYPE) {
      const targetId = context.node.attrs?.targetId;

      if (targetId) {
        const existingList = captionsByTargetId.get(targetId) || [];
        existingList.push(context);
        captionsByTargetId.set(targetId, existingList);
      }

      return true;
    }

    const targetType = normalizeCaptionTargetType(context.node.type.name);
    const objectId = context.node.attrs?.objectId;

    if (!targetType || !objectId) {
      return true;
    }

    objectsById.set(objectId, {
      ...context,
      type: targetType
    });

    return true;
  });

  return {
    objectsById,
    captionsByTargetId
  };
};

const buildCaptionSyncTransaction = (state) => {
  if (!state?.doc) {
    return null;
  }

  const { objectsById, captionsByTargetId } = collectCaptionDocumentState(
    state.doc
  );
  const tr = state.tr;
  let modified = false;

  captionsByTargetId.forEach((captionList, targetId) => {
    const targetObject = objectsById.get(targetId);
    const sortedCaptions = [...captionList].sort((a, b) => a.pos - b.pos);

    if (!targetObject) {
      for (let index = sortedCaptions.length - 1; index >= 0; index -= 1) {
        const caption = sortedCaptions[index];
        const mappedPos = tr.mapping.map(caption.pos, -1);
        const captionNode = tr.doc.nodeAt(mappedPos);

        if (!captionNode || captionNode.type.name !== CAPTION_BLOCK_TYPE) {
          continue;
        }

        tr.delete(mappedPos, mappedPos + captionNode.nodeSize);
        modified = true;
      }

      return;
    }

    const preferredCaption =
      sortedCaptions.find(
        (caption) =>
          caption.parentPos === targetObject.parentPos &&
          caption.index === targetObject.index + 1
      ) || sortedCaptions[0];

    for (let index = sortedCaptions.length - 1; index >= 0; index -= 1) {
      const caption = sortedCaptions[index];

      if (caption.pos === preferredCaption.pos) {
        continue;
      }

      const mappedPos = tr.mapping.map(caption.pos, -1);
      const captionNode = tr.doc.nodeAt(mappedPos);

      if (!captionNode || captionNode.type.name !== CAPTION_BLOCK_TYPE) {
        continue;
      }

      tr.delete(mappedPos, mappedPos + captionNode.nodeSize);
      modified = true;
    }

    const mappedPreferredPos = tr.mapping.map(preferredCaption.pos, -1);
    const preferredNode = tr.doc.nodeAt(mappedPreferredPos);
    const mappedTargetPos = tr.mapping.map(targetObject.pos, -1);
    const mappedTargetNode = tr.doc.nodeAt(mappedTargetPos);

    if (
      !preferredNode ||
      preferredNode.type.name !== CAPTION_BLOCK_TYPE ||
      !mappedTargetNode
    ) {
      return;
    }

    const desiredAttrs = {
      ...preferredNode.attrs,
      targetId,
      targetType: targetObject.type
    };

    const desiredPos = mappedTargetPos + mappedTargetNode.nodeSize;

    if (
      preferredNode.attrs.targetId !== desiredAttrs.targetId ||
      preferredNode.attrs.targetType !== desiredAttrs.targetType
    ) {
      tr.setNodeMarkup(mappedPreferredPos, undefined, desiredAttrs);
      modified = true;
    }

    if (mappedPreferredPos === desiredPos) {
      return;
    }

    const movedNode = preferredNode.type.create(
      desiredAttrs,
      preferredNode.content,
      preferredNode.marks
    );

    tr.delete(mappedPreferredPos, mappedPreferredPos + preferredNode.nodeSize);

    const remappedTargetPos = tr.mapping.map(targetObject.pos, -1);
    const remappedTargetNode = tr.doc.nodeAt(remappedTargetPos);

    if (!remappedTargetNode) {
      return;
    }

    const insertPos = remappedTargetPos + remappedTargetNode.nodeSize;
    tr.insert(insertPos, movedNode);
    modified = true;
  });

  if (!modified) {
    return null;
  }

  tr.setMeta(CAPTION_SYNC_META, true);
  return tr;
};

const buildCaptionNumberSyncTransaction = (state) => {
  if (!state?.doc) {
    return null;
  }

  const captionEntries = collectCaptionEntries(state.doc);
  const captionEntryMap = new Map(
    captionEntries.map((entry) => [entry.targetId, entry])
  );
  const tr = state.tr;
  let modified = false;

  walkNodeChildren(state.doc, -1, (context) => {
    if (context.node.type.name !== CAPTION_BLOCK_TYPE) {
      return true;
    }

    const targetType = normalizeCaptionTargetType(
      context.node.attrs?.targetType
    );
    const targetId = context.node.attrs?.targetId || null;
    const entry = targetId ? captionEntryMap.get(targetId) : null;
    const displayAttrs = getCaptionDisplayAttrs(context.node);
    const shouldShowNumber = Boolean(targetType) && Boolean(entry?.numberText);

    const desiredAttrs = {
      ...context.node.attrs,
      ...displayAttrs,
      numberingEnabled: shouldShowNumber,
      numberText: shouldShowNumber ? entry.numberText : null
    };

    const attrsChanged =
      context.node.attrs.numberingEnabled !== desiredAttrs.numberingEnabled ||
      context.node.attrs.numberText !== desiredAttrs.numberText ||
      context.node.attrs.displayTextAlign !== desiredAttrs.displayTextAlign ||
      context.node.attrs.displayFontSize !== desiredAttrs.displayFontSize ||
      context.node.attrs.displayFontFamily !== desiredAttrs.displayFontFamily ||
      context.node.attrs.displayColor !== desiredAttrs.displayColor ||
      context.node.attrs.displayFontWeight !== desiredAttrs.displayFontWeight ||
      context.node.attrs.displayFontStyle !== desiredAttrs.displayFontStyle;

    if (!attrsChanged) {
      return true;
    }

    tr.setNodeMarkup(context.pos, undefined, desiredAttrs);
    modified = true;
    return true;
  });

  if (!modified) {
    return null;
  }

  tr.setMeta(CAPTION_NUMBER_SYNC_META, true);
  return tr;
};

const CaptionBlock = Node.create({
  name: CAPTION_BLOCK_TYPE,

  group: "block",
  content: "paragraph+",
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-id") || null,
        renderHTML: (attributes) => ({
          "data-target-id": attributes.targetId ?? ""
        })
      },
      targetType: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-target-type") || null,
        renderHTML: (attributes) => ({
          "data-target-type": attributes.targetType ?? ""
        })
      },
      numberingEnabled: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-numbering-enabled") === "true",
        renderHTML: (attributes) => ({
          "data-numbering-enabled": attributes.numberingEnabled
            ? "true"
            : "false"
        })
      },
      numberText: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-caption-number") || null,
        renderHTML: (attributes) => ({
          "data-caption-number": attributes.numberText ?? ""
        })
      },
      displayTextAlign: {
        default: "center",
        parseHTML: (element) =>
          element.getAttribute("data-display-align") || "center",
        renderHTML: (attributes) => ({
          "data-display-align": attributes.displayTextAlign || "center"
        })
      },
      displayFontSize: {
        default: 12,
        parseHTML: (element) => {
          const value = element.getAttribute("data-display-font-size");
          return value ? parseFloat(value) : 12;
        },
        renderHTML: (attributes) => ({
          "data-display-font-size": `${attributes.displayFontSize ?? 12}`
        })
      },
      displayFontFamily: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-display-font-family") || null,
        renderHTML: (attributes) => ({
          "data-display-font-family": attributes.displayFontFamily ?? ""
        })
      },
      displayColor: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-display-color") || null,
        renderHTML: (attributes) => ({
          "data-display-color": attributes.displayColor ?? ""
        })
      },
      displayFontWeight: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-display-font-weight") || null,
        renderHTML: (attributes) => ({
          "data-display-font-weight": attributes.displayFontWeight ?? ""
        })
      },
      displayFontStyle: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-display-font-style") || null,
        renderHTML: (attributes) => ({
          "data-display-font-style": attributes.displayFontStyle ?? ""
        })
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-caption-block="true"]',
        contentElement: (element) =>
          element.querySelector(".caption-block-content") || element
      }
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const captionAttrs = node?.attrs || {};
    const wrapperAttributes = mergeAttributes(HTMLAttributes, {
      "data-caption-block": "true",
      class: "caption-block",
      style: `text-align: ${captionAttrs.displayTextAlign || "center"};`
    });

    return [
      "div",
      wrapperAttributes,
      [
        "div",
        {
          class: "caption-block-shell"
        },
        [
          "span",
          {
            class: "caption-block-number",
            contenteditable: "false",
            style: buildCaptionNumberStyle(captionAttrs)
          },
          captionAttrs.numberText ? `${captionAttrs.numberText} ` : ""
        ],
        [
          "div",
          {
            class: "caption-block-content"
          },
          0
        ]
      ]
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("captionBlockKeyboard"),
        props: {
          handleKeyDown(view, event) {
            const target = event.target;
            const captionContext = getCaptionContextFromSelection(
              view.state.selection
            );

            const shouldPrevent = shouldPreventCaptionEnter({
              key: event.key,
              isComposing: event.isComposing,
              viewComposing: view.composing,
              targetTagName:
                target instanceof HTMLElement ? target.tagName : null,
              hasCaptionContext: Boolean(captionContext)
            });

            if (!shouldPrevent) {
              return false;
            }

            event.preventDefault();
            return true;
          }
        }
      }),
      new Plugin({
        key: new PluginKey("objectIdSync"),
        appendTransaction(transactions, _oldState, newState) {
          if (
            transactions.every((transaction) =>
              transaction.getMeta(OBJECT_ID_SYNC_META)
            )
          ) {
            return null;
          }

          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          return buildObjectIdSyncTransaction(newState);
        }
      }),
      new Plugin({
        key: new PluginKey("captionBlockSync"),
        appendTransaction(transactions, _oldState, newState) {
          if (
            transactions.every(
              (transaction) =>
                transaction.getMeta(CAPTION_SYNC_META) ||
                transaction.getMeta(OBJECT_ID_SYNC_META)
            )
          ) {
            return null;
          }

          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          return buildCaptionSyncTransaction(newState);
        }
      }),
      new Plugin({
        key: new PluginKey("captionNumberSync"),
        appendTransaction(transactions, _oldState, newState) {
          if (
            transactions.every(
              (transaction) =>
                transaction.getMeta(CAPTION_NUMBER_SYNC_META) ||
                transaction.getMeta(CAPTION_SYNC_META) ||
                transaction.getMeta(OBJECT_ID_SYNC_META)
            )
          ) {
            return null;
          }

          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          return buildCaptionNumberSyncTransaction(newState);
        }
      })
    ];
  }
});

export default CaptionBlock;
