import { createMeasurement } from "./paginationSpikeFixtures";

const createInlineTagGroup = (overrides = {}) => ({
  inlineTagId: "tag-a",
  inlineTagStartPos: 12,
  inlineTagEndPos: 20,
  inlineTagTextLength: 8,
  inlineTagLineCount: 2,
  inlineTagLineIndex: 0,
  inlineTagIsFirstLine: false,
  inlineTagIsLastLine: false,
  ...overrides
});

const createTableRow = (cells) => ({
  type: "table_row",
  content: cells.map((cell) => ({
    type: cell.header ? "table_header" : "table_cell",
    attrs: {
      colspan: cell.colspan || 1,
      rowspan: cell.rowspan || 1
    },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: cell.text }]
      }
    ]
  }))
});

const emptySummary = {
  mergedRowSegments: [],
  tooTallSegments: []
};

export const pageMapLongParagraphFixture = {
  name: "긴 문단",
  pmDoc: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "앞 문단으로 첫 페이지를 채운다." }]
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "긴 문단은 textLine 단위로 다음 페이지에 이어진다."
          }
        ]
      }
    ]
  },
  topLevelPositions: [1, 30],
  domModel: {
    blocks: [
      { pos: 1, type: "paragraph" },
      { pos: 30, type: "paragraph" }
    ],
    measurements: [
      createMeasurement({
        pos: 1,
        blockPos: 1,
        offsetHeight: 170
      }),
      createMeasurement({
        pos: 31,
        blockPos: 30,
        kind: "textLine",
        offsetHeight: 24,
        lineIndex: 0,
        lineCount: 4,
        renderWidth: 230
      }),
      createMeasurement({
        pos: 35,
        blockPos: 30,
        kind: "textLine",
        offsetHeight: 24,
        lineIndex: 1,
        lineCount: 4,
        renderWidth: 220
      }),
      createMeasurement({
        pos: 39,
        blockPos: 30,
        kind: "textLine",
        offsetHeight: 24,
        lineIndex: 2,
        lineCount: 4,
        renderWidth: 210
      }),
      createMeasurement({
        pos: 43,
        blockPos: 30,
        kind: "textLine",
        offsetHeight: 24,
        lineIndex: 3,
        lineCount: 4,
        renderWidth: 180
      })
    ]
  },
  expectedPageMap: {
    totalPages: 2,
    pageBreaks: [{ pos: 39, kind: "textLine", reason: "overflow" }],
    pages: [
      {
        pageNumber: 1,
        startPos: 1,
        endPos: 35,
        startBlockPos: 1,
        endBlockPos: 30,
        breakReason: "overflow",
        startsWithContinuation: false,
        endsWithContinuation: true,
        segmentKinds: ["block", "textLine", "textLine"],
        ...emptySummary
      },
      {
        pageNumber: 2,
        startPos: 39,
        endPos: 43,
        startBlockPos: 30,
        endBlockPos: 30,
        breakReason: null,
        startsWithContinuation: true,
        endsWithContinuation: false,
        segmentKinds: ["textLine", "textLine"],
        ...emptySummary
      }
    ],
    blockPageAssignments: [
      {
        blockPos: 1,
        startPage: 1,
        endPage: 1,
        pageCount: 1,
        spansPages: false
      },
      {
        blockPos: 30,
        startPage: 1,
        endPage: 2,
        pageCount: 2,
        spansPages: true
      }
    ]
  }
};

