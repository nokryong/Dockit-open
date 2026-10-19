import { mm2px } from "../../../app/LIB/utils/unitUtils";

export const spikePageMetrics = {
  width: mm2px(120),
  pageHeightPx: mm2px(70),
  padding: {
    top: mm2px(5),
    bottom: mm2px(5),
    left: mm2px(10),
    right: mm2px(10)
  },
  lineHeight: 1.5
};

const createTopLevelNodeStub = (node, nodeSize = 10) => ({
  type: {
    name: node.type
  },
  attrs: node.attrs || {},
  nodeSize
});

export const createEditorStateStub = (pmDoc, topLevelPositions) => ({
  doc: {
    forEach(callback) {
      pmDoc.content.forEach((node, index) => {
        callback(
          createTopLevelNodeStub(node, node.nodeSize || 10),
          topLevelPositions[index]
        );
      });
    },
    toJSON() {
      return pmDoc;
    }
  }
});

export const createMeasurement = (overrides = {}) => ({
  pos: 1,
  blockPos: 1,
  blockType: "paragraph",
  offsetHeight: 40,
  marginTop: 0,
  marginBottom: 0,
  extraLeft: 0,
  extraRight: 0,
  kind: "block",
  ...overrides
});

export const pageBreakBeforeFixture = {
  pmDoc: {
    type: "doc",
    attrs: {
      sectionBreakType: "nextPage"
    },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "첫 문단" }]
      },
      {
        type: "heading",
        attrs: {
          level: 2,
          pageBreakBefore: true
        },
        content: [{ type: "text", text: "새 페이지 제목" }]
      }
    ]
  },
  topLevelPositions: [1, 20],
  domModel: {
    blocks: [
      { pos: 1, type: "paragraph" },
      { pos: 20, type: "heading" }
    ],
    measurements: [
      createMeasurement({
        pos: 1,
        blockPos: 1,
        offsetHeight: 110
      }),
      createMeasurement({
        pos: 20,
        blockPos: 20,
        blockType: "heading",
        offsetHeight: 28
      })
    ]
  }
};

export const keepWithNextFixture = {
  pmDoc: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "앞 문단" }]
      },
      {
        type: "heading",
        attrs: {
          level: 2,
          keepWithNext: true
        },
        content: [{ type: "text", text: "묶어야 하는 제목" }]
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "다음 문단" }]
      }
    ]
  },
  topLevelPositions: [1, 20, 40],
  domModel: {
    blocks: [
      { pos: 1, type: "paragraph" },
      { pos: 20, type: "heading" },
      { pos: 40, type: "paragraph" }
    ],
    measurements: [
      createMeasurement({
        pos: 1,
        blockPos: 1,
        offsetHeight: 145
      }),
      createMeasurement({
        pos: 20,
        blockPos: 20,
        blockType: "heading",
        offsetHeight: 30
      }),
      createMeasurement({
        pos: 40,
        blockPos: 40,
        offsetHeight: 72
      })
    ]
  }
};

export const paragraphBoundaryReflowFixture = {
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
            text: "두 번째 문단은 줄 단위로 나뉘며 다음 페이지에서도 이어진다."
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
        offsetHeight: 185
      }),
      createMeasurement({
        pos: 31,
        blockPos: 30,
        kind: "textLine",
        offsetHeight: 24,
        lineIndex: 0,
        lineCount: 3,
        renderWidth: 220
      }),
      createMeasurement({
        pos: 35,
        blockPos: 30,
        kind: "textLine",
        offsetHeight: 24,
        lineIndex: 1,
        lineCount: 3,
        renderWidth: 210
      }),
      createMeasurement({
        pos: 39,
        blockPos: 30,
        kind: "textLine",
        offsetHeight: 24,
        lineIndex: 2,
        lineCount: 3,
        renderWidth: 180
      })
    ]
  }
};

