import type { IRObjectAnchorMode, IRObjectBlock, IRObjectFlowMode } from "./types";

export type IRObjectKindV1 = "image" | "shape" | "chart" | "diagram" | "unknown";
export type IRObjectLengthUnitV1 = "pt" | "px" | "mm" | "percent" | "unknown";
export type IRObjectRelationshipTargetKindV1 =
  | "url"
  | "data-uri"
  | "object-id"
  | "embedded-ref"
  | "none";
export type IRObjectRelationshipIdSourceV1 =
  | "attrs"
  | "object-id"
  | "src"
  | "none";

export interface IRObjectLengthV1 {
  value: number;
  unit: IRObjectLengthUnitV1;
  raw: unknown;
}

export interface IRObjectSizeV1 {
  width: Readonly<IRObjectLengthV1> | null;
  height: Readonly<IRObjectLengthV1> | null;
}

export interface IRObjectPositionV1 {
  x: Readonly<IRObjectLengthV1> | null;
  y: Readonly<IRObjectLengthV1> | null;
}

export interface IRObjectAttrGroupsV1 {
  geometry: readonly string[];
  placement: readonly string[];
  relationship: readonly string[];
  accessibility: readonly string[];
  link: readonly string[];
  caption: readonly string[];
  unknown: readonly string[];
}

export interface IRObjectRelationshipV1 {
  version: "ir-object-model-v1";
  objectId: string | null;
  relationshipIdCandidate: string | null;
  relationshipIdSource: IRObjectRelationshipIdSourceV1;
  target: string | null;
  targetKind: IRObjectRelationshipTargetKindV1;
  isExternal: boolean;
  mediaKind: IRObjectKindV1;
  mimeType: string | null;
  fileName: string | null;
  rawAttrs: Readonly<Record<string, unknown>>;
  unsupported: readonly string[];
}

export interface IRObjectLinkMetadataV1 {
  href: string | null;
  target: string | null;
  title: string | null;
}

export interface IRObjectCaptionMetadataV1 {
  captionId: string | null;
  targetId: string | null;
  targetType: string | null;
  text: string | null;
}

export interface IRObjectMetadataV1 {
  version: "ir-object-model-v1";
  altText: string | null;
  title: string | null;
  description: string | null;
  link: Readonly<IRObjectLinkMetadataV1> | null;
  caption: Readonly<IRObjectCaptionMetadataV1> | null;
  rawAttrs: Readonly<Record<string, unknown>>;
  unsupported: readonly string[];
}

export interface IRObjectModelV1 {
  version: "ir-object-model-v1";
  objectType: string;
  objectKind: IRObjectKindV1;
  flowMode: IRObjectFlowMode | null;
  anchorMode: IRObjectAnchorMode | null;
  size: Readonly<IRObjectSizeV1>;
  position: Readonly<IRObjectPositionV1>;
  attrs: Readonly<IRObjectAttrGroupsV1>;
  relationship: Readonly<IRObjectRelationshipV1>;
  metadata: Readonly<IRObjectMetadataV1>;
  childBlockCount: number;
  rawAttrs: Readonly<Record<string, unknown>>;
  unsupported: readonly string[];
}

const MODEL_VERSION = "ir-object-model-v1" as const;

const GEOMETRY_ATTR_KEYS = ["width", "height", "x", "y"];
const PLACEMENT_ATTR_KEYS = [
  "flowMode",
  "flow_mode",
  "anchorMode",
  "anchor_mode"
];
const RELATIONSHIP_ATTR_KEYS = [
  "src",
  "objectId",
  "id",
  "relationshipId",
  "relId",
  "rId",
  "mediaRelationshipId",
  "mediaId",
  "mimeType",
  "fileName"
];
const ACCESSIBILITY_ATTR_KEYS = [
  "alt",
  "altText",
  "ariaLabel",
  "title",
  "description"
];
const LINK_ATTR_KEYS = ["href", "linkHref", "linkTarget", "linkTitle", "target"];
const CAPTION_ATTR_KEYS = [
  "captionId",
  "captionText",
  "caption",
  "targetId",
  "targetType"
];
const KNOWN_ATTR_KEYS = new Set([
  ...GEOMETRY_ATTR_KEYS,
  ...PLACEMENT_ATTR_KEYS,
  ...RELATIONSHIP_ATTR_KEYS,
  ...ACCESSIBILITY_ATTR_KEYS,
  ...LINK_ATTR_KEYS,
  ...CAPTION_ATTR_KEYS
]);

