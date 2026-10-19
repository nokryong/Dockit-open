import { t as uiText } from "../i18n";
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
    get "title"() { return uiText("문서 작성"); },
    "iconKey": "filePaper",
    "defaultExpanded": true,
    "items": [
      {
        "iconKey": "mathSymbols",
        get "title"() { return uiText("특수문자"); },
        "id": "specialChar"
      },
      {
        "iconKey": "hanja",
        get "title"() { return uiText("한자"); },
        "id": "hanjaPanel"
      },
      {
        "iconKey": "math",
        "title": "LATEX",
        "id": "latex"
      },
      {
        "iconKey": "listNumbers",
        get "title"() { return uiText("목차"); },
        "id": "index"
      },
      {
        "iconKey": "style",
        get "title"() { return uiText("스타일"); },
        "id": "stylePreset"
      },
      {
        "iconKey": "command",
        get "title"() { return uiText("단축키"); },
        "id": "shortcut"
      },
      {
        "iconKey": "chartDots",
        get "title"() { return uiText("차트"); },
        "id": "madeChart"
      },
      {
        "iconKey": "edit",
        get "title"() { return uiText("편집기"); },
        "id": "objectEditor"
      }
    ]
  },
  {
    "id": "tools",
    get "title"() { return uiText("도구"); },
    "iconKey": "tool",
    "defaultExpanded": false,
    "items": [
      {
        "iconKey": "spreadsheet",
        get "title"() { return uiText("시트"); },
        "id": "sheetPanel"
      },
      {
        "iconKey": "note",
        get "title"() { return uiText("메모장"); },
        "id": "memo"
      },
      {
        "iconKey": "calculator",
        get "title"() { return uiText("계산기"); },
        "id": "calculator"
      },
      {
        "iconKey": "timer",
        get "title"() { return uiText("타이머"); },
        "id": "timer"
      }
    ]
  }
];
