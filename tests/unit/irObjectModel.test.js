import { describe, expect, it } from "vitest";
import { normalizeObjectModel } from "../../app/LIB/ir/objectModel";

const imageBlock = {
  type: "object",
  objectType: "image",
  flowMode: "floating",
  anchorMode: "page",
  attrs: {
    src: "https://example.com/assets/photo.png",
    objectId: "img-1",
    width: "120mm",
    height: 180,
    x: "12px",
    y: "25mm",
    altText: "제품 사진",
    title: "대표 이미지",
    href: "https://example.com/detail",
    linkTarget: "_blank",
    captionId: "cap-1",
    captionText: "그림 1"
  },
  children: []
};

const shapeBlock = {
  type: "object",
  objectType: "shapeBlock",
  flowMode: "block",
  anchorMode: "paragraph",
  attrs: {
    objectId: "shape-1",
    width: "80px",
    height: "40px",
    shapeType: "rect",
    fillColor: "#ffcc00"
  },
  children: [
    {
      type: "paragraph",
      attrs: {},
      runs: [{ type: "textRun", text: "shape label", marks: [] }]
    }
  ]
};

describe("IR object model v1", () => {
  it("image object의 size/position unit과 media relationship 후보를 정규화한다", () => {
    const model = normalizeObjectModel(imageBlock);

    expect(model).toMatchObject({
      version: "ir-object-model-v1",
      objectType: "image",
      objectKind: "image",
      flowMode: "floating",
      anchorMode: "page",
      size: {
        width: { value: 120, unit: "mm", raw: "120mm" },
        height: { value: 180, unit: "unknown", raw: 180 }
      },
      position: {
        x: { value: 12, unit: "px", raw: "12px" },
        y: { value: 25, unit: "mm", raw: "25mm" }
      },
      relationship: {
        objectId: "img-1",
        relationshipIdCandidate: "object:img-1",
        relationshipIdSource: "object-id",
        target: "https://example.com/assets/photo.png",
        targetKind: "url",
        isExternal: true,
        mediaKind: "image",
        fileName: "photo.png"
      }
    });
    expect(model.attrs).toMatchObject({
      geometry: ["width", "height", "x", "y"],
      relationship: ["src", "objectId"],
      accessibility: ["altText", "title"],
      link: ["href", "linkTarget"],
      caption: ["captionId", "captionText"],
      unknown: []
    });
    expect(model.unsupported).toEqual(
      expect.arrayContaining([
        "relationship id is candidate-only in v1",
        "numeric object units remain unknown unless source attrs include a unit",
        "caption relationship is not resolved against captionBlock in v1"
      ])
    );
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.relationship)).toBe(true);
  });

  it("alt/link/caption metadata 후보를 attrs에서 추출한다", () => {
    const model = normalizeObjectModel(imageBlock);

    expect(model.metadata).toMatchObject({
      altText: "제품 사진",
      title: "대표 이미지",
      link: {
        href: "https://example.com/detail",
        target: "_blank",
        title: "대표 이미지"
      },
      caption: {
        captionId: "cap-1",
        targetId: "img-1",
        targetType: "image",
        text: "그림 1"
      }
    });
    expect(Object.isFrozen(model.metadata.link)).toBe(true);
    expect(Object.isFrozen(model.metadata.caption)).toBe(true);
  });

  it("shape/chart/diagram 계열은 object kind와 raw payload 한계를 남긴다", () => {
    const model = normalizeObjectModel(shapeBlock);

    expect(model).toMatchObject({
      objectType: "shapeBlock",
      objectKind: "shape",
      childBlockCount: 1,
      size: {
        width: { value: 80, unit: "px", raw: "80px" },
        height: { value: 40, unit: "px", raw: "40px" }
      },
      relationship: {
        objectId: "shape-1",
        relationshipIdCandidate: "object:shape-1",
        target: "shape-1",
        targetKind: "object-id",
        mediaKind: "shape"
      },
      attrs: {
        unknown: ["shapeType", "fillColor"]
      }
    });
    expect(model.unsupported).toEqual(
      expect.arrayContaining([
        "shape payload remains raw in v1",
        "object attr shapeType remains raw",
        "object attr fillColor remains raw"
      ])
    );
  });
});
