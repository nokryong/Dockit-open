import dynamic from "@/desktop/dynamic";

const loadWidget = (importer) =>
  dynamic(importer, {
    ssr: false,
    loading: () => null
  });

export const widgets = {
  aiChat: loadWidget(() => import("../components/panel/ChatGPTWidget")),
  objectEditor: loadWidget(() => import("../components/panel/ObjectEditor")),
  calculator: loadWidget(() => import("../components/panel/Calculator")),
  memo: loadWidget(() => import("../components/panel/Memo")),
  specialChar: loadWidget(() => import("../components/panel/SpecialChar")),
  stylePreset: loadWidget(() => import("../components/panel/StylePreset")),
  madeChart: loadWidget(() => import("../components/panel/ChartPanel")),
  index: loadWidget(() => import("../components/panel/TableOfContentsPanel")),
  timer: loadWidget(() => import("../components/panel/Timer")),
  latex: loadWidget(() => import("../components/panel/LatexPanel")),
  findAndReplace: loadWidget(
    () => import("../components/panel/FindAndReplace")
  ),
  shortcut: loadWidget(() => import("../components/panel/Shortcut")),
  hanjaPanel: loadWidget(() => import("../components/panel/HanjaPanel")),
  sheetPanel: loadWidget(() => import("../components/panel/SheetPanel")),
  searchDoc: loadWidget(
    () => import("../components/panel/DefaultPanel/SearchDoc")
  ),
};
