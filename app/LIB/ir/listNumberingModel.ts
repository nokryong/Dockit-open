import type { IRBlock, IRListBlock, IRListItem } from "./types";

export type IRListMarkerKindV1 = "bullet" | "ordered" | "task" | "unknown";
export type IRListMarkerFormatV1 = "bullet" | "decimal" | "checkbox" | "unknown";
export type IRListStartNumberSourceV1 = "attrs" | "default" | "not-applicable";

export interface IRListNumberingLevelV1 {
  version: "ir-list-numbering-v1";
  depth: number;
  level: number;
  listType: IRListBlock["listType"];
  markerKind: IRListMarkerKindV1;
  markerFormat: IRListMarkerFormatV1;
  startNumber: number | null;
  startNumberSource: IRListStartNumberSourceV1;
  itemCount: number;
  rawAttrs: Readonly<Record<string, unknown>>;
  unsupported: readonly string[];
}

export interface IRListNumberingItemV1 {
  version: "ir-list-numbering-v1";
  path: readonly number[];
  depth: number;
  level: number;
  ordinal: number;
  markerKind: IRListMarkerKindV1;
  markerFormat: IRListMarkerFormatV1;
  startNumber: number | null;
  effectiveNumber: number | null;
  checked: boolean | null;
  childListCount: number;
  blockCount: number;
  rawAttrs: Readonly<Record<string, unknown>>;
  unsupported: readonly string[];
}

export interface IRListNumberingModelV1 {
  version: "ir-list-numbering-v1";
  rootListType: IRListBlock["listType"];
  maxDepth: number;
  levels: readonly Readonly<IRListNumberingLevelV1>[];
  items: readonly Readonly<IRListNumberingItemV1>[];
  unsupported: readonly string[];
}

const MODEL_VERSION = "ir-list-numbering-v1" as const;

const freezeArray = <T>(items: readonly T[]) => Object.freeze([...items]);

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const getMarkerKind = (listType: IRListBlock["listType"]): IRListMarkerKindV1 =>
  listType === "bullet" || listType === "ordered" || listType === "task"
    ? listType
    : "unknown";

const getMarkerFormat = (
  listType: IRListBlock["listType"]
): IRListMarkerFormatV1 =>
  listType === "ordered"
    ? "decimal"
    : listType === "bullet"
      ? "bullet"
      : listType === "task"
        ? "checkbox"
        : "unknown";

const getExplicitStartNumber = (attrs: Record<string, unknown>) =>
  toNumberOrNull(attrs.start) ?? toNumberOrNull(attrs.startNumber);

const getStartNumber = (listBlock: IRListBlock) => {
  if (listBlock.listType !== "ordered") {
    return {
      startNumber: null,
      startNumberSource: "not-applicable" as const
    };
  }

  const explicitStart = getExplicitStartNumber(listBlock.attrs || {});

  return {
    startNumber: explicitStart ?? 1,
    startNumberSource: explicitStart === null ? "default" as const : "attrs" as const
  };
};

const getCheckedState = (item: IRListItem) => {
  const checked = item.attrs?.checked;

  return typeof checked === "boolean" ? checked : null;
};

const getChildLists = (item: IRListItem) =>
  item.blocks.filter((block): block is IRListBlock => block.type === "list");

const getLevelUnsupported = (listBlock: IRListBlock) => {
  const unsupported: string[] = [];
  const attrs = listBlock.attrs || {};
  const knownAttrs = new Set(["start", "startNumber"]);

  Object.keys(attrs).forEach((attrName) => {
    if (!knownAttrs.has(attrName)) {
      unsupported.push(`list attr ${attrName} remains raw`);
    }
  });

  if (listBlock.listType === "unknown") {
    unsupported.push("unknown list type has no numbering mapping");
  }

  return freezeArray(unsupported);
};

