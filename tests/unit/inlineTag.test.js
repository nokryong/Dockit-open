import { describe, expect, it, vi } from "vitest";
import InlineTag from "../../app/LIB/extensions/InlineTag";

const getInlineTagCommands = () =>
  InlineTag.config.addCommands.call({ name: "inlineTag" });

describe("InlineTag", () => {
  it("sets the inlineTag mark when applying a tag", () => {
    const commands = getInlineTagCommands();
    const setMark = vi.fn(() => true);

    expect(commands.setInlineTag()({ commands: { setMark } })).toBe(true);
    expect(setMark).toHaveBeenCalledWith("inlineTag", {});
  });

  it("updates the selected inline tag color", () => {
    const commands = getInlineTagCommands();
    const markType = {
      create: (attrs) => ({ type: markType, attrs })
    };
    const textNode = {
      isInline: true,
      nodeSize: 4,
      marks: [{ type: markType, attrs: { color: "#ffcc00" } }]
    };
    const addMark = vi.fn();
    const state = {
      schema: {
        marks: {
          inlineTag: markType
        }
      },
      selection: {
        empty: false,
        from: 1,
        to: 5,
        ranges: [{ $from: { pos: 1 }, $to: { pos: 5 } }]
      },
      doc: {
        nodesBetween: (_from, _to, callback) => callback(textNode, 1)
      }
    };

    expect(
      commands.setInlineTagColor("#5ED")({
        state,
        tr: { addMark },
        dispatch: vi.fn()
      })
    ).toBe(true);
    expect(addMark).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({
        attrs: { color: "#55eedd" }
      })
    );
  });

  it("stores and restores data-inline-tag-color", () => {
    const colorAttr = InlineTag.config.addAttributes().color;
    const renderedAttrs = colorAttr.renderHTML({ color: "#ffcc00" });
    const htmlSpec = InlineTag.config.renderHTML.call(
      { options: { HTMLAttributes: {} } },
      { HTMLAttributes: renderedAttrs }
    );

    expect(colorAttr.parseHTML({
      getAttribute: (name) =>
        name === "data-inline-tag-color" ? "#5eead4" : null
    })).toBe("#5eead4");
    expect(htmlSpec[0]).toBe("span");
    expect(htmlSpec[1]).toMatchObject({
      "data-inline-tag": "true",
      "data-inline-tag-color": "#ffcc00"
    });
    expect(htmlSpec[1].style).toContain("--inline-tag-bg: #ffcc00");
    expect(htmlSpec[1].style).toContain("--inline-tag-border: #d1a700");
  });

  it("removes the whole current tag when unsetting", () => {
    const commands = getInlineTagCommands();
    const unsetMark = vi.fn(() => true);

    expect(commands.unsetInlineTag()({ commands: { unsetMark } })).toBe(true);
    expect(unsetMark).toHaveBeenCalledWith("inlineTag", {
      extendEmptyMarkRange: true
    });
  });
});
