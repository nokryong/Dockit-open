import { zipSync } from "fflate";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { importDOCXToIR } from "../../app/LIB/ir/docxImport";
import { exportIRToMinimalDOCX, createDOCXMinimalExportInput } from "../../app/LIB/ir/docxMinimalExport";
import { fromProseMirrorDocToIR } from "../../app/LIB/ir/fromProseMirror";
import { importHWPXToIR } from "../../app/LIB/ir/hwpxImport";
import { exportIRToMinimalHWPX, createHWPXMinimalExportInput } from "../../app/LIB/ir/hwpxMinimalExport";
import { validateProseMirrorProjection } from "../../app/LIB/ir/proseMirrorProjectionValidation";
import { irToProseMirror } from "../../app/LIB/ir/toProseMirror";
import { validateNoteSemantics } from "../../app/LIB/utils/noteSemanticUtils";

const noteDoc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [
      { type: "text", text: "A" },
      { type: "noteReference", attrs: { noteId: "note-v1-foot", kind: "footnote" } },
      { type: "text", text: "B" },
      { type: "noteReference", attrs: { noteId: "note-v1-end", kind: "endnote" } }
    ] },
    { type: "noteBody", attrs: { noteId: "note-v1-foot", kind: "footnote" }, content: [
      { type: "paragraph", attrs: { fontSize: 11 }, content: [
        { type: "text", text: "foot", marks: [{ type: "bold" }] },
        { type: "hardBreak" },
        { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }
      ] }
    ] },
    { type: "noteBody", attrs: { noteId: "note-v1-end", kind: "endnote" }, content: [
      { type: "paragraph", content: [{ type: "text", text: "end", marks: [{ type: "italic" }] }] }
    ] }
  ]
};