export const pageMapListFixture = {
  name: "리스트",
  pmDoc: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "리스트 앞 문단" }]
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "여러 줄로 이어지는 리스트 아이템"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  topLevelPositions: [1, 20],
  domModel: {
    blocks: [
      { pos: 1, type: "paragraph" },
      { pos: 20, type: "bulletList" }
    ],
    measurements: [
      createMeasurement({
        pos: 1,
        blockPos: 1,
        offsetHeight: 160
      }),
      createMeasurement({
        pos: 21,
        blockPos: 20,
        blockType: "bulletList",
        kind: "listLine",
        offsetHeight: 30,
        listItemPos: 21,
        listItemIndex: 0,
        listItemOrdinal: 1,
        listLineIndex: 0,
        listLineCount: 3,
        listLineIsFirstOfItem: true,
        listLineIsContinuation: false,
        listMarkerText: "•",
        listMarkerKind: "bullet",
        renderWidth: 230
      }),
      createMeasurement({
        pos: 24,
        blockPos: 20,
        blockType: "bulletList",
        kind: "listLine",
        offsetHeight: 30,
        listItemPos: 21,
        listItemIndex: 0,
        listItemOrdinal: 1,
        listLineIndex: 1,
        listLineCount: 3,
        listLineIsFirstOfItem: false,
        listLineIsContinuation: true,
        listMarkerText: "",
        listMarkerKind: "bullet",
        renderWidth: 220
      }),
      createMeasurement({
        pos: 27,
        blockPos: 20,
        blockType: "bulletList",
        kind: "listLine",
        offsetHeight: 30,
        listItemPos: 21,
        listItemIndex: 0,
        listItemOrdinal: 1,
        listLineIndex: 2,
        listLineCount: 3,
        listLineIsFirstOfItem: false,
        listLineIsContinuation: true,
        listMarkerText: "",
        listMarkerKind: "bullet",
        renderWidth: 190
      })
    ]
  },
  expectedPageMap: {
    totalPages: 2,
    pageBreaks: [{ pos: 27, kind: "listLine", reason: "overflow" }],
    pages: [
      {
        pageNumber: 1,
        startPos: 1,
        endPos: 24,
        startBlockPos: 1,
        endBlockPos: 20,
        breakReason: "overflow",
        startsWithContinuation: false,
        endsWithContinuation: true,
        segmentKinds: ["block", "listLine", "listLine"],
        ...emptySummary
      },
      {
        pageNumber: 2,
        startPos: 27,
        endPos: 27,
        startBlockPos: 20,
        endBlockPos: 20,
        breakReason: null,
        startsWithContinuation: true,
        endsWithContinuation: false,
        segmentKinds: ["listLine"],
        ...emptySummary
      }
    ],
    blockPageAssignments: [
      {
        blockPos: 1,
        startPage: 1,
        endPage: 1,
        pageCount: 1,
        spansPages: false
      },
      {
        blockPos: 20,
        startPage: 1,
        endPage: 2,
        pageCount: 2,
        spansPages: true
      }
    ]
  }
};

export const pageMapInlineTagFixture = {
  name: "인라인 태그",
  pmDoc: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "태그 앞 텍스트 " },
          {
            type: "text",
            text: "태그 텍스트",
            marks: [{ type: "inlineTag", attrs: { color: "#ffcc00" } }]
          },
          { type: "text", text: " 태그 뒤 텍스트" }
        ]
      }
    ]
  },
  topLevelPositions: [1],
  domModel: {
    blocks: [{ pos: 1, type: "paragraph" }],
    measurements: [
      createMeasurement({
        pos: 2,
        blockPos: 1,
        kind: "textLine",
        offsetHeight: 190,
        lineIndex: 0,
        lineCount: 4,
        renderWidth: 240
      }),
      createMeasurement({
        pos: 12,
        blockPos: 1,
        kind: "textLine",
        offsetHeight: 24,
        lineIndex: 1,
        lineCount: 4,
        inlineTagGroups: [
          createInlineTagGroup({
            inlineTagLineIndex: 0,
            inlineTagIsFirstLine: true,
            inlineTagIsLastLine: false
          })
        ],
        renderWidth: 210
      }),
      createMeasurement({
        pos: 16,
        blockPos: 1,
        kind: "textLine",
        offsetHeight: 24,
        lineIndex: 2,
        lineCount: 4,
        inlineTagGroups: [
          createInlineTagGroup({
            inlineTagLineIndex: 1,
            inlineTagIsFirstLine: false,
            inlineTagIsLastLine: true
          })
        ],
        renderWidth: 205
      }),
      createMeasurement({
        pos: 24,
        blockPos: 1,
        kind: "textLine",
        offsetHeight: 30,
        lineIndex: 3,
        lineCount: 4,
        renderWidth: 180
      })
    ]
  },
  expectedPageMap: {
    totalPages: 2,
    pageBreaks: [
      { pos: 12, kind: "textLine", reason: "inlineTagKeptIntact" }
    ],
    pages: [
      {
        pageNumber: 1,
        startPos: 2,
        endPos: 2,
        startBlockPos: 1,
        endBlockPos: 1,
        breakReason: "inlineTagKeptIntact",
        startsWithContinuation: false,
        endsWithContinuation: true,
        segmentKinds: ["textLine"],
        ...emptySummary
      },
      {
        pageNumber: 2,
        startPos: 12,
        endPos: 24,
        startBlockPos: 1,
        endBlockPos: 1,
        breakReason: null,
        startsWithContinuation: true,
        endsWithContinuation: false,
        segmentKinds: ["textLine", "textLine", "textLine"],
        ...emptySummary
      }
    ],
    blockPageAssignments: [
      {
        blockPos: 1,
        startPage: 1,
        endPage: 2,
        pageCount: 2,
        spansPages: true
      }
    ]
  }
};

