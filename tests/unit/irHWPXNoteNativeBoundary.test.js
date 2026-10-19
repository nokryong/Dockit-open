import { unzipSync, zipSync } from "fflate";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { fromProseMirrorDocToIR } from "../../app/LIB/ir/fromProseMirror";
import {
  importHWPXToIR,
  readHWPXPackageFromBytes
} from "../../app/LIB/ir/hwpxImport";
import {
  createHWPXMinimalExportInput,
  exportIRToMinimalHWPX
} from "../../app/LIB/ir/hwpxMinimalExport";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const inflateRaw = (bytes) => new Uint8Array(inflateRawSync(bytes));

const noteReference = (noteId, kind) => ({
  type: "noteReference",
  attrs: { noteId, kind }
});

const noteBody = (noteId, kind, content) => ({
  type: "noteBody",
  attrs: { noteId, kind },
  content
});

const noteDocument = () => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "before " },
        noteReference("note-v1-foot-1", "footnote"),
        { type: "text", text: " middle " },
        noteReference("note-v1-end-1", "endnote"),
        { type: "text", text: " after " },
        noteReference("note-v1-foot-2", "footnote")
      ]
    },
    noteBody("note-v1-foot-1", "footnote", [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "bold", marks: [{ type: "bold" }] },
          { type: "text", text: " italic", marks: [{ type: "italic" }] },
          { type: "text", text: " underline", marks: [{ type: "underline" }] },
          { type: "text", text: " strike", marks: [{ type: "strike" }] },
          { type: "text", text: " sub", marks: [{ type: "subscript" }] },
          { type: "text", text: " super", marks: [{ type: "superscript" }] },
          { type: "hardBreak" },
          { type: "text", text: "color", marks: [{ type: "textStyle", attrs: { color: "#336699" } }] },
          { type: "text", text: " http", marks: [{ type: "link", attrs: { href: "http://example.com" } }] },
          { type: "text", text: " https", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
          { type: "text", text: " mail", marks: [{ type: "link", attrs: { href: "mailto:notes@example.com" } }] }
        ]
      },
      { type: "paragraph" }
    ]),
    noteBody("note-v1-end-1", "endnote", [
      { type: "paragraph", content: [{ type: "text", text: "endnote body" }] },
      { type: "paragraph" }
    ]),
    noteBody("note-v1-foot-2", "footnote", [
      { type: "paragraph", content: [{ type: "text", text: "second footnote" }] }
    ])
  ]
});

const noteIR = () => fromProseMirrorDocToIR(noteDocument(), {
  extractedAt: "2026-07-15T00:00:00.000Z"
});

const exportNotes = (ir = noteIR()) =>
  exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));

const sectionXml = (result) => String(
  result.entries.find((entry) => entry.path === "Contents/section0.xml").content
);

const packageWithSection = (result, transform) => {
  const entries = unzipSync(result.packageBytes, { inflateRaw });
  entries["Contents/section0.xml"] = encoder.encode(transform(decoder.decode(entries["Contents/section0.xml"])));
  return zipSync(entries);
};

const packageWithEntry = (result, path, transform) => {
  const entries = unzipSync(result.packageBytes, { inflateRaw });
  entries[path] = encoder.encode(transform(decoder.decode(entries[path])));
  return zipSync(entries);
};

const importPackage = (bytes) => importHWPXToIR(bytes, {
  inflateRaw,
  extractedAt: "2026-07-15T00:00:00.000Z"
});

const noteErrors = (result) => result.lossReport.entries.filter(
  (entry) => entry.severity === "error" && entry.code.startsWith("hwpx-import-note-")
);

