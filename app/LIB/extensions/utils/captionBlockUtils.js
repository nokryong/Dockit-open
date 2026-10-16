import { CAPTION_BLOCK_TYPE } from "../../utils/captionUtils";

export const buildCaptionNumberStyle = (attributes = {}) => {
  const styleEntries = [];

  if (attributes.displayFontFamily) {
    styleEntries.push(`font-family: ${attributes.displayFontFamily}`);
  }

  if (attributes.displayFontSize) {
    styleEntries.push(`font-size: ${attributes.displayFontSize}pt`);
  }

  if (attributes.displayColor) {
    styleEntries.push(`color: ${attributes.displayColor}`);
  }

  if (attributes.displayFontWeight) {
    styleEntries.push(`font-weight: ${attributes.displayFontWeight}`);
  }

  if (attributes.displayFontStyle) {
    styleEntries.push(`font-style: ${attributes.displayFontStyle}`);
  }

  return styleEntries.join("; ");
};

export const getCaptionContextFromSelection = (selection) => {
  const $from = selection?.$from;

  if (!$from) {
    return null;
  }

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (node.type.name !== CAPTION_BLOCK_TYPE) {
      continue;
    }

    return {
      node,
      pos: $from.before(depth)
    };
  }

  return null;
};

export const shouldPreventCaptionEnter = ({
  key,
  isComposing,
  viewComposing,
  targetTagName,
  hasCaptionContext
}) => {
  if (key !== "Enter") {
    return false;
  }

  if (isComposing || viewComposing) {
    return false;
  }

  if (["INPUT", "TEXTAREA", "SELECT"].includes(targetTagName)) {
    return false;
  }

  return hasCaptionContext;
};
