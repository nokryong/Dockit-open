import { Extension } from "@tiptap/core";

const DEFAULT_FONT_SIZE_PT = 12;
const DEFAULT_LETTER_SPACING_PT = 0;
const FONT_SIZE_STEP_PT = 1;
const LETTER_SPACING_STEP_PT = 0.5;
const MIN_FONT_SIZE_PT = 1;
const MIN_LETTER_SPACING_PT = -5;
const MAX_LETTER_SPACING_PT = 20;

const parseUnitValue = (value) => {
  if (value == null || value === "") {
    return null;
  }

  const parsed = parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getCurrentTextStyleAttrs = (editor) => {
  const attrs = editor.getAttributes("textStyle") || {};
  const paragraphAttrs = editor.getAttributes("paragraph") || {};
  const currentFontSize =
    parseUnitValue(attrs.fontSize) ??
    parseUnitValue(paragraphAttrs.fontSize) ??
    DEFAULT_FONT_SIZE_PT;
  const currentLetterSpacing =
    parseUnitValue(attrs.letterSpacing) ?? DEFAULT_LETTER_SPACING_PT;

  return {
    currentFontSize,
    currentLetterSpacing
  };
};

const applyTextStyleAttrs = (editor, attrs) =>
  editor.chain().focus().setMark("textStyle", attrs).run();

const TypographyShortcuts = Extension.create({
  name: "typographyShortcuts",

  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (element) => element.style.letterSpacing || null,
            renderHTML: (attributes) => {
              if (!attributes.letterSpacing) {
                return {};
              }

              return {
                style: `letter-spacing: ${attributes.letterSpacing}`
              };
            }
          }
        }
      }
    ];
  },

  addKeyboardShortcuts() {
    return {
      "Alt-[": ({ editor }) => {
        const { currentFontSize } = getCurrentTextStyleAttrs(editor);
        const nextFontSize = Math.max(
          MIN_FONT_SIZE_PT,
          currentFontSize - FONT_SIZE_STEP_PT
        );

        return applyTextStyleAttrs(editor, {
          fontSize: `${nextFontSize}pt`
        });
      },
      "Alt-]": ({ editor }) => {
        const { currentFontSize } = getCurrentTextStyleAttrs(editor);
        const nextFontSize = Math.max(
          MIN_FONT_SIZE_PT,
          currentFontSize + FONT_SIZE_STEP_PT
        );

        return applyTextStyleAttrs(editor, {
          fontSize: `${nextFontSize}pt`
        });
      },
      "Alt-ArrowLeft": ({ editor }) => {
        const { currentLetterSpacing } = getCurrentTextStyleAttrs(editor);
        const nextLetterSpacing = clamp(
          currentLetterSpacing - LETTER_SPACING_STEP_PT,
          MIN_LETTER_SPACING_PT,
          MAX_LETTER_SPACING_PT
        );

        return applyTextStyleAttrs(editor, {
          letterSpacing: `${nextLetterSpacing}pt`
        });
      },
      "Alt-ArrowRight": ({ editor }) => {
        const { currentLetterSpacing } = getCurrentTextStyleAttrs(editor);
        const nextLetterSpacing = clamp(
          currentLetterSpacing + LETTER_SPACING_STEP_PT,
          MIN_LETTER_SPACING_PT,
          MAX_LETTER_SPACING_PT
        );

        return applyTextStyleAttrs(editor, {
          letterSpacing: `${nextLetterSpacing}pt`
        });
      }
    };
  }
});

export default TypographyShortcuts;
