import { Extension } from "@tiptap/core";

const parseLineHeight = (value) => {
  if (value == null || value === "") {
    return null;
  }

  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const LineHeightExtension = Extension.create({
  name: "lineHeight",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => parseLineHeight(element.style.lineHeight),
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) {
                return {};
              }

              return {
                style: `line-height: ${attributes.lineHeight};`
              };
            }
          }
        }
      }
    ];
  }
});

export default LineHeightExtension;
