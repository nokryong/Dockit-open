import { collectPaginationDomModel } from "../model/collectDomMeasurements";
import { buildPaginationInput } from "../model/buildPaginationInput";
import { calculatePaginationPlan } from "../layout/calculatePaginationPlan";
import { collectFootnoteDomCandidate } from "./collectFootnoteDomCandidate";
import { calculateFootnotePaginationPlan } from "./calculateFootnotePaginationPlan";
import {
  FOOTNOTE_LAYOUT_ITERATION_LIMIT,
  FOOTNOTE_LAYOUT_PAGE_LIMIT
} from "./planFootnoteLayout";
import { buildFootnoteScreenProjection } from "../render/buildFootnoteScreenProjection";
export { restoreCanonicalFootnoteBodies } from "../render/mountFootnoteProjectionClone";
export { createFootnotePrintProjectionAdapter } from "../render/createFootnotePrintProjectionAdapter";

const FOOTNOTE_CONTINUATION_RETRY_LIMIT = Math.min(
  8,
  FOOTNOTE_LAYOUT_ITERATION_LIMIT
);

export const activateCanonicalBodyProjection = ({ view, candidate, projection }) => {
  if (!projection?.segments?.length || !view?.dom?.querySelectorAll) return null;

  const projectedIds = new Set(
    projection.segments.map((segment) => segment.noteId)
  );
  const candidateFootnotes = candidate?.footnotes || [];
  const candidateIds = new Set(
    candidateFootnotes.map((footnote) => footnote?.body?.noteId).filter(Boolean)
  );
  if (
    candidateIds.size === 0 ||
    candidateIds.size !== candidateFootnotes.length ||
    projectedIds.size !== candidateIds.size ||
    [...candidateIds].some((noteId) => !projectedIds.has(noteId))
  ) {
    return null;
  }
  const projectedBodies = [...view.dom.querySelectorAll(
    '[data-dockit-note-body="true"][data-dockit-note-kind="footnote"]'
  )].filter((body) =>
    candidateIds.has(body.getAttribute("data-dockit-note-id"))
  );

  // Never hide a canonical body unless every measured footnote has a
  // corresponding projection. The host stays outside ProseMirror's observed
  // NodeView DOM so activation cannot mutate persisted editor content.
  if (projectedBodies.length !== candidateIds.size) return null;

  const host = view.dom.parentElement;
  if (!host) return null;
  host.setAttribute("data-dockit-footnote-projection-active", "true");
  return host;
};

export const retryMissingFootnoteContinuationPages = ({
  paginationInput,
  footnotes,
  maxFootnoteAreaHeight,
  noteAreaOverhead
}) => {
  const continuationMeasurements = new Map();
  let result = null;

  for (let attempt = 0; attempt < FOOTNOTE_CONTINUATION_RETRY_LIMIT; attempt += 1) {
    result = calculateFootnotePaginationPlan({
      paginationInput,
      footnotes,
      maxFootnoteAreaHeight,
      noteAreaOverhead,
      contentHeightsByPage: [...continuationMeasurements].map(
        ([pageNumber, height]) => ({ pageNumber, height })
      )
    });

    if (
      result.status !== "unresolved" ||
      result.code !== "FOOTNOTE_PAGE_MEASUREMENT_REQUIRED" ||
      !Array.isArray(result.missingPageNumbers) ||
      !result.missingPageNumbers.length
    ) {
      return result;
    }

    const newPageNumbers = result.missingPageNumbers.filter(
      (pageNumber) =>
        Number.isSafeInteger(pageNumber) &&
        pageNumber > 0 &&
        pageNumber <= FOOTNOTE_LAYOUT_PAGE_LIMIT &&
        !continuationMeasurements.has(pageNumber)
    );
    if (!newPageNumbers.length) return result;
    newPageNumbers.forEach((pageNumber) => {
      continuationMeasurements.set(pageNumber, 0);
    });
  }

  return result;
};

export const selectFootnotePaginationOutcome = ({
  legacyPaginationInput,
  footnotePaginationInput,
  footnoteIntegration,
  footnoteProjection
}) => {
  const active = Boolean(
    footnotePaginationInput &&
    footnoteIntegration?.status === "stable" &&
    footnoteProjection?.segments?.length
  );
  return {
    active,
    input: active ? footnotePaginationInput : legacyPaginationInput,
    plan: active
      ? footnoteIntegration.plan
      : calculatePaginationPlan(legacyPaginationInput)
  };
};

export const resolveFootnotePrintReadiness = ({ hasFootnoteBody, activeProjection }) => {
  if (!hasFootnoteBody) return "not-required";
  return activeProjection ? "ready" : "blocked";
};

export const prepareFootnoteScreenPagination = ({
  view,
  pageMetrics,
  footnoteMaxAreaRatio,
  footnoteChromeHeight
}) => {
  const candidate = collectFootnoteDomCandidate(view);
  if (candidate.status !== "ok" || !candidate.footnotes.length) return null;

  const domModel = collectPaginationDomModel(view, {
    footnoteCandidate: candidate
  });
  const paginationInput = buildPaginationInput({
    editorState: view.state,
    pageMetrics,
    domModel,
    footnoteCandidate: candidate
  });
  const maxFootnoteAreaHeight = Math.max(
    footnoteChromeHeight + 1,
    Math.min(
      paginationInput.contentAreaHeight,
      paginationInput.contentAreaHeight * footnoteMaxAreaRatio
    )
  );
  const integration = retryMissingFootnoteContinuationPages({
    paginationInput,
    footnotes: candidate.footnotes,
    maxFootnoteAreaHeight,
    noteAreaOverhead: footnoteChromeHeight
  });
  const projection = integration.status === "stable"
    ? buildFootnoteScreenProjection({
      view,
      candidate,
      footnoteLayout: integration.plan.footnoteLayout
    })
    : null;

  return {
    candidate,
    paginationInput,
    integration,
    projection
  };
};
