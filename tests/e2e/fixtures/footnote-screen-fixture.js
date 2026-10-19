import { Editor, Node } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Link from "@tiptap/extension-link";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import NoteReference from "../../../app/LIB/extensions/NoteReference";
import NoteBody from "../../../app/LIB/extensions/NoteBody";
import { PaginationExtension } from "../../../app/LIB/extensions/PaginationExtension";
import { PaginationSemanticsExtension } from "../../../app/LIB/extensions/PaginationSemanticsExtension";
import { buildPaginationPageSegmentModel } from "../../../app/LIB/pagination/render/buildPaginationPageSegmentModel";
import {
  focusCanonicalFootnoteBody,
  focusFootnoteContinuationAtPoint,
  mountCanonicalFootnoteBody,
  mountFootnoteProjectionClone
} from "../../../app/LIB/pagination/render/mountFootnoteProjectionClone";
import "../../../app/LIB/css/tiptap.css";
import "../../../app/LIB/css/print-mode.css";

const NOTE_ID = "note-v1-browser-screen";
const CustomDocument = Document.extend({
  content: "(block | noteBody)+"
});
const FixtureChartBlock = Node.create({
  name: "chartBlock",
  group: "block",
  atom: true,
  parseHTML() {
    return [{ tag: 'figure[data-chart-block="fixture"]' }];
  },
  renderHTML() {
    return [
      "figure",
      {
        class: "fixture-chart",
        "data-chart-block": "fixture",
        role: "img",
        "aria-label": "분기 매출 차트"
      },
      ["figcaption", { class: "fixture-chart-title" }, "N4B2 분기 매출 차트"],
      [
        "div",
        { class: "fixture-chart-bars", "aria-hidden": "true" },
        ["span", { style: "height: 16px" }],
        ["span", { style: "height: 27px" }],
        ["span", { style: "height: 34px" }]
      ]
    ];
  }
});
const pages = document.querySelector("#pages");
const editorFlow = document.querySelector("#editor-flow");
const editorHost = document.querySelector("#editor");
const shellLayer = document.querySelector("#page-shells");
const status = document.querySelector("#fixture-status");
const projectionCleanups = [];
let editor = null;
let payload = null;
let model = null;
let updateVersion = 0;

window.__consoleErrors = [];
window.addEventListener("error", (event) => {
  window.__consoleErrors.push(event.error?.message || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  window.__consoleErrors.push(String(event.reason?.message || event.reason));
});

editorFlow.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  if (focusFootnoteContinuationAtPoint({
    editor,
    root: pages,
    clientX: event.clientX,
    clientY: event.clientY
  })) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

const pageMetricsFor = (width) => ({
  width,
  pageHeightPx: 360,
  padding: { top: 32, right: 48, bottom: 32, left: 48 },
  lineHeight: 1.5
});

const textNode = (text, marks) => ({
  type: "text",
  text,
  ...(marks ? { marks } : {})
});

const createContent = () => {
  const paragraphs = Array.from({ length: 8 }, (_, index) => ({
    type: "paragraph",
    content: [
      textNode(`본문 ${index + 1}: 페이지 예약과 줄바꿈을 검증하는 충분히 긴 문장입니다. `),
      ...(index === 0
        ? [{
          type: "noteReference",
          attrs: { noteId: NOTE_ID, kind: "footnote" }
        }]
        : []),
      textNode("각주가 생겨도 본문과 겹치지 않아야 합니다.")
    ]
  }));
  const longBody = Array.from(
    { length: 20 },
    (_, index) => `장문 각주 ${index + 1}은 안전한 줄 경계에서 다음 페이지로 이어집니다.`
  ).join(" ");

  const table = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableHeader", content: [{ type: "paragraph", content: [textNode("분기")] }] },
          { type: "tableHeader", content: [{ type: "paragraph", content: [textNode("매출")] }] }
        ]
      },
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [{ type: "paragraph", content: [textNode("1분기")] }] },
          { type: "tableCell", content: [{ type: "paragraph", content: [textNode("N4B2-TABLE-240")] }] }
        ]
      }
    ]
  };
  const forcedBreakParagraph = {
    type: "paragraph",
    attrs: { pageBreakBefore: true },
    content: [textNode("N4B2 강제 페이지 나눔 뒤 본문")]
  };

  return {
    type: "doc",
    content: [
      ...paragraphs.slice(0, 3),
      table,
      { type: "chartBlock" },
      forcedBreakParagraph,
      ...paragraphs.slice(3),
      {
        type: "noteBody",
        attrs: { noteId: NOTE_ID, kind: "footnote" },
        content: [{
          type: "paragraph",
          content: [
            textNode("굵은 각주 시작", [{ type: "bold" }]),
            textNode(` ${longBody} N4B2-FOOTNOTE-UNIQUE-MARKER `),
            textNode("안전한 링크", [{
              type: "link",
              attrs: {
                href: "https://example.com/footnote",
                target: "_blank",
                rel: "noopener noreferrer"
              }
            }])
          ]
        }]
      }
    ]
  };
};

const clearProjection = () => {
  projectionCleanups.splice(0).forEach((cleanup) => cleanup());
  shellLayer.replaceChildren();
};

