import { validateNoteSemantics } from "../utils/noteSemanticUtils";
import type {
  IRBlock,
  IRDocument,
  IRInlineNode,
  IRNoteBody,
  IRNoteInlineNode,
  IRNoteKind
} from "./types";

export class IRNoteCompatibilityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IRNoteCompatibilityError";
    this.code = code;
  }
}

const isNoteKind = (value: unknown): value is IRNoteKind =>
  value === "footnote" || value === "endnote";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isStructurallyValidNoteInline = (
  inline: unknown
): inline is IRNoteInlineNode => {
  if (!isRecord(inline)) return false;
  if (inline.type === "hardBreak") return true;

  return (
    inline.type === "textRun" &&
    typeof inline.text === "string" &&
    Array.isArray(inline.marks) &&
    inline.marks.every(
      (mark) =>
        isRecord(mark) &&
        typeof mark.type === "string" &&
        (mark.attrs === undefined || isRecord(mark.attrs))
    )
  );
};

const toProseMirrorNoteInline = (inline: Readonly<IRNoteInlineNode>) => {
  if (inline.type === "hardBreak") {
    return { type: "hardBreak" };
  }

  return {
    type: "text",
    text: inline.text,
    ...(inline.marks.length
      ? {
          marks: inline.marks.map((mark) => ({
            type: mark.type,
            ...(mark.attrs && Object.keys(mark.attrs).length
              ? { attrs: mark.attrs }
              : {})
          }))
        }
      : {})
  };
};

const collectReferencesFromInlines = (
  inlines: readonly IRInlineNode[],
  references: { noteId: string; kind: IRNoteKind }[]
) => {
  inlines.forEach((inline) => {
    if (inline.type === "noteReference") {
      references.push({ noteId: inline.noteId, kind: inline.kind });
    }
  });
};

const collectReferencesFromBlocks = (
  blocks: readonly IRBlock[],
  references: { noteId: string; kind: IRNoteKind }[]
) => {
  blocks.forEach((block) => {
    switch (block.type) {
      case "paragraph":
      case "heading":
        collectReferencesFromInlines(block.runs, references);
        break;
      case "list":
        block.items.forEach((item) => collectReferencesFromBlocks(item.blocks, references));
        break;
      case "table":
        block.rows.forEach((row) =>
          row.cells.forEach((cell) => collectReferencesFromBlocks(cell.blocks, references))
        );
        break;
      case "object":
        collectReferencesFromBlocks(block.children ?? [], references);
        break;
    }
  });
};

export const getIRNoteReferences = (irDocument: Readonly<IRDocument>) => {
  const references: { noteId: string; kind: IRNoteKind }[] = [];
  irDocument.sections.forEach((section) =>
    collectReferencesFromBlocks(section.blocks, references)
  );
  return references;
};

export const assertValidIRNoteSemantics = (irDocument: Readonly<IRDocument>) => {
  const references = getIRNoteReferences(irDocument);
  if (irDocument.notes !== undefined && !Array.isArray(irDocument.notes)) {
    throw new IRNoteCompatibilityError(
      "IR_NOTE_INVALID_BODY",
      "IR document notes must be an array when present."
    );
  }

  const notes = irDocument.notes ?? [];

  if (!references.length && !notes.length) return;

  const bodyById = new Map<string, Readonly<IRNoteBody>>();
  notes.forEach((note) => {
    if (!note || typeof note.noteId !== "string" || !isNoteKind(note.kind)) {
      throw new IRNoteCompatibilityError("IR_NOTE_INVALID_BODY", "IR note body has an invalid noteId or kind.");
    }
    if (bodyById.has(note.noteId)) {
      throw new IRNoteCompatibilityError("IR_NOTE_DUPLICATE_BODY", `IR note body is duplicated: ${note.noteId}.`);
    }
    if (
      !Number.isSafeInteger(note.referenceOrder) ||
      note.referenceOrder < 0 ||
      !Array.isArray(note.paragraphs) ||
      !note.paragraphs.length
    ) {
      throw new IRNoteCompatibilityError("IR_NOTE_INVALID_BODY", `IR note body is structurally invalid: ${note.noteId}.`);
    }
    if (
      note.paragraphs.some(
        (paragraph) =>
          !isRecord(paragraph) ||
          paragraph.type !== "paragraph" ||
          (paragraph.attrs !== undefined && !isRecord(paragraph.attrs)) ||
          !Array.isArray(paragraph.runs) ||
          !paragraph.runs.every(isStructurallyValidNoteInline)
      )
    ) {
      throw new IRNoteCompatibilityError("IR_NOTE_INVALID_BODY", `IR note body contains unsupported inline content: ${note.noteId}.`);
    }
    bodyById.set(note.noteId, note);
  });

  const seenReferences = new Set<string>();
  references.forEach((reference, index) => {
    if (!reference.noteId || !isNoteKind(reference.kind)) {
      throw new IRNoteCompatibilityError("IR_NOTE_INVALID_REFERENCE", "IR note reference has an invalid noteId or kind.");
    }
    if (seenReferences.has(reference.noteId)) {
      throw new IRNoteCompatibilityError("IR_NOTE_DUPLICATE_REFERENCE", `IR note reference is duplicated: ${reference.noteId}.`);
    }
    seenReferences.add(reference.noteId);
    const body = bodyById.get(reference.noteId);
    if (!body) {
      throw new IRNoteCompatibilityError("IR_NOTE_DANGLING_REFERENCE", `IR note reference has no body: ${reference.noteId}.`);
    }
    if (body.kind !== reference.kind || body.referenceOrder !== index) {
      throw new IRNoteCompatibilityError("IR_NOTE_PAIR_MISMATCH", `IR note pair does not match: ${reference.noteId}.`);
    }
  });

  bodyById.forEach((body, noteId) => {
    if (!seenReferences.has(noteId)) {
      throw new IRNoteCompatibilityError("IR_NOTE_ORPHAN_BODY", `IR note body has no reference: ${noteId}.`);
    }
  });

  const canonicalValidation = validateNoteSemantics({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: references.map((reference) => ({
          type: "noteReference",
          attrs: { noteId: reference.noteId, kind: reference.kind }
        }))
      },
      ...notes.map((note) => ({
        type: "noteBody",
        attrs: { noteId: note.noteId, kind: note.kind },
        content: note.paragraphs.map((paragraph) => ({
          type: "paragraph",
          ...(paragraph.attrs && Object.keys(paragraph.attrs).length
            ? { attrs: paragraph.attrs }
            : {}),
          ...(paragraph.runs.length
            ? { content: paragraph.runs.map(toProseMirrorNoteInline) }
            : {})
        }))
      }))
    ]
  });

  if (!canonicalValidation.valid) {
    throw new IRNoteCompatibilityError(
      "IR_NOTE_CONTENT_INVALID",
      `IR note payload violates the canonical note contract: ${canonicalValidation.errors
        .map((error) => error.code)
        .join(", ")}.`
    );
  }
};

export const assertIRHasNoNotesForNativeExport = (
  irDocument: Readonly<IRDocument>,
  format: "DOCX" | "HWPX"
) => {
  if (getIRNoteReferences(irDocument).length || (irDocument.notes?.length ?? 0)) {
    throw new IRNoteCompatibilityError(
      `${format}_NOTE_EXPORT_UNSUPPORTED`,
      `${format} note export is not available until native note adapters are implemented.`
    );
  }
};
