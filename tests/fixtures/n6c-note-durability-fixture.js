const humanMarkers = Object.freeze(
  Array.from({ length: 10 }, (_, index) => `N6C-HUMAN-${index + 1}`)
);
const aiMarkers = Object.freeze(
  Array.from({ length: 10 }, (_, index) => `N6C-AI-${index + 1}`)
);

const noteIds = Object.freeze({
  footnote: "note-v1-n6c-footnote",
  auxiliaryFootnote: "note-v1-n6c-auxiliary-footnote",
  initialEndnote: "note-v1-n6c-endnote",
  aiInsertedEndnote: "note-v1-n6c-ai-inserted-endnote",
  aiDeletedFootnote: "note-v1-n6c-ai-deleted-footnote",
  aiFinalFootnote: "note-v1-n6c-ai-final-footnote",
  manualFootnote: "note-v1-n6c-manual-footnote"
});

export const N6C_FINAL_NOTE_BODIES = Object.freeze([
  Object.freeze({
    noteId: noteIds.footnote,
    kind: "endnote",
    text: aiMarkers[0]
  }),
  Object.freeze({
    noteId: noteIds.auxiliaryFootnote,
    kind: "footnote",
    text: `${humanMarkers[5]}: approved human edit`
  }),
  Object.freeze({
    noteId: noteIds.aiInsertedEndnote,
    kind: "endnote",
    text: `${aiMarkers[1]} | ${aiMarkers[2]} | ${aiMarkers[7]}`
  }),
  Object.freeze({
    noteId: noteIds.manualFootnote,
    kind: "footnote",
    text: `${humanMarkers[8]}: approved human edit | ${humanMarkers[9]}: approved human edit`
  }),
  Object.freeze({
    noteId: noteIds.aiFinalFootnote,
    kind: "footnote",
    text: [aiMarkers[3], aiMarkers[4], aiMarkers[5], aiMarkers[6], aiMarkers[8], aiMarkers[9]].join(" | ")
  })
]);

export const N6C_FINAL_NUMBERING = Object.freeze([
  Object.freeze({ noteId: noteIds.auxiliaryFootnote, kind: "footnote", number: 1 }),
  Object.freeze({ noteId: noteIds.aiInsertedEndnote, kind: "endnote", number: 1 }),
  Object.freeze({ noteId: noteIds.manualFootnote, kind: "footnote", number: 2 }),
  Object.freeze({ noteId: noteIds.aiFinalFootnote, kind: "footnote", number: 3 }),
  Object.freeze({ noteId: noteIds.footnote, kind: "endnote", number: 2 })
]);

export const N6C_NOTE_DURABILITY_FIXTURE = Object.freeze({
  uid: "user:n6c",
  documentId: "doc:n6c-durability",
  noteIds,
  protectedMarkers: Object.freeze({
    ordinary: "N6C-PROTECTED-ORDINARY",
    table: "N6C-PROTECTED-TABLE",
    chart: "N6C-PROTECTED-CHART",
    style: "N6C-PROTECTED-STYLE"
  }),
  insertionHosts: Object.freeze({
    aiFirst: "N6C-AI-INSERT-HOST-1",
    aiDeleted: "N6C-AI-INSERT-HOST-2",
    aiFinal: "N6C-AI-INSERT-HOST-3",
    manual: "N6C-MANUAL-INSERT-HOST"
  }),
  humanMarkers,
  aiMarkers,
  finalNoteBodies: N6C_FINAL_NOTE_BODIES,
  finalNumbering: N6C_FINAL_NUMBERING
});
