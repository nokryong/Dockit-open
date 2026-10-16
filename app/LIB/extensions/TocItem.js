import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Fragment } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";
import TocItemView from "./TocItemView";

const TOC_ITEM_SYNC_META = "tocItemSync";

const collectHeadingTargets = (doc) => {
  const targets = [];
  let hasMissingHeadingId = false;

  doc.descendants((node) => {
    if (node.type.name === "heading") {
      const headingId = node.attrs.headingId;
      const headingText = node.textContent?.trim();

      if (!headingId) {
        hasMissingHeadingId = true;
      } else if (headingText) {
        targets.push(headingId);
      }
    }

    return true;
  });

  return {
    targets,
    hasMissingHeadingId
  };
};

const collectTocGroups = (doc) => {
  const groups = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "tocItem") {
      return true;
    }

    const lastGroup = groups[groups.length - 1];

    if (
      lastGroup &&
      lastGroup.end === pos
    ) {
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
      items: [
        {
          pos,
          targetId: node.attrs.targetId
        }
      ]
    });

    return false;
  });

  return groups;
};

const isSameTargets = (items, headingTargets) =>
  items.length === headingTargets.length &&
  items.every((item, index) => item.targetId === headingTargets[index]);

const TocItem = Node.create({
  name: "tocItem",
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
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-toc-item="true"]:not([data-caption-toc-item="true"])'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-toc-item": "true"
      })
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TocItemView);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("tocItemSync"),
        appendTransaction(transactions, _oldState, newState) {
          if (transactions.every((tr) => tr.getMeta(TOC_ITEM_SYNC_META))) {
            return null;
          }

          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }

          const tocGroups = collectTocGroups(newState.doc);

          if (tocGroups.length === 0) {
            return null;
          }

          const { targets: headingTargets, hasMissingHeadingId } =
            collectHeadingTargets(newState.doc);

          if (hasMissingHeadingId) {
            return null;
          }

          const tr = newState.tr;
          const firstGroup = tocGroups[0];
          const lastGroup = tocGroups[tocGroups.length - 1];
          const currentItems = tocGroups.flatMap((group) => group.items);
          const shouldResync =
            tocGroups.length > 1 || !isSameTargets(currentItems, headingTargets);

          if (!shouldResync) {
            return null;
          }

          const fragment = Fragment.fromArray(
            headingTargets.map((targetId) =>
              newState.schema.nodes.tocItem.create({ targetId })
            )
          );

          tr.replaceWith(firstGroup.start, lastGroup.end, fragment);

          tr.setMeta(TOC_ITEM_SYNC_META, true);
          return tr;
        }
      })
    ];
  }
});

export default TocItem;
