const createPagination = (overrides = {}) =>
  Object.freeze({
    source: "pagination-page-map",
    pageMapVersion: 1,
    blockIndex: 0,
    blockPos: 1,
    blockType: "paragraph",
    pageNumbers: Object.freeze([1]),
    startPage: 1,
    endPage: 1,
    pageCount: 1,
    spansPages: false,
    startsWithContinuation: false,
    endsWithContinuation: false,
    breakReasons: Object.freeze([]),
    segmentKinds: Object.freeze(["block"]),
    segmentCount: 1,
    hasMergedTableRows: false,
    hasTooTallTableRows: false,
    ...overrides
  });

const baseMetadata = {
  extractedAt: "2026-04-27T00:00:00.000Z",
  extractorVersion: "test-readiness",
  source: {
    editor: "tiptap-prosemirror",
    mode: "readonly-snapshot"
  },
  warnings: []
};

const basePageSettings = {
  widthMm: 210,
  heightMm: 297,
  paddingTopMm: 20,
  paddingBottomMm: 20,
  paddingLeftMm: 25,
  paddingRightMm: 25,
  lineHeight: 1.5
};

const createDocument = (id, blocks) => ({
  type: "document",
  version: "ir-v1.1-draft",
  metadata: baseMetadata,
  sections: [
    {
      type: "section",
      id,
      breakType: "continuous",
      pageSettings: basePageSettings,
      blocks
    }
  ]
});

export const paragraphHeadingReadinessIR = createDocument(
  "paragraph-heading",
  [
    {
      type: "heading",
      pagination: createPagination({
        blockIndex: 0,
        blockPos: 1,
        blockType: "heading",
        pageNumbers: Object.freeze([1])
      }),
      attrs: {
        level: 1,
        headingId: "h-1",
        textAlign: "left",
        lineHeight: "1.4",
        indent: 0,
        indentLevel: 0,
        wordBreak: "keep-all"
      },
      keepWithNext: true,
      runs: [
        {
          type: "textRun",
          text: "Export readiness",
          marks: [{ type: "bold" }]
        }
      ]
    },
    {
      type: "paragraph",
      pagination: createPagination({
        blockIndex: 1,
        blockPos: 20,
        blockType: "paragraph",
        pageNumbers: Object.freeze([1, 2]),
        startPage: 1,
        endPage: 2,
        pageCount: 2,
        spansPages: true,
        startsWithContinuation: true,
        endsWithContinuation: true,
        breakReasons: Object.freeze(["overflow"]),
        segmentKinds: Object.freeze(["textLine"]),
        segmentCount: 5
      }),
      attrs: {
        textAlign: "justify",
        lineHeight: "1.5",
        fontSize: 12,
        indent: 18,
        indentLevel: 1,
        wordBreak: "keep-all"
      },
      widows: 2,
      orphans: 2,
      runs: [
        {
          type: "textRun",
          text: "A long paragraph with an inline tag.",
          marks: [{ type: "inlineTag", attrs: { color: "#ffcc00" } }]
        }
      ]
    }
  ]
);

export const listTableReadinessIR = createDocument("list-table", [
  {
    type: "list",
    pagination: createPagination({
      blockIndex: 0,
      blockPos: 1,
      blockType: "orderedList",
      pageNumbers: Object.freeze([1, 2]),
      startPage: 1,
      endPage: 2,
      pageCount: 2,
      spansPages: true,
      startsWithContinuation: true,
      endsWithContinuation: true,
      breakReasons: Object.freeze(["overflow"]),
      segmentKinds: Object.freeze(["listLine"]),
      segmentCount: 4
    }),
    listType: "ordered",
    attrs: {
      start: 3,
      tight: false
    },
    items: [
      {
        type: "listItem",
        attrs: {
          value: 3
        },
        blocks: [
          {
            type: "paragraph",
            attrs: {},
            runs: [
              {
                type: "textRun",
                text: "Nested item",
                marks: []
              }
            ]
          }
        ]
      }
    ]
  },
  {
    type: "table",
    pagination: createPagination({
      blockIndex: 1,
      blockPos: 40,
      blockType: "table",
      pageNumbers: Object.freeze([2]),
      startPage: 2,
      endPage: 2,
      spansPages: false,
      hasMergedTableRows: true,
      breakReasons: Object.freeze(["tableMergedCellGroupKeptIntact"]),
      segmentKinds: Object.freeze(["tableRow"]),
      segmentCount: 2
    }),
    attrs: {
      borderColor: "#333333",
      borderStyle: "solid",
      borderWidth: 1,
      cellPaddingTop: 4,
      cellPaddingBottom: 4,
      cellPaddingLeft: 6,
      cellPaddingRight: 6,
      indent: 0,
      indentLevel: 0
    },
    headerRowRepeat: true,
    allowRowSplit: false,
    rows: [
      {
        type: "tableRow",
        attrs: {
          height: 24
        },
        cells: [
          {
            type: "tableCell",
            role: "cell",
            attrs: {
              colspan: 1,
              rowspan: 2,
              colwidth: [120],
              verticalAlign: "middle",
              backgroundColor: "#f5f5f5",
              borderColor: "#333333",
              borderStyle: "solid",
              borderWidth: 1,
              wordBreak: "keep-all"
            },
            blocks: [
              {
                type: "paragraph",
                attrs: {},
                runs: [
                  {
                    type: "textRun",
                    text: "Merged cell",
                    marks: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
]);

export const objectUnsupportedReadinessIR = createDocument(
  "object-unsupported",
  [
    {
      type: "object",
      pagination: createPagination({
        blockIndex: 0,
        blockPos: 1,
        blockType: "image",
        pageNumbers: Object.freeze([1]),
        segmentKinds: Object.freeze(["block"])
      }),
      objectType: "image",
      flowMode: "floating",
      anchorMode: "page",
      attrs: {
        src: "https://example.com/image.png",
        objectId: "img-1",
        width: 320,
        height: 180,
        x: 20,
        y: 40
      },
      children: []
    },
    {
      type: "unsupported",
      nodeType: "columnBlock",
      attrs: {
        columnCount: 2
      },
      raw: {
        type: "columnBlock"
      }
    }
  ]
);

export const irExportReadinessFixtures = [
  paragraphHeadingReadinessIR,
  listTableReadinessIR,
  objectUnsupportedReadinessIR
];
