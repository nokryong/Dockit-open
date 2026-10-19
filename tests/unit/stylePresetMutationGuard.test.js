import { describe, expect, it, vi } from "vitest";
import { applyStylePresetToEditor } from "../../app/LIB/utils/stylePresetUtils";

const createMarkType = () => ({
  create: (attrs = {}) => ({ attrs })
});

const createPreset = () => ({
  blockType: "paragraph",
  bold: true,
  color: "#111111",
  fontSize: 14,
  indent: 0,
  indentLevel: 0,
  italic: false,
  letterSpacing: 0,
  lineHeight: 1.5,
  strike: false,
  textAlign: "left",
  underline: false
});

const createSchema = () => ({
  marks: {
    bold: createMarkType(),
    highlight: createMarkType(),
    italic: createMarkType(),
    strike: createMarkType(),
    textStyle: createMarkType(),
    underline: createMarkType()
  },
  nodes: {
    heading: { name: "heading" },
    paragraph: { name: "paragraph" }
  }
});

describe("style preset mutation guard", () => {
  it("does not dispatch when editor or target block is unavailable", () => {
    expect(applyStylePresetToEditor(null, createPreset())).toBe(false);

    const dispatch = vi.fn();
    const editor = {
      state: {
        selection: {
          $from: {
            depth: 0,
            node: () => ({ type: { name: "doc" } })
          },
          empty: true
        }
      },
      view: { dispatch }
    };

    expect(applyStylePresetToEditor(editor, createPreset())).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches a style transaction only when explicitly applied", () => {
    const dispatch = vi.fn();
    const paragraphNode = {
      attrs: {},
      nodeSize: 5,
      type: { name: "paragraph" }
    };
    const tr = {
      addMark: vi.fn(),
      doc: {
        resolve: () => ({
          index: () => 0,
          parent: {
            canReplaceWith: () => true
          }
        })
      },
      removeMark: vi.fn(),
      scrollIntoView: vi.fn(function scrollIntoView() {
        return this;
      }),
      setNodeMarkup: vi.fn(),
      setStoredMarks: vi.fn()
    };
    const editor = {
      state: {
        schema: createSchema(),
        selection: {
          $from: {
            before: () => 0,
            depth: 1,
            node: () => paragraphNode
          },
          empty: true
        },
        tr
      },
      view: {
        dispatch,
        focus: vi.fn()
      }
    };

    expect(dispatch).not.toHaveBeenCalled();
    expect(applyStylePresetToEditor(editor, createPreset())).toBe(true);

    expect(tr.setNodeMarkup).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ name: "paragraph" }),
      expect.objectContaining({ lineHeight: 1.5, textAlign: "left" })
    );
    expect(dispatch).toHaveBeenCalledWith(tr);
  });
});