export const listItemSplitFixture = {
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
                    text: "여러 줄로 분할되어야 하는 리스트 아이템"
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
        offsetHeight: 170
      }),
      createMeasurement({
        pos: 21,
        blockPos: 20,
        blockType: "bulletList",
        kind: "listLine",
        offsetHeight: 24,
        listItemIndex: 0,
        listLineIndex: 0,
        listLineCount: 3,
        renderWidth: 230
      }),
      createMeasurement({
        pos: 24,
        blockPos: 20,
        blockType: "bulletList",
        kind: "listLine",
        offsetHeight: 24,
        listItemIndex: 0,
        listLineIndex: 1,
        listLineCount: 3,
        renderWidth: 215
      }),
      createMeasurement({
        pos: 27,
        blockPos: 20,
        blockType: "bulletList",
        kind: "listLine",
        offsetHeight: 24,
        listItemIndex: 0,
        listLineIndex: 2,
        listLineCount: 3,
        renderWidth: 160
      })
    ]
  }
};

const repeatedHeaderHtml =
  '<table class="tiptap-table-header-repeat-table"><tbody><tr><th>헤더</th></tr></tbody></table>';

export const tableHeaderRepeatFixture = {
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
          headerRowRepeat: true,
          allowRowSplit: false
        },
        content: [
          {
            type: "table_row",
            content: [
              {
                type: "table_header",
                attrs: { colspan: 1, rowspan: 1 },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "헤더" }]
                  }
                ]
              }
            ]
          },
          {
            type: "table_row",
            content: [
              {
                type: "table_cell",
                attrs: { colspan: 1, rowspan: 1 },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "본문 1" }]
                  }
                ]
              }
            ]
          },
          {
            type: "table_row",
            content: [
              {
                type: "table_cell",
                attrs: { colspan: 1, rowspan: 1 },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "본문 2" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  topLevelPositions: [1, 30],
  domModel: {
    blocks: [
      { pos: 1, type: "paragraph" },
      {
        pos: 30,
        type: "table",
        tableColSpan: 1,
        repeatHeaderHtml: repeatedHeaderHtml,
        repeatHeaderHeight: 30,
        tableHeaderRowCount: 1
      }
    ],
    measurements: [
      createMeasurement({
        pos: 1,
        blockPos: 1,
        offsetHeight: 40
      }),
      createMeasurement({
        pos: 31,
        blockPos: 30,
        blockType: "table",
        kind: "tableRow",
        offsetHeight: 30,
        tableColSpan: 1,
        tableRowIndex: 0,
        tableHeaderRowCount: 1,
        repeatHeaderHeight: 30,
        repeatHeaderHtml: repeatedHeaderHtml
      }),
      createMeasurement({
        pos: 35,
        blockPos: 30,
        blockType: "table",
        kind: "tableRow",
        offsetHeight: 80,
        tableColSpan: 1,
        tableRowIndex: 1,
        tableHeaderRowCount: 1,
        repeatHeaderHeight: 30,
        repeatHeaderHtml: repeatedHeaderHtml
      }),
      createMeasurement({
        pos: 39,
        blockPos: 30,
        blockType: "table",
        kind: "tableRow",
        offsetHeight: 90,
        tableColSpan: 1,
        tableRowIndex: 2,
        tableHeaderRowCount: 1,
        repeatHeaderHeight: 30,
        repeatHeaderHtml: repeatedHeaderHtml
      })
    ]
  }
};

export const tableAllowRowSplitFixture = {
  ...tableHeaderRepeatFixture,
  pmDoc: {
    ...tableHeaderRepeatFixture.pmDoc,
    content: [
      tableHeaderRepeatFixture.pmDoc.content[0],
      {
        ...tableHeaderRepeatFixture.pmDoc.content[1],
        attrs: {
          headerRowRepeat: true,
          allowRowSplit: true
        }
      }
    ]
  }
};

export const mergedTableRowGroupFixture = {
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
          {
            type: "table_row",
            content: [
              {
                type: "table_cell",
                attrs: { colspan: 1, rowspan: 2 },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "rowspan 셀" }]
                  }
                ]
              },
              {
                type: "table_cell",
                attrs: { colspan: 1, rowspan: 1 },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "오른쪽 셀 1" }]
                  }
                ]
              }
            ]
          },
          {
            type: "table_row",
            content: [
              {
                type: "table_cell",
                attrs: { colspan: 1, rowspan: 1 },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "오른쪽 셀 2" }]
                  }
                ]
              }
            ]
          }
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
  }
};
