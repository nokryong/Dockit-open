import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const textRun = (text, marks = []) => ({ type: "textRun", text, marks });
const noteReference = (noteId, kind) => ({ type: "noteReference", noteId, kind });
const paragraph = (runs) => ({ type: "paragraph", attrs: {}, runs });
const noteParagraph = (runs = []) => ({ type: "paragraph", runs });

export const createNativeNoteInteroperabilityCorpusIR = () => ({
  type: "document",
  version: "ir-v1.1-draft",
  metadata: {
    extractedAt: "2026-07-15T00:00:00.000Z",
    extractorVersion: "n5d-native-note-corpus",
    source: { editor: "dockit", mode: "editor-json" },
    warnings: []
  },
  sections: [{
    type: "section", id: "section-n5d", breakType: "continuous", pageSettings: {},
    blocks: [
      paragraph([
        textRun("__N5D_MAIN_TOP__ "),
        noteReference("note-v1-corpus-foot-1", "footnote"),
        textRun(" between "),
        noteReference("note-v1-corpus-end-1", "endnote"),
        textRun(" after")
      ]),
      {
        type: "table", attrs: {}, rows: [{ type: "tableRow", attrs: {}, cells: [{
          type: "tableCell", role: "cell", attrs: {}, blocks: [paragraph([
            textRun("__N5D_MAIN_CELL__ "),
            noteReference("note-v1-corpus-foot-2", "footnote"),
            textRun(" cell-tail")
          ])]
        }] }]
      }
    ]
  }],
  notes: [
    {
      noteId: "note-v1-corpus-foot-1", kind: "footnote", referenceOrder: 0,
      paragraphs: [
        noteParagraph([
          textRun("__N5D_NOTE_ONLY__ bold", [{ type: "bold" }]),
          textRun(" italic", [{ type: "italic" }]),
          textRun(" underline", [{ type: "underline" }]),
          textRun(" strike", [{ type: "strike" }]),
          textRun(" sub", [{ type: "subscript" }]),
          textRun(" super", [{ type: "superscript" }]),
          { type: "hardBreak" },
          textRun(" color", [{ type: "textStyle", attrs: { color: "#336699" } }]),
          textRun(" http", [{ type: "link", attrs: { href: "http://example.com/n5d" } }]),
          textRun(" https", [{ type: "link", attrs: { href: "https://example.com/n5d" } }]),
          textRun(" mail", [{ type: "link", attrs: { href: "mailto:n5d@example.com" } }])
        ]),
        noteParagraph(),
        noteParagraph([textRun("__N5D_NOTE_SECOND__")])
      ]
    },
    {
      noteId: "note-v1-corpus-end-1", kind: "endnote", referenceOrder: 1,
      paragraphs: [noteParagraph([textRun("__N5D_ENDNOTE_ONLY__")])]
    },
    {
      noteId: "note-v1-corpus-foot-2", kind: "footnote", referenceOrder: 2,
      paragraphs: [noteParagraph([textRun("__N5D_CELL_NOTE_ONLY__")])]
    }
  ]
});

const canonicalMarks = (marks = []) => marks.map((mark) => ({
  type: mark.type,
  ...(mark.attrs ? { attrs: mark.attrs } : {})
}));

const canonicalRuns = (runs = [], noteIndexes) => runs.map((run) => {
  if (run.type === "noteReference") {
    const noteIndex = noteIndexes.get(run.noteId);
    if (!Number.isInteger(noteIndex)) {
      throw new Error(`Native note corpus reference has no body: ${run.noteId}`);
    }
    return { type: "noteReference", kind: run.kind, noteIndex };
  }
  if (run.type === "hardBreak") return { type: "hardBreak" };
  return { type: "textRun", text: run.text, marks: canonicalMarks(run.marks) };
});

const projectBlock = (block, noteIndexes, placement) => {
  if (block.type === "paragraph" || block.type === "heading") {
    return [{ placement, type: block.type, runs: canonicalRuns(block.runs, noteIndexes) }];
  }
  if (block.type === "table") {
    return block.rows.flatMap((row, rowIndex) => row.cells.flatMap((cell, cellIndex) =>
      cell.blocks.flatMap((cellBlock, blockIndex) => projectBlock(
        cellBlock,
        noteIndexes,
        `${placement}:table:${rowIndex}:${cellIndex}:${blockIndex}`
      ))
    ));
  }
  return [];
};

export const projectNativeNoteSemantics = (irDocument) => {
  const notes = [...(irDocument.notes || [])].sort(
    (left, right) => left.referenceOrder - right.referenceOrder
  );
  const noteIndexes = new Map(notes.map((note, index) => [note.noteId, index]));
  const main = irDocument.sections.flatMap((section, sectionIndex) =>
    section.blocks.flatMap((block, blockIndex) => projectBlock(
      block, noteIndexes, `section:${sectionIndex}:block:${blockIndex}`
    ))
  );
  return {
    main,
    mainText: main.flatMap((block) => block.runs)
      .filter((run) => run.type === "textRun")
      .map((run) => run.text).join(""),
    notes: notes.map((note) => ({
      kind: note.kind,
      referenceOrder: note.referenceOrder,
      paragraphs: note.paragraphs.map((paragraphValue) => ({
        runs: canonicalRuns(paragraphValue.runs, noteIndexes)
      }))
    }))
  };
};

export const buildNativeNoteCorpusManifest = ({
  docxBytes,
  hwpxBytes,
  semantics
}) => ({
    schema: "dockit-native-note-corpus-v1",
    files: {
      "native-note-corpus.docx": createHash("sha256").update(docxBytes).digest("hex"),
      "native-note-corpus.hwpx": createHash("sha256").update(hwpxBytes).digest("hex")
    },
    expectedSemantics: semantics
  });

export const writeNativeNoteCorpusArtifacts = ({ docxBytes, hwpxBytes, semantics }) => {
  const output = process.env.NATIVE_NOTE_CORPUS_OUT;
  if (!output) return;
  const directory = resolve(output);
  mkdirSync(directory, { recursive: true });
  const manifest = buildNativeNoteCorpusManifest({
    docxBytes,
    hwpxBytes,
    semantics
  });
  writeFileSync(resolve(directory, "native-note-corpus.docx"), docxBytes);
  writeFileSync(resolve(directory, "native-note-corpus.hwpx"), hwpxBytes);
  writeFileSync(resolve(directory, "native-note-corpus.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
};
