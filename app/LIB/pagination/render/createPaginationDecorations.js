import { Decoration } from "@tiptap/pm/view";

const normalizePageNumberPosition = (pageNumberPosition) => {
  if (
    pageNumberPosition === "left" ||
    pageNumberPosition === "center" ||
    pageNumberPosition === "right"
  ) {
    return pageNumberPosition;
  }

  return "none";
};

const createPageNumberDataAttributes = ({ pageNumber, pageNumberPosition }) => {
  const normalizedPageNumberPosition =
    normalizePageNumberPosition(pageNumberPosition);

  if (!Number.isFinite(pageNumber) || normalizedPageNumberPosition === "none") {
    return "";
  }

  return `
      data-page-number="- ${pageNumber} -"
      data-page-number-position="${normalizedPageNumberPosition}"
  `;
};

export const createPaginationSpacerStructure = ({
  fillerHeight = 0,
  footerHeight = 0,
  pageGapHeight = 0,
  headerHeight = 0,
  printFooterHeight = footerHeight,
  printHeaderHeight = headerHeight,
  marginLeft = 0,
  marginRight = 0,
  inline = false,
  includeContentFiller = true,
  includeFooter = true,
  includeHeader = true,
  footerBreakAfter = false,
  includePageBreakBoundary = footerBreakAfter,
  footerPageNumber = null,
  pageNumberPosition = "none",
  structureClassName = ""
}) => {
  const containerTag = inline ? "span" : "div";
  const spacerTag = inline ? "span" : "div";
  const spacerStructure = document.createElement(containerTag);

  spacerStructure.className = `tiptap-page-break-structure${inline ? " tiptap-inline-page-break" : ""}${structureClassName ? ` ${structureClassName}` : ""}`;
  spacerStructure.style.display = inline ? "inline-block" : "block";
  spacerStructure.style.marginLeft = inline ? "0px" : `${marginLeft}px`;
  spacerStructure.style.marginRight = inline ? "0px" : `${marginRight}px`;
  spacerStructure.style.boxSizing = "border-box";

  if (inline) {
    spacerStructure.style.width = "100%";
    spacerStructure.style.maxWidth = "100%";
    spacerStructure.style.verticalAlign = "top";
  }

  const structureParts = [];

  if (includeContentFiller) {
    structureParts.push(`
      <${spacerTag}
        class="page-content-filler"
        style="display: block; height: ${Math.max(0, fillerHeight)}px;"
      ></${spacerTag}>
    `);
  }

  if (includeFooter) {
    structureParts.push(`
      <${spacerTag}
        class="page-footer-spacer"
        ${createPageNumberDataAttributes({
          pageNumber: footerPageNumber,
          pageNumberPosition
        })}
        style="display: block; height: ${Math.max(0, footerHeight)}px; --print-footer-height: ${Math.max(0, printFooterHeight)}px;"
      ></${spacerTag}>
    `);
  }

  if (pageGapHeight > 0) {
    structureParts.push(`
      <${spacerTag}
        class="page-gap"
        style="display: block; height: ${Math.max(0, pageGapHeight)}px;"
      ></${spacerTag}>
    `);
  }

  if (includePageBreakBoundary) {
    structureParts.push(`
      <${spacerTag}
        class="page-break-boundary${footerBreakAfter ? "" : " page-break-boundary--terminal"}"
      ></${spacerTag}>
    `);
  }

  if (includeHeader) {
    structureParts.push(`
      <${spacerTag}
        class="page-header-spacer"
        style="display: block; height: ${Math.max(0, headerHeight)}px; --print-header-height: ${Math.max(0, printHeaderHeight)}px;"
      ></${spacerTag}>
    `);
  }

  spacerStructure.innerHTML = structureParts.join("");

  return spacerStructure;
};

