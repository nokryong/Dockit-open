import { isValidNoteId } from "./noteSemanticUtils";

const ENDNOTE_KIND = "endnote";
const REFERENCE_MARKER = "data-dockit-note-reference";
const BODY_MARKER = "data-dockit-note-body";

export class EndnotePrintProjectionError extends Error {
  constructor(code, details = {}) {
    super(`Endnote print projection failed: ${code}`);
    this.name = "EndnotePrintProjectionError";
    this.code = code;
    this.details = details;
  }
}

const getCanonicalMarkers = (document, marker) =>
  [...document.body.querySelectorAll(`[${marker}]`)].filter(
    (element) => element.getAttribute(marker) === "true"
  );

const getNoteId = (element) => element.getAttribute("data-dockit-note-id");
const getNoteKind = (element) => element.getAttribute("data-dockit-note-kind");

const getPrintReferenceId = (noteId) => `dockit-print-endnote-ref-${noteId}`;
const getPrintBodyId = (noteId) => `dockit-print-endnote-body-${noteId}`;

const createProjectionError = (code, noteId) =>
  new EndnotePrintProjectionError(code, { noteId: noteId ?? null });

const collectValidatedEndnotes = (document) => {
  const references = getCanonicalMarkers(document, REFERENCE_MARKER);
  const bodies = getCanonicalMarkers(document, BODY_MARKER);
  const relevantIds = new Set(
    [...references, ...bodies]
      .filter((element) => getNoteKind(element) === ENDNOTE_KIND)
      .map(getNoteId)
  );

  if (relevantIds.size === 0) return [];

  return [...relevantIds].map((noteId) => {
    if (!isValidNoteId(noteId)) {
      throw createProjectionError("INVALID_ENDNOTE_ID", noteId);
    }

    // Attribute comparison deliberately happens after broad marker collection;
    // note IDs are never interpolated into selectors.
    const matchingReferences = references.filter(
      (element) => getNoteId(element) === noteId
    );
    const matchingBodies = bodies.filter((element) => getNoteId(element) === noteId);

    if (matchingReferences.length > 1) {
      throw createProjectionError("DUPLICATE_ENDNOTE_REFERENCE", noteId);
    }
    if (matchingBodies.length > 1) {
      throw createProjectionError("DUPLICATE_ENDNOTE_BODY", noteId);
    }
    if (matchingReferences.length === 0) {
      throw createProjectionError("ORPHAN_ENDNOTE_BODY", noteId);
    }
    if (matchingBodies.length === 0) {
      throw createProjectionError("DANGLING_ENDNOTE_REFERENCE", noteId);
    }

    const [reference] = matchingReferences;
    const [body] = matchingBodies;
    if (
      getNoteKind(reference) !== ENDNOTE_KIND ||
      getNoteKind(body) !== ENDNOTE_KIND
    ) {
      throw createProjectionError("ENDNOTE_KIND_MISMATCH", noteId);
    }

    return { noteId, reference, body };
  });
};

const projectReference = (document, reference, noteId, number) => {
  const targetId = getPrintBodyId(noteId);
  const link = document.createElement("a");
  link.className = "dockit-print-endnote-reference-link";
  link.href = `#${targetId}`;
  link.textContent = String(number);
  link.setAttribute("aria-label", `미주 ${number}`);

  reference.id = getPrintReferenceId(noteId);
  reference.classList.add("dockit-print-endnote-reference");
  reference.setAttribute("role", "doc-noteref");
  reference.setAttribute("data-dockit-print-endnote-number", String(number));
  reference.replaceChildren(link);
};

const createProjectedBody = (document, body, noteId, number) => {
  const entry = document.createElement("article");
  entry.className = "dockit-print-endnote-entry";
  entry.id = getPrintBodyId(noteId);
  entry.setAttribute("role", "doc-endnote");
  entry.setAttribute("data-dockit-print-endnote-number", String(number));

  const backlink = document.createElement("a");
  backlink.className = "dockit-print-endnote-backlink";
  backlink.href = `#${getPrintReferenceId(noteId)}`;
  backlink.textContent = String(number);
  backlink.setAttribute("aria-label", `미주 ${number} 참조로 이동`);
  entry.append(backlink);

  [...body.childNodes].forEach((child) => entry.append(child.cloneNode(true)));
  return entry;
};

/**
 * Builds a print-only endnote projection from canonical editor HTML.
 * The input string is never modified. Invalid endnote pairs fail before a
 * partial projection is returned, while footnote markup remains untouched.
 */
export const projectEndnotesForPrint = (html) => {
  if (typeof html !== "string") {
    throw new EndnotePrintProjectionError("INVALID_HTML_INPUT");
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  const endnotes = collectValidatedEndnotes(document);
  if (endnotes.length === 0) return html;

  const section = document.createElement("section");
  section.className = "dockit-print-endnotes";
  section.setAttribute("role", "doc-endnotes");
  section.setAttribute("aria-labelledby", "dockit-print-endnotes-heading");
  section.setAttribute("data-dockit-print-endnotes", "true");

  const heading = document.createElement("h2");
  heading.id = "dockit-print-endnotes-heading";
  heading.className = "dockit-print-endnotes-heading";
  heading.textContent = "미주";
  section.append(heading);

  endnotes.forEach(({ noteId, reference, body }, index) => {
    const number = index + 1;
    projectReference(document, reference, noteId, number);
    section.append(createProjectedBody(document, body, noteId, number));
  });

  endnotes.forEach(({ body }) => body.remove());
  document.body.append(section);
  return document.body.innerHTML;
};
