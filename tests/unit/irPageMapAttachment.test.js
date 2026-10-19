import { describe, expect, it } from "vitest";
import { attachPageMapToIR } from "../../app/LIB/ir/attachPageMapToIR";
import { fromProseMirrorDocToIR } from "../../app/LIB/ir/fromProseMirror";
import { buildPaginationInput } from "../../app/LIB/pagination/model/buildPaginationInput";
import { calculatePaginationPlan } from "../../app/LIB/pagination/layout/calculatePaginationPlan";
import {
  createEditorStateStub,
  createMeasurement,
  spikePageMetrics
} from "./fixtures/paginationSpikeFixtures";
import {
  pageMapListFixture,
  pageMapLongParagraphFixture,
  pageMapMergedCellTableFixture,
  pageMapTableFixture
} from "./fixtures/paginationPageMapFixtures";

const pageMapObjectFixture = {
  pmDoc: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "오브젝트 앞 문단" }]
      },
      {
        type: "image",
        attrs: {
          src: "https://example.com/object.png",
          objectId: "object-1",
          flowMode: "floating",
          anchorMode: "page"
        }
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "오브젝트 뒤 문단" }]
      }
    ]
  },
  topLevelPositions: [1, 20, 40],
  domModel: {
    blocks: [
      { pos: 1, type: "paragraph" },
      { pos: 20, type: "image" },
      { pos: 40, type: "paragraph" }
    ],
    measurements: [
      createMeasurement({
        pos: 1,
        blockPos: 1,
        offsetHeight: 200
      }),
      createMeasurement({
        pos: 20,
        blockPos: 20,
        blockType: "image",
        offsetHeight: 40
      }),
      createMeasurement({
        pos: 40,
        blockPos: 40,
        offsetHeight: 40
      })
    ]
  }
};

const buildIRWithPageMap = (fixture) => {
  const input = buildPaginationInput({
    editorState: createEditorStateStub(
      fixture.pmDoc,
      fixture.topLevelPositions
    ),
    pageMetrics: spikePageMetrics,
    domModel: fixture.domModel
  });
  const plan = calculatePaginationPlan(input);

  return {
    input,
    plan,
    ir: attachPageMapToIR(input.ir, plan.pageMap)
  };
};

describe("attachPageMapToIR", () => {
  it("문단 block에 PageMap 기반 readonly page metadata를 붙인다", () => {
    const { input, ir } = buildIRWithPageMap(pageMapLongParagraphFixture);
    const paragraph = ir.sections[0].blocks[1];

    expect(input.ir.sections[0].blocks[1]).not.toHaveProperty("pagination");
    expect(paragraph).toMatchObject({
      type: "paragraph",
      pagination: {
        source: "pagination-page-map",
        pageMapVersion: 1,
        blockIndex: 1,
        blockPos: 30,
        blockType: "paragraph",
        pageNumbers: [1, 2],
        startPage: 1,
        endPage: 2,
        pageCount: 2,
        spansPages: true,
        startsWithContinuation: true,
        endsWithContinuation: true,
        breakReasons: ["overflow"],
        segmentKinds: ["textLine"],
        segmentCount: 4
      }
    });
    expect(Object.isFrozen(paragraph.pagination)).toBe(true);
    expect(Object.isFrozen(paragraph.pagination.pageNumbers)).toBe(true);
  });

  it("list/table/object top-level block에 같은 metadata contract를 적용한다", () => {
    const listBlock = buildIRWithPageMap(pageMapListFixture).ir.sections[0]
      .blocks[1];
    const tableBlock = buildIRWithPageMap(pageMapTableFixture).ir.sections[0]
      .blocks[1];
    const mergedTableBlock = buildIRWithPageMap(pageMapMergedCellTableFixture)
      .ir.sections[0].blocks[1];
    const objectBlock = buildIRWithPageMap(pageMapObjectFixture).ir.sections[0]
      .blocks[1];

    expect(listBlock).toMatchObject({
      type: "list",
      pagination: {
        blockType: "bulletList",
        pageNumbers: [1, 2],
        spansPages: true,
        segmentKinds: ["listLine"]
      }
    });
    expect(tableBlock).toMatchObject({
      type: "table",
      pagination: {
        blockType: "table",
        pageNumbers: [1, 2],
        spansPages: true,
        breakReasons: ["tableRowKeptIntact"],
        segmentKinds: ["tableRow"]
      }
    });
    expect(mergedTableBlock).toMatchObject({
      type: "table",
      pagination: {
        blockType: "table",
        pageNumbers: [2],
        spansPages: false,
        hasMergedTableRows: true,
        hasTooTallTableRows: false
      }
    });
    expect(objectBlock).toMatchObject({
      type: "object",
      objectType: "image",
      pagination: {
        blockType: "image",
        pageNumbers: [2],
        startPage: 2,
        endPage: 2,
        spansPages: false,
        segmentKinds: ["block"]
      }
    });
  });

  it("PageMap이 없으면 기존 IR snapshot 참조를 그대로 반환한다", () => {
    const { input } = buildIRWithPageMap(pageMapLongParagraphFixture);

    expect(attachPageMapToIR(input.ir, null)).toBe(input.ir);
  });

  it("note body 뒤의 flow block을 원본 ProseMirror 인덱스로 연결한다", () => {
    const noteId = "note-v1-page-map";
    const ir = fromProseMirrorDocToIR({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "앞" },
            { type: "noteReference", attrs: { noteId, kind: "footnote" } }
          ]
        },
        {
          type: "noteBody",
          attrs: { noteId, kind: "footnote" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "각주" }] }]
        },
        { type: "paragraph", content: [{ type: "text", text: "뒤" }] }
      ]
    });
    const pageMap = {
      version: 1,
      pages: [
        {
          pageNumber: 2,
          startBlockPos: 40,
          endBlockPos: 40,
          segments: [{ blockPos: 40, kind: "block" }]
        }
      ],
      blockPageAssignments: [
        {
          blockIndex: 2,
          blockPos: 40,
          blockType: "paragraph",
          startPage: 2,
          endPage: 2,
          pageCount: 1,
          spansPages: false
        }
      ]
    };

    const attached = attachPageMapToIR(ir, pageMap);

    expect(attached.sections[0].blocks.map((block) => block.sourceBlockIndex)).toEqual([0, 2]);
    expect(attached.sections[0].blocks[0]).not.toHaveProperty("pagination");
    expect(attached.sections[0].blocks[1]).toMatchObject({
      type: "paragraph",
      pagination: {
        blockIndex: 2,
        blockPos: 40,
        pageNumbers: [2]
      }
    });
  });
});
