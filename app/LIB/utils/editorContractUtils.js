export const OBJECT_NODE_TYPES = [
  "image",
  "shapeBlock",
  "chartBlock",
  "diagramBlock"
];

export const OBJECT_NODE_TYPE_SET = new Set(OBJECT_NODE_TYPES);

// 현재 ObjectEditor/헤더 객체 액션 체인에 직접 연결된 타입들
export const OBJECT_PANEL_IMMEDIATE_TYPES = ["chartBlock", "diagramBlock"];
export const OBJECT_PANEL_DOUBLE_CLICK_TYPES = ["image", "shapeBlock"];

const OBJECT_PANEL_IMMEDIATE_TYPE_SET = new Set(OBJECT_PANEL_IMMEDIATE_TYPES);
const OBJECT_PANEL_DOUBLE_CLICK_TYPE_SET = new Set(
  OBJECT_PANEL_DOUBLE_CLICK_TYPES
);

// 객체 패널이 열린 동안 일반 텍스트 편집을 잠시 막는 타입들
export const TEXT_EDIT_BLOCKING_OBJECT_TYPES = ["image", "shapeBlock"];
const TEXT_EDIT_BLOCKING_OBJECT_TYPE_SET = new Set(
  TEXT_EDIT_BLOCKING_OBJECT_TYPES
);

export const TOC_ENTRY_NODE_TYPES = ["tocItem", "captionTocItem"];
const TOC_ENTRY_NODE_TYPE_SET = new Set(TOC_ENTRY_NODE_TYPES);

export const READ_ONLY_INERT_OBJECT_SELECTORS = [
  ".lazy-image-container",
  ".chart-block-container",
  ".diagram-frame-container",
  ".diagram-excalidraw-root"
];

export const READ_ONLY_INERT_OBJECT_SELECTOR =
  READ_ONLY_INERT_OBJECT_SELECTORS.join(", ");

export const isObjectNodeType = (typeName) =>
  OBJECT_NODE_TYPE_SET.has(typeName);

export const isImmediatePanelObjectType = (typeName) =>
  OBJECT_PANEL_IMMEDIATE_TYPE_SET.has(typeName);

export const isDoubleClickPanelObjectType = (typeName) =>
  OBJECT_PANEL_DOUBLE_CLICK_TYPE_SET.has(typeName);

export const isPanelObjectType = (typeName) =>
  isImmediatePanelObjectType(typeName) ||
  isDoubleClickPanelObjectType(typeName);

export const isTextEditBlockingObjectType = (typeName) =>
  TEXT_EDIT_BLOCKING_OBJECT_TYPE_SET.has(typeName);

export const isTocEntryNodeName = (typeName) =>
  TOC_ENTRY_NODE_TYPE_SET.has(typeName);

export const isTocEntryNode = (node) => isTocEntryNodeName(node?.type?.name);
