const FOOTNOTE_BODY_SELECTOR = '[data-dockit-note-body="true"][data-dockit-note-kind="footnote"]';

const copyComputedStyles = (source, target) => {
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return;
  const sourceElements = [source, ...source.querySelectorAll("*")];
  const targetElements = [target, ...target.querySelectorAll("*")];
  if (sourceElements.length !== targetElements.length) throw new Error("FOOTNOTE_PROJECTION_STYLE_TREE_MISMATCH");
  sourceElements.forEach((element, index) => {
    const styles = window.getComputedStyle(element);
    for (let propertyIndex = 0; propertyIndex < styles.length; propertyIndex += 1) {
      const property = styles[propertyIndex];
      targetElements[index].style.setProperty(property, styles.getPropertyValue(property));
    }
  });
};

const normalizeProjectedBodyClone = (root) => {
  root.removeAttribute("data-dockit-footnote-projection-canonical");
  [
    "position",
    "z-index",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
    "height",
    "min-height",
    "max-height",
    "overflow",
    "transform"
  ].forEach((property) => root.style.removeProperty(property));
  root.style.removeProperty("--dockit-footnote-canonical-fragment-height");
};

const sanitizeVisualClone = (root) => {
  [root, ...root.querySelectorAll("*")].forEach((element) => {
    element.removeAttribute("id");
    element.removeAttribute("contenteditable");
    element.removeAttribute("data-dockit-note-body");
    element.removeAttribute("data-dockit-note-id");
    element.removeAttribute("data-dockit-note-kind");
    element.removeAttribute("role");
    element.removeAttribute("aria-label");
    element.removeAttribute("aria-describedby");
    element.removeAttribute("aria-labelledby");
    element.removeAttribute("tabindex");
    element.removeAttribute("autofocus");
    element.removeAttribute("name");
    [...element.attributes]
      .filter((attribute) => attribute.name.toLowerCase().startsWith("on"))
      .forEach((attribute) => element.removeAttribute(attribute.name));
    element.style.setProperty("pointer-events", "none", "important");
    element.style.setProperty("user-select", "none", "important");
  });
  root.querySelectorAll("button,input,textarea,select").forEach((control) => control.remove());
  root.querySelectorAll("a").forEach((anchor) => {
    anchor.removeAttribute("href");
    anchor.removeAttribute("target");
    anchor.removeAttribute("download");
    anchor.removeAttribute("rel");
  });
  root.style.margin = "0";
  root.removeAttribute("data-dockit-footnote-projected");
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("inert", "");
};

const isSafeExternalHref = (href) => {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
};

// Print keeps readable rich inline content and ordinary safe links, but never
// clones a live NodeView's controls, identity, or editing affordances.
const sanitizePrintClone = (root) => {
  [root, ...root.querySelectorAll("*")].forEach((element) => {
    element.removeAttribute("id");
    element.removeAttribute("contenteditable");
    element.removeAttribute("data-dockit-note-body");
    element.removeAttribute("data-dockit-note-id");
    element.removeAttribute("data-dockit-note-kind");
    element.removeAttribute("tabindex");
    element.removeAttribute("autofocus");
    element.removeAttribute("name");
    element.removeAttribute("inert");
    element.removeAttribute("aria-hidden");
    [...element.attributes]
      .filter((attribute) => attribute.name.toLowerCase().startsWith("on"))
      .forEach((attribute) => element.removeAttribute(attribute.name));
  });
  root.querySelectorAll("button,input,textarea,select").forEach((control) => control.remove());
  root.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href || !isSafeExternalHref(href)) anchor.removeAttribute("href");
    anchor.removeAttribute("target");
    anchor.removeAttribute("download");
    anchor.removeAttribute("rel");
  });
  root.style.margin = "0";
  root.removeAttribute("data-dockit-footnote-projected");
  root.setAttribute("role", "doc-footnote");
  root.setAttribute("aria-label", "각주");
};

const fragmentOffsets = (fragments = []) => {
  const offsets = [0];
  fragments.forEach((fragment) => offsets.push(offsets.at(-1) + fragment.measuredHeight));
  return offsets;
};

/**
 * Transient screen-only data. Unlike candidates/PageMaps it intentionally
 * holds a complete sanitized visual body clone, never serialised or planned.
 */
export const buildFootnoteScreenProjection = ({ view, candidate, footnoteLayout }) => {
  if (candidate?.status !== "ok" || !footnoteLayout?.segments?.length || !view?.dom?.querySelectorAll) return null;

  const bodies = new Map([...view.dom.querySelectorAll(FOOTNOTE_BODY_SELECTOR)].map((body) => [body.getAttribute("data-dockit-note-id"), body]));
  const measurements = new Map((candidate.footnotes || []).map((footnote) => [footnote.body.noteId, footnote.body]));
  const visualClones = new Map();
  const printClones = new Map();

  try {
    const firstSegmentByNoteId = new Map();
    footnoteLayout.segments.forEach((segment) => {
      const previous = firstSegmentByNoteId.get(segment.noteId);
      if (!previous || segment.segmentIndex < previous.segmentIndex) {
        firstSegmentByNoteId.set(segment.noteId, segment);
      }
    });

    const segments = footnoteLayout.segments.map((segment) => {
      const source = bodies.get(segment.noteId);
      const measurement = measurements.get(segment.noteId);
      if (!source || !measurement?.fragments?.length) throw new Error("MISSING_FOOTNOTE_PROJECTION_SOURCE");
      const canonical = firstSegmentByNoteId.get(segment.noteId) === segment;
      let clone = visualClones.get(segment.noteId);
      if (!canonical && !clone) {
        clone = source.cloneNode(true);
        copyComputedStyles(source, clone);
        normalizeProjectedBodyClone(clone);
        const sourceRect = source.getBoundingClientRect?.();
        const sourceWidth = source.offsetWidth || sourceRect?.width;
        if (!(sourceWidth > 0)) throw new Error("INVALID_FOOTNOTE_PROJECTION_WIDTH");
        sanitizeVisualClone(clone);
        clone.style.width = `${sourceWidth}px`;
        clone.style.minWidth = `${sourceWidth}px`;
        clone.style.maxWidth = `${sourceWidth}px`;
        clone.style.boxSizing = "border-box";
        visualClones.set(segment.noteId, clone);
      }
      let printClone = printClones.get(segment.noteId);
      if (!printClone) {
        printClone = source.cloneNode(true);
        copyComputedStyles(source, printClone);
        normalizeProjectedBodyClone(printClone);
        sanitizePrintClone(printClone);
        printClone.style.width = "100%";
        printClone.style.boxSizing = "border-box";
        printClones.set(segment.noteId, printClone);
      }
      const offsets = fragmentOffsets(measurement.fragments);
      const start = segment.fragmentStartIndex;
      const end = segment.fragmentEndIndex;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end >= offsets.length) throw new Error("INVALID_FOOTNOTE_PROJECTION_FRAGMENT_RANGE");
      return Object.freeze({
        noteId: segment.noteId,
        pageNumber: segment.pageNumber,
        referenceOrder: segment.referenceOrder,
        segmentIndex: segment.segmentIndex,
        continuation: segment.continuation,
        continuationFromPreviousLabel: segment.continuationFromPreviousLabel,
        continuationToNextLabel: segment.continuationToNextLabel,
        canonical,
        height: offsets[end] - offsets[start],
        offsetTop: offsets[start],
        clone,
        printClone
      });
    });
    return Object.freeze({ status: "stable", segments: Object.freeze(segments) });
  } catch {
    return null;
  }
};
