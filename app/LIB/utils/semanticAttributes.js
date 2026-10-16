export const SEMANTIC_ATTRIBUTE_TYPES = [
  "paragraph",
  "heading",
  "image",
  "table",
  "chartBlock",
  "shapeBlock",
  "diagramBlock"
];
export const SEMANTIC_ATTRIBUTE_TYPE_SET = new Set(SEMANTIC_ATTRIBUTE_TYPES);

export const SEMANTIC_IDENTIFIER_MAX_LENGTH = 128;
export const SEMANTIC_TAG_MAX_COUNT = 16;
export const SEMANTIC_TAG_MAX_LENGTH = 64;

const BASE_IDENTIFIER = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;
const KEY_IDENTIFIER = /^[\p{L}\p{N}][\p{L}\p{N}._-]*(?:~(?:[2-9]\d*|1\d+))?$/u;
const codePointLength = (value) => [...value].length;
const compareCodePoints = (left, right) => {
  const leftPoints = [...left];
  const rightPoints = [...right];
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference =
      leftPoints[index].codePointAt(0) - rightPoints[index].codePointAt(0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
};
export const normalizeSemanticString = (value) =>
  typeof value === "string" ? value.normalize("NFC").trim() : null;

const validateIdentifier = (
  value,
  { key = false, maxLength = SEMANTIC_IDENTIFIER_MAX_LENGTH } = {}
) => {
  const normalized = normalizeSemanticString(value);
  if (!normalized) return { valid: false, code: "empty", value: null };
  if (codePointLength(normalized) > maxLength) {
    return { valid: false, code: "too_long", value: null };
  }
  if (!(key ? KEY_IDENTIFIER : BASE_IDENTIFIER).test(normalized)) {
    return { valid: false, code: "invalid_identifier", value: null };
  }
  return { valid: true, code: null, value: normalized };
};

export const validateSemanticKey = (value) =>
  validateIdentifier(value, { key: true });
export const validateSemanticRole = (value) => validateIdentifier(value);

export const validateSemanticTags = (value) => {
  if (value === null || value === undefined || value === "") {
    return { valid: true, code: null, value: [] };
  }
  if (!Array.isArray(value) || value.length > SEMANTIC_TAG_MAX_COUNT) {
    return { valid: false, code: "invalid_tags", value: [] };
  }

  const tags = [];
  const seen = new Set();
  for (const tag of value) {
    const result = validateIdentifier(tag, {
      maxLength: SEMANTIC_TAG_MAX_LENGTH
    });
    if (!result.valid) {
      return {
        valid: false,
        code: `tag_${result.code}`,
        value: []
      };
    }
    if (!seen.has(result.value)) {
      seen.add(result.value);
      tags.push(result.value);
    }
  }

  return { valid: true, code: null, value: tags.sort(compareCodePoints) };
};

export const validateSemanticAttributes = (attributes = {}) => {
  const optionalIdentifier = (value, validator) => {
    if (value === null || value === undefined || value === "") {
      return { valid: true, code: null, value: null };
    }
    return validator(value);
  };
  const key = optionalIdentifier(attributes.semanticKey, validateSemanticKey);
  const role = optionalIdentifier(attributes.semanticRole, validateSemanticRole);
  const tags = validateSemanticTags(attributes.semanticTags);

  return {
    valid: key.valid && role.valid && tags.valid,
    code: !key.valid
      ? `semanticKey_${key.code}`
      : !role.valid
        ? `semanticRole_${role.code}`
        : tags.valid
          ? null
          : `semanticTags_${tags.code}`,
    value: {
      semanticKey: key.valid ? key.value : null,
      semanticRole: role.valid ? role.value : null,
      semanticTags: tags.valid ? tags.value : []
    }
  };
};

const CARRIER = /^(?:p|h[1-6]|img|table|div)$/i;
const decodeHtmlAttribute = (value) =>
  value
    .replace(/&quot;|&#0*34;|&#x0*22;/giu, '"')
    .replace(/&amp;/giu, "&");

const scanHtmlAttributes = (tagText) => {
  const attributes = [];
  let index = 0;
  if (tagText[index] === "<") index += 1;
  while (index < tagText.length && /\s/u.test(tagText[index])) index += 1;
  while (index < tagText.length && !/[\s/>]/u.test(tagText[index])) index += 1;

  while (index < tagText.length) {
    while (index < tagText.length && /\s/u.test(tagText[index])) index += 1;
    if (
      index >= tagText.length ||
      tagText[index] === ">" ||
      tagText[index] === "/"
    ) {
      break;
    }

    const nameStart = index;
    while (
      index < tagText.length &&
      !/[\s=/>]/u.test(tagText[index])
    ) {
      index += 1;
    }
    if (index === nameStart) {
      index += 1;
      continue;
    }
    const name = tagText.slice(nameStart, index).toLowerCase();
    while (index < tagText.length && /\s/u.test(tagText[index])) index += 1;

    let value = null;
    let quoted = false;
    if (tagText[index] === "=") {
      index += 1;
      while (index < tagText.length && /\s/u.test(tagText[index])) index += 1;
      const quote = tagText[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        const valueStart = index;
        while (index < tagText.length && tagText[index] !== quote) index += 1;
        value = tagText.slice(valueStart, index);
        quoted = tagText[index] === quote;
        if (quoted) index += 1;
      } else {
        const valueStart = index;
        while (
          index < tagText.length &&
          !/[\s"'=<>`]/u.test(tagText[index])
        ) {
          index += 1;
        }
        value = tagText.slice(valueStart, index);
      }
    }
    attributes.push({ name, value, quoted });
  }
  return attributes;
};
const scanHtmlTags = (content) => {
  const tags = [];
  let start = -1;
  let quote = null;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (start < 0) {
      if (character === "<") start = index;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") {
      tags.push(content.slice(start, index + 1));
      start = -1;
    }
  }

  return {
    tags,
    trailingTag: start >= 0 ? content.slice(start) : null
  };
};
const isSupportedCarrier = (tag, attributes) => {
  if (!CARRIER.test(tag)) return false;
  if (!/^div$/i.test(tag)) return true;

  return (
    attributes.some((attribute) => attribute.name === "data-chart-block") ||
    attributes.some((attribute) => attribute.name === "data-diagram-block") ||
    attributes.some(
      (attribute) =>
        attribute.name === "data-type" && attribute.value === "shape-block"
    )
  );
};

// This deliberately uses only string parsing so import validation also works in Node.
export const validateSemanticHtmlPayload = (content) => {
  if (typeof content !== "string") return { hasSemanticData: false, valid: false };
  const { tags, trailingTag } = scanHtmlTags(content);
  const usedKeys = new Set();
  let hasSemanticData = false;
  for (const tagText of tags) {
    const open = /^<\s*([a-z0-9]+)/i.exec(tagText);
    if (!open) continue;
    const attributes = scanHtmlAttributes(tagText);
    const fields = {};
    const semanticAttributes = attributes.filter((attribute) =>
      /^data-dockit-semantic-(key|role|tags)$/i.test(attribute.name)
    );
    if (!semanticAttributes.length) continue;
    hasSemanticData = true;
    if (!isSupportedCarrier(open[1], attributes)) {
      return { hasSemanticData: true, valid: false };
    }
    if (
      semanticAttributes.some(
        (attribute) => !attribute.quoted || attribute.value === null
      )
    ) {
      return { hasSemanticData: true, valid: false };
    }

    for (const attribute of semanticAttributes) {
      const name = attribute.name.slice("data-dockit-semantic-".length);
      if (Object.hasOwn(fields, name)) {
        return { hasSemanticData: true, valid: false };
      }
      fields[name] = decodeHtmlAttribute(attribute.value);
    }

    if (Object.hasOwn(fields, "key")) {
      const result = validateSemanticKey(fields.key);
      if (!result.valid || usedKeys.has(result.value)) {
        return { hasSemanticData: true, valid: false };
      }
      usedKeys.add(result.value);
    }
    if (
      Object.hasOwn(fields, "role") &&
      !validateSemanticRole(fields.role).valid
    ) {
      return { hasSemanticData: true, valid: false };
    }

    if (Object.hasOwn(fields, "tags")) {
      let raw;
      try {
        raw = JSON.parse(fields.tags);
      } catch {
        return { hasSemanticData: true, valid: false };
      }
      if (!validateSemanticTags(raw).valid) {
        return { hasSemanticData: true, valid: false };
      }
    }
  }
  if (trailingTag) {
    const open = /^<\s*([a-z0-9]+)/i.exec(trailingTag);
    if (open) {
      const semanticAttributes = scanHtmlAttributes(trailingTag).filter(
        (attribute) =>
          /^data-dockit-semantic-(key|role|tags)$/i.test(attribute.name)
      );
      if (semanticAttributes.length) {
        return { hasSemanticData: true, valid: false };
      }
    }
  }
  return { hasSemanticData, valid: true };
};