const renderProjection = (nextPayload, pageMetrics) => {
  payload = nextPayload;
  updateVersion += 1;
  clearProjection();

  if (!nextPayload) {
    model = null;
    status.textContent = "destroyed";
    return;
  }

  model = buildPaginationPageSegmentModel({
    input: nextPayload.input,
    plan: nextPayload.plan,
    pageMap: nextPayload.pageMap,
    pageMetrics,
    gapHeight: nextPayload.gapHeight,
    viewPage: true
  });
  pages.style.width = `${pageMetrics.width}px`;
  pages.style.height = `${model.totalHeight}px`;
  shellLayer.style.height = `${model.totalHeight}px`;

  model.pages.forEach((page) => {
    const shell = document.createElement("section");
    shell.className = "tiptap-page-shell";
    shell.dataset.paginationPage = String(page.pageNumber);
    Object.assign(shell.style, {
      top: `${page.top}px`,
      width: `${pageMetrics.width}px`,
      height: `${pageMetrics.pageHeightPx}px`
    });
    const paper = document.createElement("div");
    paper.className = "tiptap-page-shell__paper";
    shell.appendChild(paper);
    shellLayer.appendChild(shell);

    const pageSegments = nextPayload.footnoteProjection?.segments?.filter(
      (segment) => segment.pageNumber === page.pageNumber
    ) || [];
    pageSegments.forEach((segment, segmentIndex) => {
      const projection = document.createElement("div");
      projection.className = "dockit-footnote-screen-projection";
      projection.dataset.footnoteId = segment.noteId;
      projection.dataset.footnoteFragment = String(segment.segmentIndex);
      projection.dataset.footnoteCanonical = segment.canonical ? "true" : "false";
      if (!segment.canonical) {
        projection.classList.add(
          "dockit-footnote-screen-projection--continuation"
        );
        projection.title = "각주 시작 위치로 이동";
        projection.addEventListener("mousedown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          focusCanonicalFootnoteBody(editor, segment.noteId);
        });
      }
      Object.assign(projection.style, {
        left: `${page.contentFrameLeft}px`,
        width: `${page.contentFrameWidth}px`,
        bottom: `${page.contentFrameBottom + pageSegments
          .slice(segmentIndex + 1)
          .reduce((total, following) => total + following.height, 0)}px`,
        height: `${segment.height}px`
      });
      const clip = document.createElement("div");
      clip.className = "dockit-footnote-screen-projection__clip";
      projection.appendChild(clip);
      shell.appendChild(projection);
      projectionCleanups.push(segment.canonical
        ? mountCanonicalFootnoteBody(clip, segment, {
            editorRoot: editor.view.dom
          })
        : mountFootnoteProjectionClone(clip, segment));
    });

    if (pageSegments.length && page.footnoteChromeHeight > 0) {
      const chrome = document.createElement("div");
      chrome.className = "dockit-footnote-screen-projection__separator";
      Object.assign(chrome.style, {
        left: `${page.contentFrameLeft}px`,
        width: `${page.contentFrameWidth}px`,
        bottom: `${page.contentFrameBottom + page.footnoteBodyHeight}px`,
        height: `${page.footnoteChromeHeight}px`
      });
      const fromPrevious = document.createElement("span");
      fromPrevious.className = "dockit-footnote-screen-projection__continuation";
      fromPrevious.textContent = pageSegments.find(
        (segment) => segment.continuationFromPreviousLabel
      )?.continuationFromPreviousLabel || "";
      const toNext = document.createElement("span");
      toNext.className = "dockit-footnote-screen-projection__continuation";
      toNext.textContent = [...pageSegments].reverse().find(
        (segment) => segment.continuationToNextLabel
      )?.continuationToNextLabel || "";
      chrome.append(fromPrevious, toNext);
      shell.appendChild(chrome);
    }
  });

  status.textContent = nextPayload.footnoteStatus || "legacy";
  document.body.dataset.fixtureStatus = nextPayload.footnoteStatus || "legacy";
};

const createEditor = ({ width = 600, fontSize = 16, zoom = 1 } = {}) => {
  const previousContent = editor?.getJSON() || createContent();
  editor?.destroy();
  editorHost.replaceChildren();
  const pageMetrics = pageMetricsFor(width);
  pages.style.zoom = String(zoom);

  editor = new Editor({
    element: editorHost,
    extensions: [
      CustomDocument,
      Paragraph,
      Text,
      Bold,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      FixtureChartBlock,
      PaginationSemanticsExtension,
      NoteReference,
      NoteBody,
      PaginationExtension.configure({
        pageMetrics,
        gapHeight: 40,
        footnoteMaxAreaRatio: 0.35,
        footnoteChromeHeight: 18,
        onPaginationUpdate: (nextPayload) =>
          renderProjection(nextPayload, pageMetrics)
      })
    ],
    content: previousContent,
    editable: true,
    autofocus: false
  });
  Object.assign(editor.view.dom.style, {
    width: `${width}px`,
    paddingLeft: `${pageMetrics.padding.left}px`,
    paddingRight: `${pageMetrics.padding.right}px`,
    fontSize: `${fontSize}px`
  });
  editor.view.dom.style.setProperty("--print-page-width", `${pageMetrics.width}px`);
  editor.view.dom.style.setProperty(
    "--print-page-padding-left",
    `${pageMetrics.padding.left}px`
  );
  editor.view.dom.style.setProperty(
    "--print-page-padding-right",
    `${pageMetrics.padding.right}px`
  );
  editor.view.dom.classList.add("printable-area", "tiptap-main-canvas");
  pages.style.width = `${width}px`;
  return editor;
};

window.__footnoteFixture = {
  get editor() {
    return editor;
  },
  get payload() {
    return payload;
  },
  get model() {
    return model;
  },
  get updateVersion() {
    return updateVersion;
  },
  recreate: createEditor
};

setTimeout(() => createEditor(), 0);