const expectExportCode = (ir, code) => {
  try {
    exportNotes(ir);
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected export error ${code}.`);
};

const expectImportCode = (bytes, code) => {
  expect(noteErrors(importPackage(bytes))).toEqual(expect.arrayContaining([
    expect.objectContaining({ code })
  ]));
};

const mutateFirstNoteXml = (xml, tag, update) => xml.replace(
  new RegExp(`<hp:${tag}\\b[\\s\\S]*?</hp:${tag}>`),
  update
);

describe("Phase D N5c native HWPX note boundaries", () => {
  it("exports each reference as run > ctrl > note > one exact subList, with instId only", () => {
    const xml = sectionXml(exportNotes());
    const noteElements = [...xml.matchAll(/<hp:(footNote|endNote)\b([^>]*)>([\s\S]*?)<\/hp:\1>/g)];

    expect(noteElements).toHaveLength(3);
    noteElements.forEach(([, kind, attrs, body]) => {
      expect(attrs).toMatch(/\binstId="[1-9]\d*"/);
      expect(attrs).not.toMatch(/\bid=/);
      expect(body.match(/<hp:subList\b/g)).toHaveLength(1);
      expect(body).toContain('<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">');
      expect(xml).toContain(`<hp:ctrl><hp:${kind}`);
    });
  });

  it("keeps display numbering per kind while instId stays in global reference order", () => {
    const xml = sectionXml(exportNotes());
    const observed = [...xml.matchAll(/<hp:(footNote|endNote)\b([^>]*)>[\s\S]*?<hp:autoNum num="(\d+)" numType="([A-Z]+)"/g)]
      .map(([, tag, attrs, number, numType]) => ({
        kind: tag === "footNote" ? "footnote" : "endnote",
        instId: Number(/\binstId="(\d+)"/.exec(attrs)[1]),
        number: Number(number),
        numType
      }));

    expect(observed).toEqual([
      { kind: "footnote", instId: 1, number: 1, numType: "FOOTNOTE" },
      { kind: "endnote", instId: 2, number: 1, numType: "ENDNOTE" },
      { kind: "footnote", instId: 3, number: 2, numType: "FOOTNOTE" }
    ]);
  });

  it("roundtrips supported note bodies without copying their text into main flow", () => {
    const imported = importPackage(exportNotes().packageBytes);
    const mainText = imported.irDocument.sections[0].blocks
      .flatMap((block) => block.runs || [])
      .filter((run) => run.type === "textRun")
      .map((run) => run.text)
      .join("");
    const first = imported.irDocument.notes.find((note) => note.noteId.endsWith("footnote-1"));

    expect(noteErrors(imported)).toEqual([]);
    expect(imported.irDocument.notes).toMatchObject([
      { kind: "footnote", referenceOrder: 0 },
      { kind: "endnote", referenceOrder: 1 },
      { kind: "footnote", referenceOrder: 2 }
    ]);
    expect(mainText).toContain("before  middle  after ");
    expect(mainText).not.toContain("second footnote");
    expect(first.paragraphs).toHaveLength(2);
    expect(first.paragraphs[1].runs).toEqual([]);
    expect(first.paragraphs[0].runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "hardBreak" }),
      expect.objectContaining({ type: "textRun", marks: expect.arrayContaining([{ type: "bold" }]) }),
      expect.objectContaining({ type: "textRun", marks: expect.arrayContaining([{ type: "italic" }]) }),
      expect.objectContaining({ type: "textRun", marks: expect.arrayContaining([{ type: "underline" }]) }),
      expect.objectContaining({ type: "textRun", marks: expect.arrayContaining([{ type: "strike" }]) }),
      expect.objectContaining({ type: "textRun", marks: expect.arrayContaining([{ type: "subscript" }]) }),
      expect.objectContaining({ type: "textRun", marks: expect.arrayContaining([{ type: "superscript" }]) }),
      expect.objectContaining({ type: "textRun", marks: expect.arrayContaining([{ type: "textStyle", attrs: { color: "#336699" } }]) }),
      expect.objectContaining({ type: "textRun", marks: expect.arrayContaining([{ type: "link", attrs: { href: "http://example.com" } }]) }),
      expect.objectContaining({ type: "textRun", marks: expect.arrayContaining([{ type: "link", attrs: { href: "https://example.com" } }]) }),
      expect.objectContaining({ type: "textRun", marks: expect.arrayContaining([{ type: "link", attrs: { href: "mailto:notes@example.com" } }]) })
    ]));
  });

  it("preserves a supported table-cell reference in global document order", () => {
    const ir = noteIR();
    const reference = ir.sections[0].blocks[0].runs.splice(1, 1)[0];
    ir.sections[0].blocks.unshift({
      type: "table",
      attrs: {},
      rows: [{
        type: "tableRow",
        attrs: {},
        cells: [{
          type: "tableCell",
          role: "cell",
          attrs: {},
          blocks: [{ type: "paragraph", attrs: {}, runs: [reference] }]
        }]
      }]
    });

    const imported = importPackage(exportNotes(ir).packageBytes);
    const table = imported.irDocument.sections[0].blocks.find(
      (block) => block.type === "table"
    );
    expect(noteErrors(imported)).toEqual([]);
    expect(table.rows[0].cells[0].blocks[0].runs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "noteReference",
        noteId: "note-v1-hwpx-footnote-1"
      })
    ]));
    expect(imported.irDocument.notes).toMatchObject([
      { kind: "footnote", referenceOrder: 0 },
      { kind: "endnote", referenceOrder: 1 },
      { kind: "footnote", referenceOrder: 2 }
    ]);
  });

  it("fails closed before package bytes for unsupported note export shapes", () => {
    const mutate = (change) => {
      const ir = noteIR();
      change(ir);
      return ir;
    };

    expectExportCode(
      mutate((ir) => { ir.notes[0].paragraphs[0].attrs = { textAlign: "center" }; }),
      "HWPX_NOTE_EXPORT_PARAGRAPH_ATTR_UNSUPPORTED"
    );
    expectExportCode(
      mutate((ir) => { ir.notes[0].paragraphs[0].runs[0].marks.push({ type: "bold" }); }),
      "HWPX_NOTE_EXPORT_MARK_UNSUPPORTED"
    );
    expectExportCode(
      mutate((ir) => { ir.notes[0].paragraphs[0].runs[0].marks.push({ type: "subscript" }, { type: "superscript" }); }),
      "HWPX_NOTE_EXPORT_MARK_UNSUPPORTED"
    );
    expectExportCode(
      mutate((ir) => { ir.notes[0].paragraphs[0].runs[0].marks = [{ type: "link", attrs: { href: "javascript:alert(1)" } }]; }),
      "IR_NOTE_CONTENT_INVALID"
    );
    expectExportCode(
      mutate((ir) => { ir.notes[0].paragraphs[0].runs[0].marks = [{ type: "textStyle", attrs: { color: "red" } }]; }),
      "HWPX_NOTE_EXPORT_MARK_UNSUPPORTED"
    );
    expectExportCode(
      mutate((ir) => { ir.notes[0].paragraphs[0].runs[0].marks = [{ type: "textStyle", attrs: {} }]; }),
      "HWPX_NOTE_EXPORT_MARK_UNSUPPORTED"
    );

    const objectIR = mutate((ir) => {
      const reference = ir.sections[0].blocks[0].runs.splice(1, 1)[0];
      ir.sections[0].blocks.unshift({
        type: "object",
        objectType: "group",
        attrs: {},
        children: [{ type: "paragraph", attrs: {}, runs: [reference] }]
      });
    });
    expectExportCode(
      objectIR,
      "HWPX_NOTE_EXPORT_REFERENCE_CONTEXT_UNSUPPORTED"
    );

    const listIR = mutate((ir) => {
      const reference = ir.sections[0].blocks[0].runs.splice(1, 1)[0];
      ir.sections[0].blocks.unshift({
        type: "list",
        listType: "bullet",
        attrs: {},
        items: [{
          type: "listItem",
          attrs: {},
          blocks: [{ type: "paragraph", attrs: {}, runs: [reference] }]
        }]
      });
    });
    expectExportCode(
      listIR,
      "HWPX_NOTE_EXPORT_REFERENCE_CONTEXT_UNSUPPORTED"
    );

    const nestedTableIR = mutate((ir) => {
      const reference = ir.sections[0].blocks[0].runs.splice(1, 1)[0];
      ir.sections[0].blocks.unshift({
        type: "table",
        attrs: {},
        rows: [{
          type: "tableRow",
          attrs: {},
          cells: [{
            type: "tableCell",
            role: "cell",
            attrs: {},
            blocks: [{
              type: "table",
              attrs: {},
              rows: [{
                type: "tableRow",
                attrs: {},
                cells: [{
                  type: "tableCell",
                  role: "cell",
                  attrs: {},
                  blocks: [{ type: "paragraph", attrs: {}, runs: [reference] }]
                }]
              }]
            }]
          }]
        }]
      });
    });
    expectExportCode(
      nestedTableIR,
      "HWPX_NOTE_EXPORT_REFERENCE_CONTEXT_UNSUPPORTED"
    );
  });

  it.each([
    ["missing subList", (xml) => xml.replace(/<hp:subList\b[^>]*>[\s\S]*?<\/hp:subList>/, ""), "hwpx-import-note-structure-invalid"],
    ["extra subList", (xml) => xml.replace("</hp:subList>", "</hp:subList><hp:subList/>"), "hwpx-import-note-structure-invalid"],
    ["wrong subList attrs", (xml) => xml.replace('vertAlign="TOP"', 'vertAlign="MIDDLE"'), "hwpx-import-note-structure-invalid"],
    ["wrong outer attribute", (xml) => xml.replace(/<hp:footNote\b/, '<hp:footNote id="1"'), "hwpx-import-note-structure-invalid"],
    ["extra note child", (xml) => mutateFirstNoteXml(xml, "footNote", (note) => note.replace("</hp:subList></hp:footNote>", "</hp:subList><hp:t>bad</hp:t></hp:footNote>")), "hwpx-import-note-structure-invalid"],
    ["mixed outer run", (xml) => xml.replace("</hp:footNote></hp:ctrl></hp:run>", "</hp:footNote></hp:ctrl><hp:t>bad</hp:t></hp:run>"), "hwpx-import-note-structure-invalid"],
    ["missing instId", (xml) => xml.replace(/\sinstId="\d+"/, ""), "hwpx-import-note-structure-invalid"],
    ["duplicate instId", (xml) => xml.replace(/(<hp:endNote\b[^>]*instId=")\d+/, "$11"), "hwpx-import-note-pair-invalid"],
    ["nonpositive instId", (xml) => xml.replace(/instId="\d+"/, 'instId="0"'), "hwpx-import-note-structure-invalid"],
    ["wrong autoNum kind", (xml) => xml.replace('numType="FOOTNOTE"', 'numType="ENDNOTE"'), "hwpx-import-note-numbering-unsupported"],
    ["wrong autoNum number", (xml) => xml.replace('num="1" numType="FOOTNOTE"', 'num="9" numType="FOOTNOTE"'), "hwpx-import-note-numbering-unsupported"],
    ["extra autoNum attr", (xml) => xml.replace('num="1" numType="FOOTNOTE"', 'num="1" numType="FOOTNOTE" custom="1"'), "hwpx-import-note-numbering-unsupported"],
    ["wrong autoNum format", (xml) => xml.replace('type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"', 'type="ROMAN" userChar="" prefixChar="" suffixChar=")" supscript="0"'), "hwpx-import-note-numbering-unsupported"],
    ["unexpected body object", (xml) => mutateFirstNoteXml(xml, "footNote", (note) => note.replace("<hp:linesegarray>", "<hp:run charPrIDRef=\"0\"><hp:tbl/></hp:run><hp:linesegarray>")), "hwpx-import-note-content-unsupported"],
    ["nested note", (xml) => mutateFirstNoteXml(xml, "footNote", (note) => note.replace("<hp:linesegarray>", "<hp:run charPrIDRef=\"0\"><hp:ctrl><hp:footNote instId=\"99\"><hp:subList/></hp:footNote></hp:ctrl></hp:run><hp:linesegarray>")), "hwpx-import-note-content-unsupported"],
    ["unsafe link", (xml) => xml.replace("https\\://example.com", "javascript\\:alert(1)"), "hwpx-import-note-hyperlink-unsupported"]
  ])("fails closed with stable taxonomy for %s", (_name, transform, code) => {
    const exported = exportNotes();
    expectImportCode(packageWithSection(exported, transform), code);
  });

  it.each([
    ["header start", "Contents/header.xml", (xml) => xml.replace('footnote="1"', 'footnote="2"')],
    ["continuous numbering", "Contents/section0.xml", (xml) => xml.replace('type="CONTINUOUS" newNum="1"', 'type="ON_SECTION" newNum="1"')],
    ["footnote placement", "Contents/section0.xml", (xml) => xml.replace('place="EACH_COLUMN" beneathText="0"', 'place="END_OF_DOCUMENT" beneathText="0"')],
    ["endnote placement", "Contents/section0.xml", (xml) => xml.replace('place="END_OF_DOCUMENT" beneathText="0"', 'place="EACH_COLUMN" beneathText="0"')]
  ])("rejects unsupported %s policy", (_name, path, transform) => {
    const exported = exportNotes();
    expectImportCode(
      packageWithEntry(exported, path, transform),
      "hwpx-import-note-numbering-unsupported"
    );
  });

  it("sorts double-digit section entry names by numeric document order", () => {
    const exported = exportNotes();
    const entries = unzipSync(exported.packageBytes, { inflateRaw });
    entries["Contents/section2.xml"] = entries["Contents/section0.xml"];
    entries["Contents/section10.xml"] = entries["Contents/section0.xml"];
    const summary = readHWPXPackageFromBytes(zipSync(entries), { inflateRaw })
      .packageSummary;
    expect(summary.sectionEntries).toEqual([
      "Contents/section0.xml",
      "Contents/section2.xml",
      "Contents/section10.xml"
    ]);
  });

  it("keeps no-note exports and imports clean without changing package bytes", () => {
    const plain = fromProseMirrorDocToIR({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "plain" }] }]
    }, { extractedAt: "2026-07-15T00:00:00.000Z" });
    const first = exportIRToMinimalHWPX(createHWPXMinimalExportInput(plain));
    const second = exportIRToMinimalHWPX(createHWPXMinimalExportInput(plain));
    const imported = importPackage(first.packageBytes);

    expect(first.packageBytes).toEqual(second.packageBytes);
    expect(noteErrors(imported)).toEqual([]);
    expect(imported.irDocument.notes || []).toEqual([]);
  });
});
