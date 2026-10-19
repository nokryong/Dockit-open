import { Mark, getMarkRange, mergeAttributes } from "@tiptap/core";

const normalizeHexColor = (color) => {
  if (typeof color !== "string") {
    return null;
  }

  const trimmed = color.trim();
  const shortHexMatch = trimmed.match(/^#([0-9a-fA-F]{3})$/);

  if (shortHexMatch) {
    return `#${shortHexMatch[1]
      .split("")
      .map((char) => char + char)
      .join("")
      .toLowerCase()}`;
  }

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
};

const darkenHexColor = (color, amount = 0.18) => {
  const normalizedColor = normalizeHexColor(color);

  if (!normalizedColor) {
    return color;
  }

  const hex = normalizedColor.slice(1);
  const channels = [0, 2, 4].map((start) =>
    parseInt(hex.slice(start, start + 2), 16)
  );
  const darkenedChannels = channels.map((channel) =>
    Math.max(0, Math.round(channel * (1 - amount)))
  );

  return `#${darkenedChannels
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
};

const hexToRgba = (color, alpha) => {
  const normalizedColor = normalizeHexColor(color);

  if (!normalizedColor) {
    return color;
  }

  const hex = normalizedColor.slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildInlineTagColorStyle = (color) => {
  const normalizedColor = normalizeHexColor(color);

  if (!normalizedColor) {
    return "";
  }

  return [
    `--inline-tag-bg: ${normalizedColor}`,
    `--inline-tag-border: ${darkenHexColor(normalizedColor)}`,
    `--inline-tag-shadow: ${hexToRgba(normalizedColor, 0.28)}`
  ].join("; ");
};

const normalizeInlineTagAttributes = (attributes = {}) => {
  const normalizedColor = normalizeHexColor(attributes.color);
  const nextAttributes = { ...attributes };

  if (normalizedColor) {
    nextAttributes.color = normalizedColor;
  } else {
    delete nextAttributes.color;
  }

  return nextAttributes;
};

const getSelectionMarkRange = ({ state, markType }) => {
  const { selection } = state;

  if (!selection.empty) {
    return {
      from: selection.from,
      to: selection.to
    };
  }

  const activeMark = markType.isInSet(
    state.storedMarks?.length ? state.storedMarks : selection.$from.marks()
  );

  if (!activeMark) {
    return null;
  }

  return getMarkRange(selection.$from, markType, activeMark.attrs);
};

const InlineTag = Mark.create({
  name: "inlineTag",

  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-inline-tag="true"]'
      }
    ];
  },

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) =>
          normalizeHexColor(element.getAttribute("data-inline-tag-color")),
        renderHTML: (attributes) => {
          const color = normalizeHexColor(attributes.color);

          if (!color) {
            return {};
          }

          return {
            "data-inline-tag-color": color,
            style: buildInlineTagColorStyle(color)
          };
        }
      }
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-inline-tag": "true"
      }),
      0
    ];
  },

  addCommands() {
    return {
      setInlineTag:
        (attributes = {}) =>
        ({ commands }) =>
          commands.setMark(this.name, normalizeInlineTagAttributes(attributes)),
      toggleInlineTag:
        (attributes = {}) =>
        ({ commands }) =>
          commands.toggleMark(
            this.name,
            normalizeInlineTagAttributes(attributes),
            { extendEmptyMarkRange: true }
          ),
      unsetInlineTag:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name, { extendEmptyMarkRange: true }),
      setInlineTagColor:
        (color) =>
        ({ state, tr, dispatch }) => {
          const markType = state.schema.marks[this.name];
          const normalizedColor = normalizeHexColor(color);

          if (!markType || !normalizedColor) {
            return false;
          }

          if (!dispatch) {
            return true;
          }

          const range = getSelectionMarkRange({ state, markType });

          if (!range) {
            tr.addStoredMark(markType.create({ color: normalizedColor }));
            return true;
          }

          state.doc.nodesBetween(range.from, range.to, (node, pos) => {
            if (!node.isInline) {
              return;
            }

            const from = Math.max(pos, range.from);
            const to = Math.min(pos + node.nodeSize, range.to);
            const existingMark = node.marks.find(
              (mark) => mark.type === markType
            );

            tr.addMark(
              from,
              to,
              markType.create({
                ...(existingMark?.attrs || {}),
                color: normalizedColor
              })
            );
          });

          return true;
        }
    };
  },

  addKeyboardShortcuts() {
    return {
      "Alt-t": () => this.editor.commands.toggleInlineTag()
    };
  }
});

export default InlineTag;