const applyTablePageBreakWidgetStyles = (widget, cell) => {
  [
    [widget, "border", "0"],
    [widget, "background", "transparent"],
    [widget, "height", "0"],
    [widget, "min-height", "0"],
    [widget, "max-height", "none"]
  ].forEach(([element, property, value]) => {
    element.style.setProperty(property, value, "important");
  });

  [
    [cell, "padding", "0"],
    [cell, "border", "0"],
    [cell, "background", "transparent"],
    [cell, "background-color", "transparent"],
    [cell, "height", "0"],
    [cell, "min-height", "0"],
    [cell, "line-height", "0"],
    [cell, "font-size", "0"],
    [cell, "box-sizing", "border-box"]
  ].forEach(([element, property, value]) => {
    element.style.setProperty(property, value, "important");
  });
};

export const createPageBreakWidgetElement = ({
  pageMetrics,
  gapHeight,
  fillerHeight,
  marginLeft,
  marginRight,
  kind,
  tableColSpan,
  pageNumber,
  pageNumberPosition = "none",
  includeHeader = true,
  includePageBreakBoundary = true,
  structureClassName = "",
  tableBorderHeight = 0
}) => {
  const spacerStructure = createPaginationSpacerStructure({
    fillerHeight,
    footerHeight: pageMetrics?.padding?.bottom || 0,
    pageGapHeight: gapHeight,
    headerHeight: includeHeader ? pageMetrics?.padding?.top || 0 : 0,
    printFooterHeight: pageMetrics?.padding?.bottom || 0,
    printHeaderHeight: includeHeader ? pageMetrics?.padding?.top || 0 : 0,
    marginLeft,
    marginRight,
    includeHeader,
    footerBreakAfter: includePageBreakBoundary,
    includePageBreakBoundary,
    footerPageNumber: pageNumber,
    pageNumberPosition,
    structureClassName
  });

  if (kind === "listItem") {
    const widget = document.createElement("li");
    widget.className = "tiptap-list-page-break-item";
    widget.appendChild(spacerStructure);
    return widget;
  }

  if (kind === "tableRow") {
    const widget = document.createElement("tr");
    widget.className = "tiptap-table-page-break-row";

    // A collapsed neighbouring cell border adds half its width to this row.
    // Keep the spacer's total footprint equal to the planned page gap.
    spacerStructure.style.marginTop = `${-Math.max(0, tableBorderHeight)}px`;

    const cell = document.createElement("td");
    cell.className = "tiptap-table-page-break-cell";
    cell.colSpan = tableColSpan || 1;
    cell.appendChild(spacerStructure);
    applyTablePageBreakWidgetStyles(widget, cell);

    widget.appendChild(cell);
    return widget;
  }

  return spacerStructure;
};

export const createPageBreakHeaderWidgetElement = ({
  pageMetrics,
  marginLeft,
  marginRight,
  kind,
  tableColSpan,
  tableBorderHeight = 0
}) => {
  const spacerStructure = createPaginationSpacerStructure({
    headerHeight: pageMetrics?.padding?.top || 0,
    printHeaderHeight: pageMetrics?.padding?.top || 0,
    marginLeft,
    marginRight,
    includeContentFiller: false,
    includeFooter: false,
    includePageBreakBoundary: false,
    structureClassName: "tiptap-page-break-structure--header"
  });

  if (kind === "listItem") {
    const widget = document.createElement("li");
    widget.className = "tiptap-list-page-break-item";
    widget.appendChild(spacerStructure);
    return widget;
  }

  if (kind === "tableRow") {
    const widget = document.createElement("tr");
    widget.className = "tiptap-table-page-break-row";
    spacerStructure.style.marginBottom = `${-Math.max(0, tableBorderHeight)}px`;

    const cell = document.createElement("td");
    cell.className = "tiptap-table-page-break-cell";
    cell.colSpan = tableColSpan || 1;
    cell.appendChild(spacerStructure);
    applyTablePageBreakWidgetStyles(widget, cell);

    widget.appendChild(cell);
    return widget;
  }

  return spacerStructure;
};

const createInlinePageBreakBoundaryElement = () => {
  const boundary = document.createElement("br");
  boundary.className = "tiptap-inline-page-break-boundary";
  return boundary;
};