export const pageMapTableFixture = {
  name: "일반 표",
  pmDoc: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "표 앞 문단" }]
      },
      {
        type: "table",
        attrs: {
          allowRowSplit: false
        },
        content: [
          createTableRow([{ text: "A1" }, { text: "B1" }]),
          createTableRow([{ text: "A2" }, { text: "B2" }]),
          createTableRow([{ text: "A3" }, { text: "B3" }])
        ]
      }
    ]
  },
  topLevelPositions: [1, 30],
  domModel: {
    blocks: [
      { pos: 1, type: "paragraph" },
      { pos: 30, type: "table", tableColSpan: 2 }
    ],
    measurements: [
      createMeasurement({
        pos: 1,
        blockPos: 1,
        offsetHeight: 60
      }),
      createMeasurement({
        pos: 31,
        blockPos: 30,
        blockType: "table",
        kind: "tableRow",
        offsetHeight: 70,
        tableColSpan: 2,
        tableRowIndex: 0
      }),
      createMeasurement({
        pos: 39,
        blockPos: 30,
        blockType: "table",
        kind: "tableRow",
        offsetHeight: 80,
        tableColSpan: 2,
        tableRowIndex: 1
      }),
      createMeasurement({
        pos: 47,
        blockPos: 30,
        blockType: "table",
        kind: "tableRow",
        offsetHeight: 80,
        tableColSpan: 2,
        tableRowIndex: 2
      })
    ]
  },
  expectedPageMap: {
    totalPages: 2,
    pageBreaks: [
      { pos: 47, kind: "tableRow", reason: "tableRowKeptIntact" }
    ],
    pages: [
      {
        pageNumber: 1,
        startPos: 1,
        endPos: 39,
        startBlockPos: 1,
        endBlockPos: 30,
        breakReason: "tableRowKeptIntact",
        startsWithContinuation: false,
        endsWithContinuation: true,
        segmentKinds: ["block", "tableRow", "tableRow"],
        ...emptySummary
      },
      {
        pageNumber: 2,
        startPos: 47,
        endPos: 47,
        startBlockPos: 30,
        endBlockPos: 30,
        breakReason: null,
        startsWithContinuation: true,
        endsWithContinuation: false,
        segmentKinds: ["tableRow"],
        ...emptySummary
      }
    ],
    blockPageAssignments: [
      {
        blockPos: 1,
        startPage: 1,
        endPage: 1,
        pageCount: 1,
        spansPages: false
      },
      {
        blockPos: 30,
        startPage: 1,
        endPage: 2,
        pageCount: 2,
        spansPages: true
      }
    ]
  }
};

export const pageMapMergedCellTableFixture = {
  name: "병합 셀 표",
  pmDoc: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "병합 셀 앞 문단" }]
      },
      {
        type: "table",
        attrs: {
          allowRowSplit: true
        },
        content: [
          createTableRow([
            { text: "rowspan 셀", rowspan: 2 },
            { text: "오른쪽 셀 1" }
          ]),
          createTableRow([{ text: "오른쪽 셀 2" }])
        ]
      }
    ]
  },
  topLevelPositions: [1, 30],
  domModel: {
    blocks: [
      { pos: 1, type: "paragraph" },
      { pos: 30, type: "table", tableColSpan: 2 }
    ],
    measurements: [
      createMeasurement({
        pos: 1,
        blockPos: 1,
        offsetHeight: 50
      }),
      createMeasurement({
        pos: 31,
        blockPos: 30,
        blockType: "table",
        kind: "tableRow",
        offsetHeight: 110,
        tableColSpan: 2,
        tableRowIndex: 0
      }),
      createMeasurement({
        pos: 39,
        blockPos: 30,
        blockType: "table",
        kind: "tableRow",
        offsetHeight: 90,
        tableColSpan: 2,
        tableRowIndex: 1
      })
    ]
  },
  expectedPageMap: {
    totalPages: 2,
    pageBreaks: [
      { pos: 30, kind: "block", reason: "tableMergedCellGroupKeptIntact" }
    ],
    pages: [
      {
        pageNumber: 1,
        startPos: 1,
        endPos: 1,
        startBlockPos: 1,
        endBlockPos: 1,
        breakReason: "tableMergedCellGroupKeptIntact",
        startsWithContinuation: false,
        endsWithContinuation: false,
        segmentKinds: ["block"],
        ...emptySummary
      },
      {
        pageNumber: 2,
        startPos: 31,
        endPos: 39,
        startBlockPos: 30,
        endBlockPos: 30,
        breakReason: null,
        startsWithContinuation: false,
        endsWithContinuation: false,
        segmentKinds: ["tableRow", "tableRow"],
        mergedRowSegments: [
          {
            pos: 31,
            tableRowGroupId: "30:0-1",
            tableRowGroupStartIndex: 0,
            tableRowGroupEndIndex: 1
          },
          {
            pos: 39,
            tableRowGroupId: "30:0-1",
            tableRowGroupStartIndex: 0,
            tableRowGroupEndIndex: 1
          }
        ],
        tooTallSegments: []
      }
    ],
    blockPageAssignments: [
      {
        blockPos: 1,
        startPage: 1,
        endPage: 1,
        pageCount: 1,
        spansPages: false
      },
      {
        blockPos: 30,
        startPage: 2,
        endPage: 2,
        pageCount: 1,
        spansPages: false
      }
    ]
  }
};

