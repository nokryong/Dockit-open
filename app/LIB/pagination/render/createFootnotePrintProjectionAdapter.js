import { Decoration } from "@tiptap/pm/view";
import { mountFootnoteProjectionClone } from "./mountFootnoteProjectionClone";
import {
  createPageBreakHeaderWidgetElement,
  createPaginationSpacerStructure
} from "./createPaginationDecorations";

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const getFootnoteReservedHeight = (plan, pageNumber) => {
  if (!plan?.footnoteLayout || !Number.isSafeInteger(pageNumber)) return 0;

  const page = (plan.pages || []).find(
    (candidate) => candidate.pageNumber === pageNumber
  );
  const layoutPage = (plan.footnoteLayout.pages || []).find(
    (candidate) => candidate.pageNumber === pageNumber
  );
  const reservedHeight = toFiniteNumber(
    page?.footnote?.reservedHeight ?? layoutPage?.reservedHeight,
    0
  );

  return Math.max(0, reservedHeight);
};

const getContentAreaHeight = (pageMetrics) =>
  Math.max(
    0,
    toFiniteNumber(pageMetrics?.pageHeightPx, 0) -
      toFiniteNumber(pageMetrics?.padding?.top, 0) -
      toFiniteNumber(pageMetrics?.padding?.bottom, 0)
  );

const getContentAreaWidth = (pageMetrics) =>
  Math.max(
    0,
    toFiniteNumber(pageMetrics?.width, 0) -
      toFiniteNumber(pageMetrics?.padding?.left, 0) -
      toFiniteNumber(pageMetrics?.padding?.right, 0)
  );

const mountPrintFootnotes = ({
  structure,
  projection,
  pageNumber,
  pageMetrics,
  reservedHeight = 0,
  chromeHeight = 18,
  contentOffsetLeft = 0
}) => {
  if (!projection?.segments?.length || !structure) return;
  const filler = structure.querySelector(".page-content-filler");
  const segments = projection.segments.filter(
    (segment) => segment.pageNumber === pageNumber
  );
  if (!filler || !segments.length) return;

  const footnotes = document.createElement("aside");
  footnotes.className = "dockit-footnote-print-projection";
  footnotes.setAttribute("role", "doc-footnote");
  footnotes.setAttribute("aria-label", "각주");
  footnotes.setAttribute(
    "data-dockit-footnote-print-page",
    String(pageNumber)
  );
  filler.style.position = "relative";
  footnotes.style.position = "absolute";
  footnotes.style.bottom = "0";
  footnotes.style.left = `${toFiniteNumber(contentOffsetLeft, 0)}px`;
  const contentWidth = getContentAreaWidth(pageMetrics);
  if (contentWidth > 0) {
    footnotes.style.width = `${contentWidth}px`;
  } else {
    footnotes.style.right = "0";
  }
  footnotes.style.height = `${Math.max(0, reservedHeight)}px`;

  const separator = document.createElement("div");
  separator.className = "dockit-footnote-print-projection__separator";
  separator.style.height = `${Math.max(0, chromeHeight)}px`;
  const from = segments.find(
    (segment) => segment.continuationFromPreviousLabel
  );
  const to = [...segments]
    .reverse()
    .find((segment) => segment.continuationToNextLabel);
  const fromLabel = document.createElement("span");
  fromLabel.className = "dockit-footnote-print-projection__continuation";
  fromLabel.textContent = from?.continuationFromPreviousLabel || "";
  const toLabel = document.createElement("span");
  toLabel.className = "dockit-footnote-print-projection__continuation";
  toLabel.textContent = to?.continuationToNextLabel || "";
  separator.append(fromLabel, toLabel);
  footnotes.appendChild(separator);

  segments.forEach((segment) => {
    const clip = document.createElement("div");
    clip.className = "dockit-footnote-print-projection__clip";
    clip.setAttribute("data-dockit-footnote-id", segment.noteId);
    clip.setAttribute(
      "data-dockit-footnote-fragment",
      String(segment.segmentIndex)
    );
    clip.style.height = `${Math.max(0, segment.height)}px`;
    mountFootnoteProjectionClone(clip, segment, { print: true });
    footnotes.appendChild(clip);
  });
  filler.appendChild(footnotes);
};

const resolvePageBoundary = (plan, projection) => {
  const hasFootnoteOnlyPages = Boolean(
    projection &&
      Number.isSafeInteger(plan.mainFlowTotalPages) &&
      plan.totalPages > plan.mainFlowTotalPages
  );

  return {
    hasFootnoteOnlyPages,
    finalMainFlowPageNumber: hasFootnoteOnlyPages
      ? plan.mainFlowTotalPages
      : plan.totalPages
  };
};

const createFootnoteOnlyPageWidget = ({
  pageMetrics,
  pageNumber,
  pageNumberPosition,
  isLast,
  plan,
  projection,
  chromeHeight
}) => {
  const wrapper = document.createElement("div");
  wrapper.className = "dockit-footnote-print-only-page";
  wrapper.setAttribute("data-dockit-footnote-print-page", String(pageNumber));
  const header = createPageBreakHeaderWidgetElement({
    pageMetrics,
    marginLeft: 0,
    marginRight: 0,
    kind: "block"
  });
  const structure = createPaginationSpacerStructure({
    fillerHeight: getContentAreaHeight(pageMetrics),
    footerHeight: pageMetrics?.padding?.bottom || 0,
    printFooterHeight: pageMetrics?.padding?.bottom || 0,
    includeHeader: false,
    footerBreakAfter: !isLast,
    includePageBreakBoundary: !isLast,
    footerPageNumber: pageNumber,
    pageNumberPosition,
    structureClassName:
      "tiptap-page-break-structure--end tiptap-page-break-structure--footnote-only"
  });
  mountPrintFootnotes({
    structure,
    projection,
    pageNumber,
    pageMetrics,
    reservedHeight: getFootnoteReservedHeight(plan, pageNumber),
    chromeHeight
  });
  wrapper.append(header, structure);
  return wrapper;
};

export const createFootnotePrintProjectionAdapter = ({
  projection,
  chromeHeight = 18
} = {}) => ({
  resolvePageBoundary: (plan) => resolvePageBoundary(plan, projection),

  mountPage({
    structure,
    plan,
    pageNumber,
    pageMetrics,
    contentOffsetLeft = 0
  }) {
    mountPrintFootnotes({
      structure,
      projection,
      pageNumber,
      pageMetrics,
      reservedHeight: getFootnoteReservedHeight(plan, pageNumber),
      chromeHeight,
      contentOffsetLeft
    });
  },

  createContinuationDecorations({
    doc,
    plan,
    pageMetrics,
    pageNumberPosition
  }) {
    const { hasFootnoteOnlyPages } = resolvePageBoundary(plan, projection);
    if (!hasFootnoteOnlyPages) return [];

    const continuationPages = (plan.pages || []).filter(
      (page) => page.pageNumber > plan.mainFlowTotalPages
    );

    return continuationPages.map((page, index) =>
      Decoration.widget(
        doc.content.size,
        createFootnoteOnlyPageWidget({
          pageMetrics,
          pageNumber: page.pageNumber,
          pageNumberPosition,
          isLast: index === continuationPages.length - 1,
          plan,
          projection,
          chromeHeight
        }),
        { side: 20 + index }
      )
    );
  }
});