const createBlockPageDecorations = ({ doc, blockPageAssignments = [] }) => {
  if (typeof doc?.nodeAt !== "function") {
    return [];
  }

  return blockPageAssignments.flatMap((assignment) => {
    const node = doc.nodeAt(assignment.blockPos);

    if (!node) {
      return [];
    }

    return [
      Decoration.node(
        assignment.blockPos,
        assignment.blockPos + node.nodeSize,
        {
          class: `tiptap-pagination-aware-block${assignment.spansPages ? " tiptap-pagination-aware-block--spanning" : ""}`,
          "data-pagination-start-page": String(assignment.startPage),
          "data-pagination-end-page": String(assignment.endPage),
          "data-pagination-page-count": String(assignment.pageCount),
          "data-pagination-block-type": assignment.blockType
        }
      )
    ];
  });
};

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

const createTooTallTableRowDecorations = ({ doc, plan }) => {
  if (typeof doc?.nodeAt !== "function") {
    return [];
  }

  const seenPositions = new Set();

  return (plan?.pages || []).flatMap((page) =>
    (page.segments || []).flatMap((segment) => {
      if (segment.kind !== "tableRow" || !segment.tableRowTooTall) {
        return [];
      }

      const pos = segment.pos;

      if (!Number.isInteger(pos) || seenPositions.has(pos)) {
        return [];
      }

      const node = doc.nodeAt(pos);

      if (!node) {
        return [];
      }

      seenPositions.add(pos);

      const localHeight = Math.max(0, toFiniteNumber(segment.localHeight, 0));
      const measuredHeight = Math.max(
        0,
        toFiniteNumber(segment.tableRowTooTallMeasuredHeight, localHeight)
      );
      const clipHeight = Math.max(
        0,
        toFiniteNumber(
          segment.tableRowTooTallClipHeight,
          measuredHeight || localHeight
        )
      );
      const visibleHeight = Math.max(
        0,
        Math.min(localHeight || measuredHeight, clipHeight)
      );
      const classNames = [
        "tiptap-table-row-too-tall",
        `tiptap-table-row-too-tall--${segment.tableRowTooTallKind || "row"}`
      ];

      if (visibleHeight <= 0) {
        classNames.push("tiptap-table-row-too-tall--clipped-out");
      } else if (localHeight > 0 && visibleHeight < localHeight) {
        classNames.push("tiptap-table-row-too-tall--clipped");
      }

      return [
        Decoration.node(pos, pos + node.nodeSize, {
          class: classNames.join(" "),
          "data-table-row-too-tall-reason": "tableRowTooTall",
          "data-table-row-too-tall-kind":
            segment.tableRowTooTallKind || "row",
          "data-table-row-too-tall-group-id":
            segment.tableRowTooTallGroupId || "",
          "data-table-row-too-tall-clip-height": String(clipHeight),
          style: [
            `--tiptap-table-row-measured-height: ${measuredHeight}px`,
            `--tiptap-table-row-clip-height: ${clipHeight}px`,
            `--tiptap-table-row-visible-height: ${visibleHeight}px`
          ].join("; ")
        })
      ];
    })
  );
};

