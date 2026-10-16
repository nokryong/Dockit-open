const freezeList = (values) => Object.freeze(values.map((value) => Object.freeze(value)));
const humanMarkers = Object.freeze(
  Array.from({ length: 10 }, (_, index) => `D5C-HUMAN-${index + 1}`)
);
const aiMarkers = Object.freeze(
  Array.from({ length: 10 }, (_, index) => `D5C-AI-${index + 1}`)
);
const protectedMarkers = Object.freeze({
  chart: "D5C-PROTECTED-CHART",
  ordinary: "D5C-PROTECTED-ORDINARY",
  style: "D5C-PROTECTED-STYLE",
  table: "D5C-PROTECTED-TABLE"
});
const sections = freezeList(Array.from({ length: 10 }, (_, index) => ({
  bodyBlockId: `block-d5c-section-${index + 1}-body`,
  headingBlockId: `block-d5c-section-${index + 1}`,
  headingId: `heading-d5c-section-${index + 1}`,
  title: `Durability section ${index + 1}`
})));
const outline = Object.freeze({
  documentTitle: "D5c scoped durability report",
  sections: freezeList(sections.map((section) => ({
    level: 2,
    objective: `Preserve all non-target edits while replacing section ${section.title}.`,
    plannedBlocks: Object.freeze(["paragraph"]),
    sourceReferenceIds: Object.freeze([]),
    title: section.title
  })))
});
const brief = Object.freeze({
  audience: "Durability reviewers",
  constraints: Object.freeze(["Preserve every non-target edit"]),
  purpose: "Prove deterministic scoped AI report durability",
  sourceReferences: Object.freeze([]),
  workingTitle: outline.documentTitle
});

const assertSectionIndex = (index) => {
  if (!Number.isInteger(index) || index < 0 || index >= sections.length) {
    throw new RangeError("invalid AI report D5c section index");
  }
  return index;
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

export const createAiReportD5cBaselineSectionText = (index) => {
  const resolvedIndex = assertSectionIndex(index);
  return `D5C-BASE-${resolvedIndex + 1} ${
    "deterministic long report baseline content ".repeat(80)
  }`.trim();
};

export const createAiReportD5cApprovedSectionText = (index) => {
  const resolvedIndex = assertSectionIndex(index);
  return `${aiMarkers[resolvedIndex]}: approved scoped report edit ${
    "deterministic generated section content ".repeat(60)
  }`.trim();
};

// Final F3c state: the first AI section apply was explicitly rolled back while
// every human edit and the other nine approved AI section edits survived.
export const createAiReportD5cFinalRollbackHtml = () => {
  const humanParagraphs = humanMarkers.slice(4).map((marker, index) =>
    index === 0
      ? `<p data-d5c-human-edit="${index + 5}"><strong>${escapeHtml(marker)}: approved human edit</strong></p>`
      : `<p data-d5c-human-edit="${index + 5}">${escapeHtml(marker)}: approved human edit</p>`
  );
  const sectionMarkup = sections.map((section, index) => {
    const content = index === 0
      ? createAiReportD5cBaselineSectionText(index)
      : createAiReportD5cApprovedSectionText(index);
    return [
      `<section data-d5c-section="${index + 1}" data-d5c-operation-state="${
        index === 0 ? "rolled-back" : "ai-approved"
      }">`,
      `<h2 data-block-id="${escapeHtml(section.headingBlockId)}">${escapeHtml(section.title)}</h2>`,
      `<p data-block-id="${escapeHtml(section.bodyBlockId)}">${escapeHtml(content)}</p>`,
      "</section>"
    ].join("\n");
  });

  return [
    `<style>
      .d5c-report { color: #172033; font-family: Arial, sans-serif; }
      .d5c-report h1 { color: #183b6b; font-size: 28px; margin: 0 0 18px; }
      .d5c-report h2 { color: #234d7d; font-size: 20px; margin: 24px 0 8px; }
      .d5c-report p { margin: 0 0 12px; overflow-wrap: anywhere; }
      .d5c-report table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .d5c-report th, .d5c-report td { border: 1px solid #8ea0b8; padding: 8px; overflow-wrap: anywhere; }
      .d5c-report figure { margin: 18px 0; padding: 14px; border-left: 5px solid #2f6fed; background: #eef4ff; }
      .d5c-report .d5c-chart-bars { display: grid; grid-template-columns: 3fr 5fr 4fr; gap: 8px; height: 44px; align-items: end; }
      .d5c-report .d5c-chart-bars span { display: block; background: #2f6fed; min-height: 16px; }
      .d5c-report .d5c-chart-bars span:nth-child(2) { height: 100%; }
      .d5c-report .d5c-chart-bars span:nth-child(3) { height: 72%; }
    </style>`,
    '<article class="d5c-report" data-d5c-final-state="rollback-durable">',
    `<h1>${escapeHtml(humanMarkers[0])}: approved human edit</h1>`,
    `<p data-d5c-protected-kind="ordinary">${escapeHtml(protectedMarkers.ordinary)}</p>`,
    `<p data-d5c-human-edit="2">${escapeHtml(humanMarkers[1])}: approved human edit</p>`,
    `<table><thead><tr><th>${escapeHtml(protectedMarkers.table)}</th><th>${escapeHtml(humanMarkers[2])}: approved human edit</th></tr></thead></table>`,
    `<figure data-d5c-chart="true" data-d5c-chart-protected="${escapeHtml(protectedMarkers.chart)}"><figcaption>${escapeHtml(humanMarkers[3])}: approved human edit</figcaption><div class="d5c-chart-bars" aria-hidden="true"><span></span><span></span><span></span></div></figure>`,
    `<p data-d5c-protected-kind="style"><strong>${escapeHtml(protectedMarkers.style)}</strong></p>`,
    ...humanParagraphs,
    ...sectionMarkup,
    "</article>"
  ].join("\n");
};

export const AI_REPORT_D5C_DURABILITY_FIXTURE = Object.freeze({
  aiMarkers,
  brief,
  documentId: "doc:ai-report-d5c-durability",
  humanMarkers,
  outline,
  protectedMarkers,
  redoMarker: "D5C-EXISTING-REDO",
  rollbackMarker: "D5C-ROLLBACK-ATTEMPT",
  sections,
  uid: "user:ai-report-d5c"
});
