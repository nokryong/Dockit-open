import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Fragment } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";
import CaptionTocItemView from "./CaptionTocItemView";
import {
  CAPTION_TOC_ITEM_TYPE,
  CAPTION_TOC_SYNC_META,
  collectCaptionTargetIdsByType,
  getCaptionTargetConfig,
  isTocTitleText,
  normalizeCaptionTargetGroup
} from "../utils/captionUtils";

const getBlockTextContent = (node) => {
  if (!node) {
    return "";
  }

  return typeof node.textContent === "string" ? node.textContent.trim() : "";
};

const getImmediatePreviousBlock = (doc, pos) => {
  let previousBlock = null;

  doc.descendants((node, currentPos) => {
    if (currentPos >= pos) {
      return false;
    }

    if (node.isBlock && currentPos + node.nodeSize <= pos) {
      previousBlock = {
        node,
        pos: currentPos,
        end: currentPos + node.nodeSize,
        text: getBlockTextContent(node)
      };
    }

    return true;
  });

  return previousBlock;
};

const getDuplicateGroupPriority = (group) => {
  const expectedTitle = getCaptionTargetConfig(group.targetType)?.tocTitle;

  if (group.titleText === expectedTitle) {
    return 2;
  }

  if (group.titleText) {
    return 1;
  }

  return 0;
};

const collectCaptionTocGroups = (doc) => {
  const groups = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== CAPTION_TOC_ITEM_TYPE) {
      return true;
    }

    const targetType = normalizeCaptionTargetGroup(node.attrs?.targetType);
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.end === pos && lastGroup.targetType === targetType) {
      lastGroup.items.push({
        pos,
        targetId: node.attrs.targetId
      });
      lastGroup.end += node.nodeSize;
      return false;
    }

    groups.push({
      start: pos,
      end: pos + node.nodeSize,
      targetType,
      items: [
        {
          pos,
          targetId: node.attrs.targetId
        }
      ]
    });

    return false;
  });

  return groups.map((group) => {
    const previousBlock = getImmediatePreviousBlock(doc, group.start);
    const hasImmediateTitle =
      previousBlock?.node?.type?.name === "paragraph" &&
      previousBlock.end === group.start &&
      isTocTitleText(previousBlock.text);

    return {
      ...group,
      titlePos: hasImmediateTitle ? previousBlock.pos : null,
      titleEnd: hasImmediateTitle ? previousBlock.end : null,
      titleText: hasImmediateTitle ? previousBlock.text : ""
    };
  });
};

const isSameTargets = (items, targetIds) =>
  items.length === targetIds.length &&
  items.every((item, index) => item.targetId === targetIds[index]);

const CaptionTocItem = Node.create({
  name: CAPTION_TOC_ITEM_TYPE,
  group: "block",
  atom: true,
  selectable: true,
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
        parseHTML: (element) => element.getAttribute("data-target-type") || null,
        renderHTML: (attributes) => ({
          "data-target-type": attributes.targetType ?? ""
        })
      }
    };
  },

  parseHTML() {
    return [
      {
        priority: 1000,
        tag: 'div[data-caption-toc-item="true"]'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-caption-toc-item": "true",
        "data-toc-item": "true"
      })
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CaptionTocItemView);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("captionTocItemSync"),
        appendTransaction(transactions, _oldState, newState) {
          if (transactions.every((transaction) => transaction.getMeta(CAPTION_TOC_SYNC_META))) {
            return null;
          }

          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          const groups = collectCaptionTocGroups(newState.doc);

          if (groups.length === 0) {
            return null;
          }

          const tr = newState.tr;
          let modified = false;
          const preferredGroupByType = new Map();
          const duplicateGroupStarts = new Set();

          groups.forEach((group) => {
            const existingGroup = preferredGroupByType.get(group.targetType);

            if (!existingGroup) {
              preferredGroupByType.set(group.targetType, group);
              return;
            }

            const existingPriority = getDuplicateGroupPriority(existingGroup);
            const currentPriority = getDuplicateGroupPriority(group);

            if (currentPriority > existingPriority) {
              duplicateGroupStarts.add(existingGroup.start);
              preferredGroupByType.set(group.targetType, group);
              return;
            }

            duplicateGroupStarts.add(group.start);
          });

          [...groups]
            .sort((leftGroup, rightGroup) => rightGroup.start - leftGroup.start)
            .forEach((group) => {
              if (duplicateGroupStarts.has(group.start)) {
                const mappedDeleteStart =
                  group.titlePos !== null
                    ? tr.mapping.map(group.titlePos, -1)
                    : tr.mapping.map(group.start, -1);
                const mappedDeleteEnd = tr.mapping.map(group.end, 1);

                tr.delete(mappedDeleteStart, mappedDeleteEnd);
                modified = true;
                return;
              }

              const expectedTitle = getCaptionTargetConfig(group.targetType)?.tocTitle;

              if (
                expectedTitle &&
                group.titlePos !== null &&
                group.titleEnd !== null &&
                group.titleText !== expectedTitle
              ) {
                const mappedTitleStart = tr.mapping.map(group.titlePos, -1);
                const mappedTitleEnd = tr.mapping.map(group.titleEnd, 1);
                const titleNode = newState.schema.nodes.paragraph.create(
                  null,
                  newState.schema.text(expectedTitle)
                );

                tr.replaceWith(mappedTitleStart, mappedTitleEnd, titleNode);
                modified = true;
              }

              const targetIds = collectCaptionTargetIdsByType(
                tr.doc,
                group.targetType
              );

              if (isSameTargets(group.items, targetIds)) {
                return;
              }

              const mappedStart = tr.mapping.map(group.start, -1);
              const mappedEnd = tr.mapping.map(group.end, 1);
              const fragment = Fragment.fromArray(
                targetIds.map((targetId) =>
                  newState.schema.nodes[CAPTION_TOC_ITEM_TYPE].create({
                    targetId,
                    targetType: group.targetType
                  })
                )
              );

              tr.replaceWith(mappedStart, mappedEnd, fragment);
              modified = true;
            });

          if (!modified) {
            return null;
          }

          tr.setMeta(CAPTION_TOC_SYNC_META, true);
          return tr;
        }
      })
    ];
  }
});

export default CaptionTocItem;