export const createPaginationDecorations = ({
  doc,
  plan,
  pageMetrics,
  gapHeight,
  pageNumberPosition = "none",
  footnotePrintProjectionAdapter = null,
  footnotePrintStatus = "not-required"
}) => {
  const decorations = [];
  const normalizedPageNumberPosition =
    normalizePageNumberPosition(pageNumberPosition);
  const pageBoundary = footnotePrintProjectionAdapter?.resolvePageBoundary(
    plan
  ) || {
    hasFootnoteOnlyPages: false,
    finalMainFlowPageNumber: plan.totalPages
  };

  decorations.push(
    Decoration.widget(
      0,
      createPaginationSpacerStructure({
        headerHeight: pageMetrics?.padding?.top || 0,
        printHeaderHeight: pageMetrics?.padding?.top || 0,
        includeContentFiller: false,
        includeFooter: false,
        structureClassName: "tiptap-page-break-structure--start"
      })
    )
  );

  plan.pageBreaks.forEach((pageBreak) => {
    const reservedFootnoteHeight = getFootnoteReservedHeight(
      plan,
      pageBreak.footerPageNumber
    );
    const pageBreakWidget = createPageBreakWidgetElement({
      pageMetrics,
      gapHeight,
      fillerHeight: pageBreak.fillerHeight + reservedFootnoteHeight,
      marginLeft: pageBreak.marginLeft,
      marginRight: pageBreak.marginRight,
      kind: pageBreak.kind,
      tableBorderHeight: pageBreak.tableBreakEndBorderHeight,
      tableColSpan: pageBreak.tableColSpan,
      pageNumber: pageBreak.footerPageNumber,
      pageNumberPosition: normalizedPageNumberPosition,
      includeHeader: false,
      includePageBreakBoundary: true,
      structureClassName: "tiptap-page-break-structure--end"
    });
    footnotePrintProjectionAdapter?.mountPage({
      structure: pageBreakWidget,
      plan,
      pageNumber: pageBreak.footerPageNumber,
      pageMetrics,
      contentOffsetLeft:
        toFiniteNumber(pageBreak.marginLeft, 0) +
        toFiniteNumber(pageMetrics?.padding?.left, 0)
    });
    const pageBreakHeaderWidget = createPageBreakHeaderWidgetElement({
      pageMetrics,
      marginLeft: pageBreak.marginLeft,
      marginRight: pageBreak.marginRight,
      kind: pageBreak.kind,
      tableBorderHeight: pageBreak.tableBreakStartBorderHeight,
      tableColSpan: pageBreak.tableColSpan
    });

    decorations.push(
      Decoration.widget(pageBreak.pos, pageBreakWidget, {
        side: -20
      })
    );
    decorations.push(
      Decoration.widget(pageBreak.pos, pageBreakHeaderWidget, {
        side: -10
      })
    );
  });

  decorations.push(
    ...createBlockPageDecorations({
      doc,
      blockPageAssignments: plan.blockPageAssignments
    })
  );

  decorations.push(
    ...createTooTallTableRowDecorations({
      doc,
      plan
    })
  );

  const { hasFootnoteOnlyPages, finalMainFlowPageNumber } = pageBoundary;
  const finalWidget = createPaginationSpacerStructure({
    fillerHeight:
      plan.finalFillerHeight +
      getFootnoteReservedHeight(
        plan,
        finalMainFlowPageNumber
      ),
    footerHeight: pageMetrics?.padding?.bottom || 0,
    printFooterHeight: pageMetrics?.padding?.bottom || 0,
    marginLeft: -(pageMetrics?.padding?.left || 0),
    marginRight: -(pageMetrics?.padding?.right || 0),
    includeHeader: false,
    includePageBreakBoundary: hasFootnoteOnlyPages,
    footerBreakAfter: hasFootnoteOnlyPages,
    footerPageNumber: finalMainFlowPageNumber,
    pageNumberPosition: normalizedPageNumberPosition,
    structureClassName: "tiptap-page-break-structure--final"
  });
  finalWidget.classList.add("tiptap-final-page-filler");
  footnotePrintProjectionAdapter?.mountPage({
    structure: finalWidget,
    plan,
    pageNumber: finalMainFlowPageNumber,
    pageMetrics
  });

  decorations.push(Decoration.widget(doc.content.size, finalWidget));

  decorations.push(
    ...(footnotePrintProjectionAdapter?.createContinuationDecorations({
      doc,
      plan,
      pageMetrics,
      pageNumberPosition: normalizedPageNumberPosition
    }) || [])
  );

  if (footnotePrintStatus === "blocked") {
    const error = document.createElement("div");
    error.className = "dockit-footnote-print-blocking-error";
    error.setAttribute("role", "alert");
    error.textContent = "각주 페이지 레이아웃을 준비하지 못했습니다. 인쇄를 중단하고 다시 시도하세요.";
    decorations.push(Decoration.widget(doc.content.size, error, { side: 100 }));
  }

  return decorations;
};
