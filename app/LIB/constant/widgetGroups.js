export const WIDGET_DRAWER_GROUPS = [
  {
    "id": "ai",
    "title": "AI",
    "iconKey": "aiGenerate",
    "defaultExpanded": true,
    "items": [
      {
        "iconKey": "aiChat",
        "title": "ChatGPT",
        "id": "aiChat"
      }
    ]
  },
  {
    "id": "writing",
    "title": "문서 작성",
    "iconKey": "filePaper",
    "defaultExpanded": true,
    "items": [
      {
        "iconKey": "mathSymbols",
        "title": "특수문자",
        "id": "specialChar"
      },
      {
        "iconKey": "hanja",
        "title": "한자",
        "id": "hanjaPanel"
      },
      {
        "iconKey": "math",
        "title": "LATEX",
        "id": "latex"
      },
      {
        "iconKey": "listNumbers",
        "title": "목차",
        "id": "index"
      },
      {
        "iconKey": "style",
        "title": "스타일",
        "id": "stylePreset"
      },
      {
        "iconKey": "command",
        "title": "단축키",
        "id": "shortcut"
      },
      {
        "iconKey": "chartDots",
        "title": "차트",
        "id": "madeChart"
      },
      {
        "iconKey": "edit",
        "title": "편집기",
        "id": "objectEditor"
      }
    ]
  },
  {
    "id": "tools",
    "title": "도구",
    "iconKey": "tool",
    "defaultExpanded": false,
    "items": [
      {
        "iconKey": "spreadsheet",
        "title": "시트",
        "id": "sheetPanel"
      },
      {
        "iconKey": "note",
        "title": "메모장",
        "id": "memo"
      },
      {
        "iconKey": "calculator",
        "title": "계산기",
        "id": "calculator"
      },
      {
        "iconKey": "timer",
        "title": "타이머",
        "id": "timer"
      }
    ]
  }
];
