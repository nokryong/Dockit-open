const DEFAULT_FONT_SIZE = 12;
const DEFAULT_LINE_HEIGHT = 1.5;
const DEFAULT_LETTER_SPACING = 0;

const BLOCK_TYPE_NAMES = new Set(["paragraph", "heading"]);

const parseUnitValue = (value) => {
  if (value == null || value === "") {
    return null;
  }

  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildPresetKey = () =>
  `style-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const clampHeadingLevel = (level) =>
  Math.min(6, Math.max(1, parseInt(level, 10) || 1));

const extractTextStyleFromTextNode = (textNode) => {
  if (!textNode?.marks?.length) {
    return null;
  }

  const textStyleMark = textNode.marks.find(
    (mark) => mark.type.name === "textStyle"
  );
  const highlightMark = textNode.marks.find(
    (mark) => mark.type.name === "highlight"
  );

  return {
    fontSize: parseUnitValue(textStyleMark?.attrs?.fontSize),
    color: textStyleMark?.attrs?.color || null,
    backgroundColor: textStyleMark?.attrs?.backgroundColor || null,
    letterSpacing:
      parseUnitValue(textStyleMark?.attrs?.letterSpacing) ??
      DEFAULT_LETTER_SPACING,
    bold: textNode.marks.some((mark) => mark.type.name === "bold"),
    italic: textNode.marks.some((mark) => mark.type.name === "italic"),
    underline: textNode.marks.some((mark) => mark.type.name === "underline"),
    strike: textNode.marks.some((mark) => mark.type.name === "strike"),
    highlight: highlightMark?.attrs?.color || null
  };
};

const getFirstTextStyleSnapshot = (node) => {
  let snapshot = null;

  node?.descendants((child) => {
    if (!child.isText || !child.text?.trim()) {
      return true;
    }

    snapshot = extractTextStyleFromTextNode(child);
    return false;
  });

  return snapshot;
};

const getSelectionBlockInfo = (state) => {
  const { selection } = state;

  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    const node = selection.$from.node(depth);

    if (!BLOCK_TYPE_NAMES.has(node.type.name)) {
      continue;
    }

    return {
      node,
      pos: depth > 0 ? selection.$from.before(depth) : 0
    };
  }

  return null;
};

const collectTargetBlocks = (state) => {
  const { selection, doc } = state;

  if (selection.empty) {
    const currentBlockInfo = getSelectionBlockInfo(state);
    return currentBlockInfo ? [currentBlockInfo] : [];
  }

  const blocks = [];
  const seen = new Set();

  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!BLOCK_TYPE_NAMES.has(node.type.name) || seen.has(pos)) {
      return true;
    }

    seen.add(pos);
    blocks.push({ node, pos });
    return true;
  });

  return blocks;
};

const getActiveTextStyleFallback = (editor, options = {}) => {
  const textStyleAttrs = editor.getAttributes("textStyle") || {};
  const paragraphAttrs = editor.getAttributes("paragraph") || {};

  return {
    fontSize:
      parseUnitValue(textStyleAttrs.fontSize) ??
      parseUnitValue(paragraphAttrs.fontSize) ??
      options.defaultFontSize ??
      DEFAULT_FONT_SIZE,
    color: textStyleAttrs.color || null,
    backgroundColor: textStyleAttrs.backgroundColor || null,
    letterSpacing:
      parseUnitValue(textStyleAttrs.letterSpacing) ?? DEFAULT_LETTER_SPACING,
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    highlight: editor.getAttributes("highlight")?.color || null
  };
};

export const getCurrentBlockStylePreset = (editor, options = {}) => {
  if (!editor?.state) {
    return null;
  }

  const blockInfo = getSelectionBlockInfo(editor.state);

  if (!blockInfo) {
    return null;
  }

  const { node } = blockInfo;
  const blockAttrs = node.attrs || {};
  const textSnapshot =
    getFirstTextStyleSnapshot(node) ||
    getActiveTextStyleFallback(editor, options);
  const level =
    node.type.name === "heading" ? clampHeadingLevel(blockAttrs.level) : null;

  return {
    key: buildPresetKey(),
    title: "",
    blockType: node.type.name === "heading" ? "heading" : "paragraph",
    level,
    fontSize:
      textSnapshot.fontSize ?? options.defaultFontSize ?? DEFAULT_FONT_SIZE,
    bold: Boolean(textSnapshot.bold),
    italic: Boolean(textSnapshot.italic),
    underline: Boolean(textSnapshot.underline),
    strike: Boolean(textSnapshot.strike),
    color: textSnapshot.color || null,
    backgroundColor: textSnapshot.backgroundColor || null,
    highlight: textSnapshot.highlight || null,
    textAlign: blockAttrs.textAlign || "left",
    lineHeight:
      parseUnitValue(blockAttrs.lineHeight) ??
      options.defaultLineHeight ??
      DEFAULT_LINE_HEIGHT,
    indent: typeof blockAttrs.indent === "number" ? blockAttrs.indent : 0,
    indentLevel:
      typeof blockAttrs.indentLevel === "number" ? blockAttrs.indentLevel : 0,
    wordBreak: blockAttrs.wordBreak || null,
    letterSpacing: textSnapshot.letterSpacing ?? DEFAULT_LETTER_SPACING
  };
};

const buildTextStyleAttrs = (preset) => {
  const attrs = {};

  if (preset.fontSize != null) {
    attrs.fontSize = `${preset.fontSize}pt`;
  }

  if (preset.color) {
    attrs.color = preset.color;
  }

  if (preset.backgroundColor) {
    attrs.backgroundColor = preset.backgroundColor;
  }

  if (preset.letterSpacing != null) {
    attrs.letterSpacing = `${preset.letterSpacing}pt`;
  }

  return attrs;
};

const buildStoredMarks = (schema, preset) => {
  const marks = [];
  const textStyleAttrs = buildTextStyleAttrs(preset);

  if (schema.marks.textStyle && Object.keys(textStyleAttrs).length > 0) {
    marks.push(schema.marks.textStyle.create(textStyleAttrs));
  }

  if (preset.bold && schema.marks.bold) {
    marks.push(schema.marks.bold.create());
  }

  if (preset.italic && schema.marks.italic) {
    marks.push(schema.marks.italic.create());
  }

  if (preset.underline && schema.marks.underline) {
    marks.push(schema.marks.underline.create());
  }

  if (preset.strike && schema.marks.strike) {
    marks.push(schema.marks.strike.create());
  }

  if (preset.highlight && schema.marks.highlight) {
    marks.push(schema.marks.highlight.create({ color: preset.highlight }));
  }

  return marks;
};

const buildNodeAttrsForType = (nodeTypeName, currentNode, preset) => {
  const currentAttrs = currentNode.attrs || {};
  const baseAttrs = {
    textAlign: preset.textAlign || "left",
    lineHeight:
      preset.lineHeight != null ? preset.lineHeight : currentAttrs.lineHeight,
    indent: typeof preset.indent === "number" ? preset.indent : 0,
    indentLevel:
      typeof preset.indentLevel === "number" ? preset.indentLevel : 0,
    wordBreak: preset.wordBreak || currentAttrs.wordBreak || null
  };

  if (nodeTypeName === "heading") {
    return {
      ...baseAttrs,
      level: clampHeadingLevel(preset.level || 1),
      headingId: currentAttrs.headingId || null
    };
  }

  return {
    ...baseAttrs,
    fontSize: currentAttrs.fontSize ?? null
  };
};

export const applyStylePresetToEditor = (editor, preset) => {
  if (!editor?.view || !preset) {
    return false;
  }

  const { state, view } = editor;
  const { schema, selection } = state;
  const targetBlocks = collectTargetBlocks(state);

  if (targetBlocks.length === 0) {
    return false;
  }

  const tr = state.tr;
  const textStyleMarkType = schema.marks.textStyle;
  const markTypesToReset = [
    schema.marks.bold,
    schema.marks.italic,
    schema.marks.underline,
    schema.marks.strike,
    schema.marks.highlight
  ].filter(Boolean);
  const textStyleAttrs = buildTextStyleAttrs(preset);
  const nextStoredMarks = buildStoredMarks(schema, preset);

  targetBlocks.forEach(({ node, pos }) => {
    const $pos = tr.doc.resolve(pos);
    const parent = $pos.parent;
    const index = $pos.index();
    const requestedType =
      preset.blockType === "heading"
        ? schema.nodes.heading
        : schema.nodes.paragraph;
    const nextNodeType =
      requestedType && parent.canReplaceWith(index, index + 1, requestedType)
        ? requestedType
        : node.type;
    const nextTypeName = nextNodeType.name;
    const nextAttrs = buildNodeAttrsForType(nextTypeName, node, preset);

    tr.setNodeMarkup(pos, nextNodeType, nextAttrs);

    const rangeFrom = pos + 1;
    const rangeTo = pos + node.nodeSize - 1;

    if (rangeTo <= rangeFrom) {
      return;
    }

    if (textStyleMarkType) {
      tr.removeMark(rangeFrom, rangeTo, textStyleMarkType);
    }

    markTypesToReset.forEach((markType) => {
      tr.removeMark(rangeFrom, rangeTo, markType);
    });

    if (textStyleMarkType && Object.keys(textStyleAttrs).length > 0) {
      tr.addMark(rangeFrom, rangeTo, textStyleMarkType.create(textStyleAttrs));
    }

    if (preset.bold && schema.marks.bold) {
      tr.addMark(rangeFrom, rangeTo, schema.marks.bold.create());
    }

    if (preset.italic && schema.marks.italic) {
      tr.addMark(rangeFrom, rangeTo, schema.marks.italic.create());
    }

    if (preset.underline && schema.marks.underline) {
      tr.addMark(rangeFrom, rangeTo, schema.marks.underline.create());
    }

    if (preset.strike && schema.marks.strike) {
      tr.addMark(rangeFrom, rangeTo, schema.marks.strike.create());
    }

    if (preset.highlight && schema.marks.highlight) {
      tr.addMark(
        rangeFrom,
        rangeTo,
        schema.marks.highlight.create({ color: preset.highlight })
      );
    }
  });

  if (selection.empty) {
    tr.setStoredMarks(nextStoredMarks);
  }

  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
};