const freezeArray = <T>(items: readonly T[]) => Object.freeze([...items]);

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const parseLength = (
  value: unknown,
  defaultUnit: IRObjectLengthUnitV1
): Readonly<IRObjectLengthV1> | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Object.freeze({ value, unit: defaultUnit, raw: value });
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(pt|px|mm|%)?$/i);

  if (!match) {
    return null;
  }

  const numericValue = Number(match[1]);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const unit = match[2]?.toLowerCase();

  return Object.freeze({
    value: numericValue,
    unit: unit === "%" ? "percent" : (unit as IRObjectLengthUnitV1) || defaultUnit,
    raw: value
  });
};

const getFirstStringAttr = (
  attrs: Record<string, unknown>,
  keys: readonly string[]
) => {
  for (const key of keys) {
    const value = attrs[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const getObjectKind = (objectType: string): IRObjectKindV1 => {
  if (objectType === "image") return "image";
  if (objectType === "shapeBlock") return "shape";
  if (objectType === "chartBlock") return "chart";
  if (objectType === "diagramBlock") return "diagram";
  return "unknown";
};

const pickExistingKeys = (
  attrs: Record<string, unknown>,
  keys: readonly string[]
) =>
  freezeArray(
    keys.filter((key) => Object.prototype.hasOwnProperty.call(attrs, key))
  );

const createAttrGroups = (
  attrs: Record<string, unknown>
): Readonly<IRObjectAttrGroupsV1> =>
  Object.freeze({
    geometry: pickExistingKeys(attrs, GEOMETRY_ATTR_KEYS),
    placement: pickExistingKeys(attrs, PLACEMENT_ATTR_KEYS),
    relationship: pickExistingKeys(attrs, RELATIONSHIP_ATTR_KEYS),
    accessibility: pickExistingKeys(attrs, ACCESSIBILITY_ATTR_KEYS),
    link: pickExistingKeys(attrs, LINK_ATTR_KEYS),
    caption: pickExistingKeys(attrs, CAPTION_ATTR_KEYS),
    unknown: freezeArray(
      Object.keys(attrs).filter((key) => !KNOWN_ATTR_KEYS.has(key))
    )
  });

const inferTargetKind = (target: string | null): IRObjectRelationshipTargetKindV1 => {
  if (!target) {
    return "none";
  }

  if (target.startsWith("data:")) {
    return "data-uri";
  }

  if (/^https?:\/\//i.test(target)) {
    return "url";
  }

  return "embedded-ref";
};

const inferMimeType = (attrs: Record<string, unknown>, target: string | null) => {
  const explicitMimeType = getFirstStringAttr(attrs, ["mimeType"]);

  if (explicitMimeType) {
    return explicitMimeType;
  }

  const dataUriMatch = target?.match(/^data:([^;,]+)[;,]/i);

  return dataUriMatch?.[1] || null;
};

const inferFileName = (attrs: Record<string, unknown>, target: string | null) => {
  const explicitFileName = getFirstStringAttr(attrs, ["fileName"]);

  if (explicitFileName) {
    return explicitFileName;
  }

  if (!target || target.startsWith("data:")) {
    return null;
  }

  const lastPathPart = target.split(/[\\/]/).pop()?.split("?")[0]?.split("#")[0];

  return lastPathPart || null;
};

const createRelationshipIdCandidate = (
  attrs: Record<string, unknown>
): {
  relationshipIdCandidate: string | null;
  relationshipIdSource: IRObjectRelationshipIdSourceV1;
} => {
  const explicitRelationshipId = getFirstStringAttr(attrs, [
    "relationshipId",
    "relId",
    "rId",
    "mediaRelationshipId",
    "mediaId"
  ]);

  if (explicitRelationshipId) {
    return {
      relationshipIdCandidate: explicitRelationshipId,
      relationshipIdSource: "attrs"
    };
  }

  const objectId = getFirstStringAttr(attrs, ["objectId", "id"]);

  if (objectId) {
    return {
      relationshipIdCandidate: `object:${objectId}`,
      relationshipIdSource: "object-id"
    };
  }

  const src = getFirstStringAttr(attrs, ["src"]);

  if (src) {
    return {
      relationshipIdCandidate: `src:${src}`,
      relationshipIdSource: "src"
    };
  }

  return {
    relationshipIdCandidate: null,
    relationshipIdSource: "none"
  };
};

const createRelationship = (
  objectKind: IRObjectKindV1,
  attrs: Record<string, unknown>
): Readonly<IRObjectRelationshipV1> => {
  const objectId = getFirstStringAttr(attrs, ["objectId", "id"]);
  const src = getFirstStringAttr(attrs, ["src"]);
  const target = src || objectId;
  const targetKind = src ? inferTargetKind(src) : objectId ? "object-id" : "none";
  const { relationshipIdCandidate, relationshipIdSource } =
    createRelationshipIdCandidate(attrs);
  const unsupported: string[] = [];

  if (relationshipIdCandidate) {
    unsupported.push("relationship id is candidate-only in v1");
  }

  if (objectKind === "image" && !target) {
    unsupported.push("image media target is missing");
  }

  if (objectKind === "shape" || objectKind === "chart" || objectKind === "diagram") {
    unsupported.push(`${objectKind} payload remains raw in v1`);
  }

  return Object.freeze({
    version: MODEL_VERSION,
    objectId,
    relationshipIdCandidate,
    relationshipIdSource,
    target,
    targetKind,
    isExternal: targetKind === "url",
    mediaKind: objectKind,
    mimeType: inferMimeType(attrs, target),
    fileName: inferFileName(attrs, target),
    rawAttrs: Object.freeze({ ...attrs }),
    unsupported: freezeArray(unsupported)
  });
};

const createLinkMetadata = (
  attrs: Record<string, unknown>
): Readonly<IRObjectLinkMetadataV1> | null => {
  const href = getFirstStringAttr(attrs, ["href", "linkHref"]);

  if (!href) {
    return null;
  }

  return Object.freeze({
    href,
    target: getFirstStringAttr(attrs, ["linkTarget", "target"]),
    title: getFirstStringAttr(attrs, ["linkTitle", "title"])
  });
};

const createCaptionMetadata = (
  attrs: Record<string, unknown>,
  objectType: string,
  objectId: string | null
): Readonly<IRObjectCaptionMetadataV1> | null => {
  const captionId = getFirstStringAttr(attrs, ["captionId"]);
  const text = getFirstStringAttr(attrs, ["captionText", "caption"]);
  const targetId = getFirstStringAttr(attrs, ["targetId"]) || objectId;
  const targetType = getFirstStringAttr(attrs, ["targetType"]) || objectType;

  if (!captionId && !text && !targetId) {
    return null;
  }

  return Object.freeze({
    captionId,
    targetId,
    targetType,
    text
  });
};

const createMetadata = (
  objectType: string,
  attrs: Record<string, unknown>,
  objectId: string | null
): Readonly<IRObjectMetadataV1> =>
  Object.freeze({
    version: MODEL_VERSION,
    altText: getFirstStringAttr(attrs, ["altText", "alt", "ariaLabel"]),
    title: getFirstStringAttr(attrs, ["title"]),
    description: getFirstStringAttr(attrs, ["description"]),
    link: createLinkMetadata(attrs),
    caption: createCaptionMetadata(attrs, objectType, objectId),
    rawAttrs: Object.freeze({ ...attrs }),
    unsupported: freezeArray([
      "caption relationship is not resolved against captionBlock in v1"
    ])
  });

const getUnitGaps = (size: IRObjectSizeV1, position: IRObjectPositionV1) => {
  const lengths = [size.width, size.height, position.x, position.y];

  return lengths.some((length) => length?.unit === "unknown")
    ? ["numeric object units remain unknown unless source attrs include a unit"]
    : [];
};

export const normalizeObjectModel = (
  objectBlock: IRObjectBlock
): Readonly<IRObjectModelV1> => {
  const attrs = asRecord(objectBlock.attrs);
  const objectKind = getObjectKind(objectBlock.objectType);
  const size = Object.freeze({
    width: parseLength(attrs.width, "unknown"),
    height: parseLength(attrs.height, "unknown")
  });
  const position = Object.freeze({
    x: parseLength(attrs.x, "unknown"),
    y: parseLength(attrs.y, "unknown")
  });
  const relationship = createRelationship(objectKind, attrs);
  const metadata = createMetadata(
    objectBlock.objectType,
    attrs,
    relationship.objectId
  );
  const attrGroups = createAttrGroups(attrs);
  const unsupported = [
    ...relationship.unsupported,
    ...metadata.unsupported,
    ...getUnitGaps(size, position),
    ...attrGroups.unknown.map((key) => `object attr ${key} remains raw`)
  ];

  return Object.freeze({
    version: MODEL_VERSION,
    objectType: objectBlock.objectType,
    objectKind,
    flowMode: objectBlock.flowMode ?? null,
    anchorMode: objectBlock.anchorMode ?? null,
    size,
    position,
    attrs: attrGroups,
    relationship,
    metadata,
    childBlockCount: objectBlock.children?.length ?? 0,
    rawAttrs: Object.freeze({ ...attrs }),
    unsupported: freezeArray(Array.from(new Set(unsupported)))
  });
};