const getItemUnsupported = (item: IRListItem) => {
  const unsupported: string[] = [];
  const knownAttrs = new Set(["checked", "value"]);

  Object.keys(item.attrs || {}).forEach((attrName) => {
    if (!knownAttrs.has(attrName)) {
      unsupported.push(`list item attr ${attrName} remains raw`);
    }
  });

  if (Object.prototype.hasOwnProperty.call(item.attrs || {}, "value")) {
    unsupported.push("list item value is preserved but not canonical numbering");
  }

  return freezeArray(unsupported);
};

const createLevel = (
  listBlock: IRListBlock,
  depth: number
): Readonly<IRListNumberingLevelV1> => {
  const { startNumber, startNumberSource } = getStartNumber(listBlock);

  return Object.freeze({
    version: MODEL_VERSION,
    depth,
    level: depth + 1,
    listType: listBlock.listType,
    markerKind: getMarkerKind(listBlock.listType),
    markerFormat: getMarkerFormat(listBlock.listType),
    startNumber,
    startNumberSource,
    itemCount: listBlock.items.length,
    rawAttrs: Object.freeze({ ...(listBlock.attrs || {}) }),
    unsupported: getLevelUnsupported(listBlock)
  });
};

const createItem = ({
  item,
  listBlock,
  depth,
  path,
  ordinal
}: {
  item: IRListItem;
  listBlock: IRListBlock;
  depth: number;
  path: readonly number[];
  ordinal: number;
}): Readonly<IRListNumberingItemV1> => {
  const { startNumber } = getStartNumber(listBlock);
  const markerKind = getMarkerKind(listBlock.listType);
  const markerFormat = getMarkerFormat(listBlock.listType);
  const effectiveNumber =
    listBlock.listType === "ordered" && startNumber !== null
      ? startNumber + ordinal - 1
      : null;

  return Object.freeze({
    version: MODEL_VERSION,
    path: freezeArray(path),
    depth,
    level: depth + 1,
    ordinal,
    markerKind,
    markerFormat,
    startNumber,
    effectiveNumber,
    checked: listBlock.listType === "task" ? getCheckedState(item) : null,
    childListCount: getChildLists(item).length,
    blockCount: item.blocks.length,
    rawAttrs: Object.freeze({ ...(item.attrs || {}) }),
    unsupported: getItemUnsupported(item)
  });
};

const walkList = (
  listBlock: IRListBlock,
  depth: number,
  parentPath: readonly number[],
  levels: IRListNumberingLevelV1[],
  items: IRListNumberingItemV1[]
) => {
  levels.push(createLevel(listBlock, depth));

  listBlock.items.forEach((item, itemIndex) => {
    const path = [...parentPath, itemIndex];

    items.push(
      createItem({
        item,
        listBlock,
        depth,
        path,
        ordinal: itemIndex + 1
      })
    );

    getChildLists(item).forEach((childList, childListIndex) => {
      walkList(childList, depth + 1, [...path, childListIndex], levels, items);
    });
  });
};

export const normalizeListNumbering = (
  listBlock: IRListBlock
): Readonly<IRListNumberingModelV1> => {
  const levels: IRListNumberingLevelV1[] = [];
  const items: IRListNumberingItemV1[] = [];

  walkList(listBlock, 0, [], levels, items);

  return Object.freeze({
    version: MODEL_VERSION,
    rootListType: listBlock.listType,
    maxDepth: levels.reduce(
      (maxDepth, level) => Math.max(maxDepth, level.depth),
      0
    ),
    levels: freezeArray(levels),
    items: freezeArray(items),
    unsupported: freezeArray([
      "numbering definition id is not stable in v1",
      "nested list restart policy is adapter-defined in v1"
    ])
  });
};

export const collectListNumberingModels = (blocks: readonly IRBlock[]) =>
  freezeArray(
    blocks.flatMap((block) => {
      if (block.type === "list") {
        return [normalizeListNumbering(block)];
      }

      if (block.type === "table") {
        return block.rows.flatMap((row) =>
          row.cells.flatMap((cell) => collectListNumberingModels(cell.blocks))
        );
      }

      if (block.type === "object" && block.children?.length) {
        return collectListNumberingModels(block.children);
      }

      return [];
    })
  );