export const pageMapOversizedTableRowFixture = {
  name: "과대 표 행",
  pmDoc: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "과대 행 앞 문단" }]
      },
      {
        type: "table",
        attrs: {
          allowRowSplit: false
        },
        content: [createTableRow([{ text: "페이지보다 큰 행" }])]
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "과대 행 뒤 문단" }]
      }
    ]
  },
  topLevelPositions: [1, 30, 70],
  domModel: {
    blocks: [
      { pos: 1, type: "paragraph" },
      { pos: 30, type: "table", tableColSpan: 1 },
      { pos: 70, type: "paragraph" }
    ],
    measurements: [
      createMeasurement({
        pos: 1,
        blockPos: 1,
        offsetHeight: 80
      }),
      createMeasurement({
        pos: 31,
        blockPos: 30,
        blockType: "table",
        kind: "tableRow",
        offsetHeight: 280,
        tableColSpan: 1,
        tableRowIndex: 0
      }),
      createMeasurement({
        pos: 70,
        blockPos: 70,
        offsetHeight: 30
      })
    ]
  },
  expectedPageMap: {
    totalPages: 3,
    pageBreaks: [
      { pos: 30, kind: "block", reason: "tableRowTooTall" },
      { pos: 70, kind: "block", reason: "overflow" }
    ],
    pages: [
      {
        pageNumber: 1,
        startPos: 1,
        endPos: 1,
        startBlockPos: 1,
        endBlockPos: 1,
        breakReason: "tableRowTooTall",
        startsWithContinuation: false,
        endsWithContinuation: false,
        segmentKinds: ["block"],
        ...emptySummary
      },
      {
        pageNumber: 2,
        startPos: 31,
        endPos: 31,
        startBlockPos: 30,
        endBlockPos: 30,
        breakReason: "overflow",
        startsWithContinuation: false,
        endsWithContinuation: false,
        segmentKinds: ["tableRow"],
        mergedRowSegments: [],
        tooTallSegments: [
          {
            pos: 31,
            tableRowTooTallKind: "row",
            tableRowTooTallGroupId: null
          }
        ]
      },
      {
        pageNumber: 3,
        startPos: 70,
        endPos: 70,
        startBlockPos: 70,
        endBlockPos: 70,
        breakReason: null,
        startsWithContinuation: false,
        endsWithContinuation: false,
        segmentKinds: ["block"],
        ...emptySummary
      }
    ],
    blockPageAssignments: [
      {
        blockPos: 1,
        startPage: 1,
        endPage: 1,
        pageCount: 1,
        spansPages: false
      },
      {
        blockPos: 30,
        startPage: 2,
        endPage: 2,
        pageCount: 1,
        spansPages: false
      },
      {
        blockPos: 70,
        startPage: 3,
        endPage: 3,
        pageCount: 1,
        spansPages: false
      }
    ]
  }
};

export const pageMapRegressionFixtures = [
  pageMapLongParagraphFixture,
  pageMapListFixture,
  pageMapInlineTagFixture,
  pageMapTableFixture,
  pageMapMergedCellTableFixture,
  pageMapOversizedTableRowFixture
];
