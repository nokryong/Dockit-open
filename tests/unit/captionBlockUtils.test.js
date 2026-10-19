import { describe, expect, it } from "vitest";
import {
  buildCaptionNumberStyle,
  getCaptionContextFromSelection,
  shouldPreventCaptionEnter
} from "../../app/LIB/extensions/utils/captionBlockUtils";

describe("captionBlockUtils", () => {
  it("builds caption number style from display attrs", () => {
    expect(
      buildCaptionNumberStyle({
        displayFontFamily: "Pretendard",
        displayFontSize: 12,
        displayColor: "#111111",
        displayFontWeight: "700",
        displayFontStyle: "italic"
      })
    ).toBe(
      "font-family: Pretendard; font-size: 12pt; color: #111111; font-weight: 700; font-style: italic"
    );
  });

  it("returns caption context from nested selection depth", () => {
    const captionNode = {
      type: { name: "captionBlock" }
    };
    const paragraphNode = {
      type: { name: "paragraph" }
    };
    const selection = {
      $from: {
        depth: 2,
        node(depth) {
          return depth === 1 ? captionNode : paragraphNode;
        },
        before(depth) {
          return depth === 1 ? 25 : 30;
        }
      }
    };

    expect(getCaptionContextFromSelection(selection)).toEqual({
      node: captionNode,
      pos: 25
    });
  });

  it("returns null when selection is outside caption block", () => {
    const selection = {
      $from: {
        depth: 2,
        node() {
          return { type: { name: "paragraph" } };
        }
      }
    };

    expect(getCaptionContextFromSelection(selection)).toBeNull();
  });

  it("prevents Enter only for caption editing context", () => {
    expect(
      shouldPreventCaptionEnter({
        key: "Enter",
        isComposing: false,
        viewComposing: false,
        targetTagName: "DIV",
        hasCaptionContext: true
      })
    ).toBe(true);

    expect(
      shouldPreventCaptionEnter({
        key: "Enter",
        isComposing: true,
        viewComposing: false,
        targetTagName: "DIV",
        hasCaptionContext: true
      })
    ).toBe(false);

    expect(
      shouldPreventCaptionEnter({
        key: "Enter",
        isComposing: false,
        viewComposing: false,
        targetTagName: "INPUT",
        hasCaptionContext: true
      })
    ).toBe(false);

    expect(
      shouldPreventCaptionEnter({
        key: "Tab",
        isComposing: false,
        viewComposing: false,
        targetTagName: "DIV",
        hasCaptionContext: true
      })
    ).toBe(false);
  });
});
