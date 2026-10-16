export const irWarningFixtureDocs = [
  {
    name: "toc-and-captions",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "목차" }]
        },
        { type: "tocItem", attrs: { targetId: "h-1" } },
        { type: "tocItem", attrs: { targetId: "h-2" } },
        { type: "tocItem", attrs: { targetId: "h-3" } },
        {
          type: "paragraph",
          content: [{ type: "text", text: "그림 목차" }]
        },
        {
          type: "captionTocItem",
          attrs: { targetId: "img-1", targetType: "image" }
        },
        {
          type: "captionTocItem",
          attrs: { targetId: "img-2", targetType: "image" }
        },
        {
          type: "image",
          attrs: { src: "https://example.com/1.png", objectId: "img-1" }
        },
        {
          type: "captionBlock",
          attrs: { targetId: "img-1", targetType: "image" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "그림 1" }]
            }
          ]
        },
        {
          type: "image",
          attrs: { src: "https://example.com/2.png", objectId: "img-2" }
        },
        {
          type: "captionBlock",
          attrs: { targetId: "img-2", targetType: "image" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "그림 2" }]
            }
          ]
        }
      ]
    }
  },
  {
    name: "math-and-columns",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "수식 " },
            { type: "inlineMath", attrs: { latex: "x+y" } },
            { type: "text", text: " 와 " },
            { type: "inlineMath", attrs: { latex: "z" } }
          ]
        },
        {
          type: "blockMath",
          attrs: { latex: "x^2 + y^2 = z^2" }
        },
        {
          type: "columnBlock",
          content: [
            {
              type: "column",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "왼쪽 컬럼" }]
                }
              ]
            },
            {
              type: "column",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "오른쪽 컬럼" }]
                }
              ]
            }
          ]
        },
        {
          type: "columnBlock",
          content: [
            {
              type: "column",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "컬럼 A" }]
                }
              ]
            },
            {
              type: "column",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "컬럼 B" }]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    name: "legacy-blocks-and-table-gap",
    doc: {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "인용문" }]
            }
          ]
        },
        {
          type: "codeBlock",
          attrs: { language: "js" },
          content: [{ type: "text", text: "const dockit = true;" }]
        },
        { type: "horizontalRule" },
        {
          type: "paragraph",
          attrs: { customSpacing: 12 },
          content: [
            {
              type: "text",
              text: "알 수 없는 마크",
              marks: [{ type: "mysteryMark", attrs: { tone: "odd" } }]
            }
          ]
        },
        {
          type: "table",
          attrs: {
            borderColor: "#111111",
            headerRowRepeat: true
          },
          content: [
            {
              type: "table_row",
              content: [
                {
                  type: "table_cell",
                  attrs: {
                    borderTopColor: "#000000",
                    borderRightColor: "#111111",
                    borderBottomColor: "#222222",
                    borderLeftColor: "#333333",
                    borderTopWidth: 1,
                    borderRightWidth: 2,
                    borderBottomWidth: 3,
                    borderLeftWidth: 4
                  },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "표 셀" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }
];
