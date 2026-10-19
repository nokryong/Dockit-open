import { describe, expect, it } from "vitest";

import {
  buildTocDeleteTargetFromTitle,
  getForwardDeleteTarget
} from "../../app/LIB/extensions/utils/deleteBehaviorUtils.js";

const textNode = (text) => ({
  type: { name: "text" },
  isText: true,
  isBlock: false,
  text,
  textContent: text,
  attrs: {},
  content: { size: text.length },
  childCount: 0,
  child() {
    return null;
  },
  descendants() {
    return true;
  },
  get nodeSize() {
    return text.length;
  }
});

const node = (typeName, attrs = {}, children = [], options = {}) => {
  const { textContent = null, isBlock = true, isTextblock = false } = options;
  const resolvedChildren = children;

  return {
    type: { name: typeName },
    attrs,
    isBlock,
    isTextblock,
    textContent:
      textContent ??
      resolvedChildren.map((childNode) => childNode.textContent || "").join(""),
    content: {
      size: resolvedChildren.reduce(
        (total, childNode) => total + childNode.nodeSize,
        0
      )
    },
    childCount: resolvedChildren.length,
    child(index) {
      return resolvedChildren[index];
    },
    descendants(callback, parentPos = 0) {
      let childPos = parentPos + 1;

      for (const childNode of resolvedChildren) {
        const shouldContinue = callback(childNode, childPos);

        if (shouldContinue === false) {
          return false;
        }

        if (childNode.childCount > 0) {
          const nestedShouldContinue = childNode.descendants(
            callback,
            childPos
          );

          if (nestedShouldContinue === false) {
            return false;
          }
        }

        childPos += childNode.nodeSize;
      }

      return true;
    },
    get nodeSize() {
      return resolvedChildren.reduce(
        (total, childNode) => total + childNode.nodeSize,
        2
      );
    }
  };
};

const docNode = (...children) => ({
  type: { name: "doc" },
  isBlock: false,
  childCount: children.length,
  child(index) {
    return children[index];
  },
  descendants(callback) {
    let pos = 0;

    for (const childNode of children) {
      const shouldContinue = callback(childNode, pos);

      if (shouldContinue === false) {
        return false;
      }

      if (childNode.childCount > 0) {
        const nestedShouldContinue = childNode.descendants(callback, pos);

        if (nestedShouldContinue === false) {
          return false;
        }
      }

      pos += childNode.nodeSize;
    }

    return true;
  }
});

const paragraphNode = (text = "") =>
  node(
    "paragraph",
    {},
    text ? [textNode(text)] : [],
    {
      isTextblock: true,
      textContent: text
    }
  );

const atomBlockNode = (typeName, attrs = {}) =>
  node(typeName, attrs, [], { textContent: "" });

const createResolvedPos = ({ path, positions, parentOffset }) => ({
  depth: path.length - 1,
  parent: path[path.length - 1],
  parentOffset,
  node(depth) {
    return path[depth];
  },
  before(depth) {
    return positions[depth];
  }
});

const createStateAtBlockEnd = (doc, blockNode, blockPos, extraAncestors = []) => ({
  doc,
  selection: {
    empty: true,
    node: null,
    $from: createResolvedPos({
      path: [doc, ...extraAncestors, blockNode],
      positions: [-1, ...extraAncestors.map(() => 0), blockPos],
      parentOffset: blockNode.content.size
    })
  }
});

describe("deleteBehaviorUtils", () => {
  it("builds a toc delete target from title + consecutive toc entries", () => {
    const titleNode = paragraphNode("목차");
    const tocNode = atomBlockNode("tocItem");
    const captionTocNode = atomBlockNode("captionTocItem");
    const doc = docNode(titleNode, tocNode, captionTocNode, paragraphNode("본문"));

    expect(
      buildTocDeleteTargetFromTitle(doc, {
        node: titleNode,
        pos: 0
      })
    ).toEqual({
      from: 0,
      to: titleNode.nodeSize + tocNode.nodeSize + captionTocNode.nodeSize,
      label: "목차",
      typeName: "tocSection"
    });
  });

  it("returns confirm target for the next object block", () => {
    const currentParagraph = paragraphNode("현재 문단");
    const imageNode = atomBlockNode("image", { objectId: "image-1" });
    const doc = docNode(currentParagraph, imageNode);
    const state = createStateAtBlockEnd(doc, currentParagraph, 0);

    expect(getForwardDeleteTarget(state)).toEqual({
      kind: "confirm",
      from: currentParagraph.nodeSize,
      to: currentParagraph.nodeSize + imageNode.nodeSize,
      label: "이미지",
      typeName: "image",
      objectId: "image-1"
    });
  });

  it("returns confirm target for a toc section that starts in the next block", () => {
    const currentParagraph = paragraphNode("서론");
    const titleNode = paragraphNode("그림 목차");
    const tocNode = atomBlockNode("captionTocItem");
    const doc = docNode(currentParagraph, titleNode, tocNode);
    const state = createStateAtBlockEnd(doc, currentParagraph, 0);

    expect(getForwardDeleteTarget(state)).toEqual({
      kind: "confirm",
      from: currentParagraph.nodeSize,
      to: currentParagraph.nodeSize + titleNode.nodeSize + tocNode.nodeSize,
      label: "목차",
      typeName: "tocSection"
    });
  });

  it("returns immediate delete target for code/blockquote", () => {
    const currentParagraph = paragraphNode("문단");
    const blockquoteNode = atomBlockNode("blockquote");
    const doc = docNode(currentParagraph, blockquoteNode);
    const state = createStateAtBlockEnd(doc, currentParagraph, 0);

    expect(getForwardDeleteTarget(state)).toEqual({
      kind: "delete",
      from: currentParagraph.nodeSize,
      to: currentParagraph.nodeSize + blockquoteNode.nodeSize,
      label: "인용 블록",
      typeName: "blockquote",
      objectId: null
    });
  });

  it("does not delete the whole list block immediately", () => {
    const currentParagraph = paragraphNode("문단");
    const orderedListNode = atomBlockNode("orderedList");
    const doc = docNode(currentParagraph, orderedListNode);
    const state = createStateAtBlockEnd(doc, currentParagraph, 0);

    expect(getForwardDeleteTarget(state)).toBeNull();
  });

  it("returns noop only for an empty paragraph at the real document end", () => {
    const emptyParagraph = paragraphNode("");
    const doc = docNode(emptyParagraph);
    const state = createStateAtBlockEnd(doc, emptyParagraph, 0);

    expect(getForwardDeleteTarget(state)).toEqual({ kind: "noop" });
  });

  it("returns null when there is still text after the cursor", () => {
    const currentParagraph = paragraphNode("문단");
    const imageNode = atomBlockNode("image", { objectId: "image-1" });
    const doc = docNode(currentParagraph, imageNode);

    const state = {
      doc,
      selection: {
        empty: true,
        node: null,
        $from: createResolvedPos({
          path: [doc, currentParagraph],
          positions: [-1, 0],
          parentOffset: 1
        })
      }
    };

    expect(getForwardDeleteTarget(state)).toBeNull();
  });

  it("returns null inside excluded ancestors", () => {
    const paragraph = paragraphNode("표 셀 문단");
    const doc = docNode(paragraph);
    const tableCell = atomBlockNode("tableCell");
    const state = createStateAtBlockEnd(doc, paragraph, 0, [tableCell]);

    expect(getForwardDeleteTarget(state)).toBeNull();
  });
});
