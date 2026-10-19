import { describe, expect, it } from "vitest";
import {
  clampDocumentPanelSizes,
  clampWorkspacePanelRight,
  getWorkspacePanelBounds
} from "../../app/LIB/utils/panelSizeUtils";

describe("panelSizeUtils", () => {
  it("keeps document side panels from taking more than half the layout", () => {
    expect(
      clampDocumentPanelSizes({ left: 500, right: 500 }, {}, 1200)
    ).toEqual({
      left: 300,
      right: 300
    });
  });

  it("lets one document side panel use half the layout when the other is collapsed", () => {
    expect(
      clampDocumentPanelSizes({ left: 0, right: 900 }, {}, 1200)
    ).toEqual({
      left: 0,
      right: 600
    });
  });

  it("clamps the docs workspace right panel so the center keeps 55 percent", () => {
    expect(clampWorkspacePanelRight(440, 320, 800)).toBe(360);
    expect(getWorkspacePanelBounds(800)).toEqual({
      min: 300,
      max: 360
    });
  });

  it("reduces the workspace minimum when a narrow container cannot fit it", () => {
    expect(clampWorkspacePanelRight(320, 320, 600)).toBe(270);
    expect(getWorkspacePanelBounds(600)).toEqual({
      min: 270,
      max: 270
    });
  });
});