const baseIR = () => fromProseMirrorDocToIR(noteDoc, { extractedAt: "2026-07-15T00:00:00.000Z" });
const docxBaseIR = () => {
  const ir = baseIR();
  ir.notes.forEach((note) => note.paragraphs.forEach((paragraph) => delete paragraph.attrs));
  return ir;
};
const expectCode = (action, code) => {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected error code ${code}.`);
};

describe("N5a common note IR boundaries", () => {
  it("roundtrips supported footnote/endnote pairs through IR without warnings or loss", () => {
    const ir = baseIR();
    const projection = irToProseMirror(ir);
    expect(ir.notes).toMatchObject([
      { noteId: "note-v1-foot", kind: "footnote", referenceOrder: 0 },
      { noteId: "note-v1-end", kind: "endnote", referenceOrder: 1 }
    ]);
    expect(ir.sections[0].blocks.map((block) => block.sourceBlockIndex)).toEqual([0]);
    expect(projection.warnings).toEqual([]);
    expect(projection.doc).toEqual(noteDoc);
    expect(validateNoteSemantics(projection.doc).valid).toBe(true);
    expect(validateProseMirrorProjection(projection.doc).valid).toBe(true);
  });

  it.each([
    ["dangling", { ...noteDoc, content: noteDoc.content.filter((node) => node.type !== "noteBody" || node.attrs.noteId !== "note-v1-end") }],
    ["orphan", { ...noteDoc, content: [...noteDoc.content, { type: "noteBody", attrs: { noteId: "note-v1-orphan", kind: "footnote" }, content: [{ type: "paragraph" }] }] }],
    ["duplicate", { ...noteDoc, content: [...noteDoc.content, noteDoc.content[1]] }],
    ["kind mismatch", { ...noteDoc, content: noteDoc.content.map((node) => node.type === "noteBody" && node.attrs.noteId === "note-v1-end" ? { ...node, attrs: { ...node.attrs, kind: "footnote" } } : node) }]
  ])("fails closed for %s PM note pairs", (_name, document) => {
    expectCode(() => fromProseMirrorDocToIR(document), "PM_NOTE_SEMANTICS_INVALID");
  });

  it("exports supported notes natively", () => {
    const ir = baseIR();
    expectCode(() => exportIRToMinimalDOCX(createDOCXMinimalExportInput(ir)), "DOCX_NOTE_EXPORT_PARAGRAPH_ATTR_UNSUPPORTED");
    expect(exportIRToMinimalDOCX(createDOCXMinimalExportInput(docxBaseIR())).entries.map((entry) => entry.path)).toEqual(expect.arrayContaining(["word/footnotes.xml", "word/endnotes.xml"]));
    const hwpxIR = docxBaseIR();
    const exported = exportIRToMinimalHWPX(createHWPXMinimalExportInput(hwpxIR));
    const entries = new Map(exported.entries.map((entry) => [entry.path, entry.content]));
    expect(String(entries.get("Contents/section0.xml"))).toContain("hp:footNote");
    expect(String(entries.get("Contents/section0.xml"))).toContain('numType="FOOTNOTE"');
    expect(String(entries.get("Contents/section0.xml"))).toContain('numType="ENDNOTE"');
  });

  it("roundtrips the DOCX native supported subset with part-local links", () => {
    const exported = exportIRToMinimalDOCX(createDOCXMinimalExportInput(docxBaseIR()));
    const entries = new Map(exported.entries.map((entry) => [entry.path, entry.content]));
    expect(String(entries.get("word/document.xml"))).toContain("w:footnoteReference");
    expect(String(entries.get("word/footnotes.xml"))).toContain("w:footnoteRef");
    expect(String(entries.get("word/_rels/footnotes.xml.rels"))).toContain("relationships/hyperlink");
    const imported = importDOCXToIR(exported.packageBytes, { extractedAt: "2026-07-15T00:00:00.000Z" });
    expect(imported.warnings.filter((item) => item.severity === "error")).toEqual([]);
    expect(imported.irDocument.notes).toMatchObject([
      { noteId: "note-v1-docx-footnote-1", kind: "footnote", referenceOrder: 0 },
      { noteId: "note-v1-docx-endnote-1", kind: "endnote", referenceOrder: 1 }
    ]);
    expect(imported.irDocument.sections[0].blocks[0].runs.filter((run) => run.type === "noteReference")).toMatchObject([
      { kind: "footnote", noteId: "note-v1-docx-footnote-1" },
      { kind: "endnote", noteId: "note-v1-docx-endnote-1" }
    ]);
  });

  it("roundtrips the HWPX native supported subset with independent kind numbers and global order", () => {
    const exported = exportIRToMinimalHWPX(createHWPXMinimalExportInput(docxBaseIR()));
    const imported = importHWPXToIR(exported.packageBytes, { inflateRaw: (bytes) => new Uint8Array(inflateRawSync(bytes)), extractedAt: "2026-07-15T00:00:00.000Z" });
    expect(imported.warnings.filter((item) => item.severity === "error")).toEqual([]);
    expect(imported.irDocument.notes).toMatchObject([
      { noteId: "note-v1-hwpx-footnote-1", kind: "footnote", referenceOrder: 0 },
      { noteId: "note-v1-hwpx-endnote-2", kind: "endnote", referenceOrder: 1 }
    ]);
    expect(imported.irDocument.sections[0].blocks[0].runs.filter((run) => run.type === "noteReference")).toMatchObject([
      { noteId: "note-v1-hwpx-footnote-1", kind: "footnote" },
      { noteId: "note-v1-hwpx-endnote-2", kind: "endnote" }
    ]);
  });

  it("fails closed before a partial ProseMirror projection for invalid IR pairs", () => {
    const ir = baseIR();
    const invalid = { ...ir, notes: ir.notes.map((note) => note.noteId === "note-v1-end" ? { ...note, kind: "footnote" } : note) };
    expectCode(() => irToProseMirror(invalid), "IR_NOTE_PAIR_MISMATCH");
  });

  it("reuses the canonical note payload guard for invalid IDs and unsafe links", () => {
    const invalidId = baseIR();
    invalidId.sections[0].blocks[0].runs[1].noteId = "invalid";
    invalidId.notes[0].noteId = "invalid";
    expectCode(() => irToProseMirror(invalidId), "IR_NOTE_CONTENT_INVALID");

    const unsafeLink = baseIR();
    unsafeLink.notes[0].paragraphs[0].runs[2].marks[0].attrs.href = "javascript:alert(1)";
    expectCode(() => irToProseMirror(unsafeLink), "IR_NOTE_CONTENT_INVALID");
  });

  it("flags malformed native note packages while no-note packages remain clean", () => {
    const docx = zipSync({
      "[Content_Types].xml": new TextEncoder().encode("<Types/>"),
      "_rels/.rels": new TextEncoder().encode("<Relationships/>"),
      "word/document.xml": new TextEncoder().encode("<w:document><w:body><w:footnoteReference w:id=\"1\"/></w:body></w:document>"),
      "word/footnotes.xml": new TextEncoder().encode("<w:footnotes/>")
    });
    expect(importDOCXToIR(docx).warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "docx-import-note-part-invalid", severity: "error" })]));
    const hwpx = zipSync({
      mimetype: new TextEncoder().encode("application/hwp+zip"),
      "Contents/content.hpf": new TextEncoder().encode("<opf:package/>"),
      "Contents/header.xml": new TextEncoder().encode("<hh:head/>"),
      "Contents/section0.xml": new TextEncoder().encode("<hp:sec><hp:footNote/></hp:sec>")
    });
    expect(importHWPXToIR(hwpx, { inflateRaw: (bytes) => new Uint8Array(inflateRawSync(bytes)) }).lossReport.entries).toEqual(expect.arrayContaining([expect.objectContaining({ code: "hwpx-import-note-structure-invalid", severity: "error" })]));
    const docxWithoutNotes = zipSync({
      "[Content_Types].xml": new TextEncoder().encode("<Types/>"),
      "_rels/.rels": new TextEncoder().encode("<Relationships/>"),
      "word/document.xml": new TextEncoder().encode("<w:document><w:body/></w:document>")
    });
    expect(importDOCXToIR(docxWithoutNotes).warnings.some((item) => item.severity === "error" && item.code.startsWith("docx-import-note-"))).toBe(false);
    const hwpxWithoutNotes = zipSync({
      mimetype: new TextEncoder().encode("application/hwp+zip"),
      "Contents/content.hpf": new TextEncoder().encode("<opf:package/>"),
      "Contents/header.xml": new TextEncoder().encode("<hh:head/>"),
      "Contents/section0.xml": new TextEncoder().encode("<hp:sec/>")
    });
    expect(importHWPXToIR(hwpxWithoutNotes, { inflateRaw: (bytes) => new Uint8Array(inflateRawSync(bytes)) }).lossReport.entries.some((item) => item.code.startsWith("hwpx-import-note-"))).toBe(false);
    const noNotes = fromProseMirrorDocToIR({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "plain" }] }] });
    expect(exportIRToMinimalDOCX(createDOCXMinimalExportInput(noNotes)).packageBytes).toBeInstanceOf(Uint8Array);
    expect(exportIRToMinimalHWPX(createHWPXMinimalExportInput(noNotes)).packageBytes).toBeInstanceOf(Uint8Array);
  });
});
