import { describe, expect, it } from "vitest";

import {
  OBJECT_NODE_TYPES,
  READ_ONLY_INERT_OBJECT_SELECTOR,
  READ_ONLY_INERT_OBJECT_SELECTORS,
  TOC_ENTRY_NODE_TYPES,
  isDoubleClickPanelObjectType,
  isImmediatePanelObjectType,
  isObjectNodeType,
  isPanelObjectType,
  isTextEditBlockingObjectType,
  isTocEntryNode,
  isTocEntryNodeName
} from "../../app/LIB/utils/editorContractUtils.js";

describe("editorContractUtils", () => {
  it("keeps the object node contract explicit", () => {
    expect(OBJECT_NODE_TYPES).toEqual([
      "image",
      "shapeBlock",
      "chartBlock",
      "diagramBlock"
    ]);
    expect(isObjectNodeType("diagramBlock")).toBe(true);
    expect(isObjectNodeType("table")).toBe(false);
  });

  it("distinguishes immediate and double-click panel object types", () => {
    expect(isImmediatePanelObjectType("chartBlock")).toBe(true);
    expect(isDoubleClickPanelObjectType("image")).toBe(true);
    expect(isDoubleClickPanelObjectType("shapeBlock")).toBe(true);
    expect(isPanelObjectType("image")).toBe(true);
    expect(isPanelObjectType("chartBlock")).toBe(true);
    expect(isImmediatePanelObjectType("diagramBlock")).toBe(true);
    expect(isPanelObjectType("diagramBlock")).toBe(true);
  });

  it("keeps text-edit blocking narrower than the full object set", () => {
    expect(isTextEditBlockingObjectType("image")).toBe(true);
    expect(isTextEditBlockingObjectType("shapeBlock")).toBe(true);
    expect(isTextEditBlockingObjectType("chartBlock")).toBe(false);
    expect(isTextEditBlockingObjectType("diagramBlock")).toBe(false);
  });

  it("shares toc entry detection across helpers", () => {
    expect(TOC_ENTRY_NODE_TYPES).toEqual(["tocItem", "captionTocItem"]);
    expect(isTocEntryNodeName("tocItem")).toBe(true);
    expect(isTocEntryNodeName("captionTocItem")).toBe(true);
    expect(isTocEntryNode({ type: { name: "captionTocItem" } })).toBe(true);
    expect(isTocEntryNode({ type: { name: "paragraph" } })).toBe(false);
  });

  it("keeps read-only inert selectors centralized", () => {
    expect(READ_ONLY_INERT_OBJECT_SELECTORS).toEqual([
      ".lazy-image-container",
      ".chart-block-container",
      ".diagram-frame-container"
    ]);
    expect(READ_ONLY_INERT_OBJECT_SELECTOR).toBe(
      READ_ONLY_INERT_OBJECT_SELECTORS.join(", ")
    );
  });
});
