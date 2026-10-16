import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { inflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importDOCXToIR } from "../../app/LIB/ir/docxImport";
import { createDOCXMinimalExportInput, exportIRToMinimalDOCX } from "../../app/LIB/ir/docxMinimalExport";
import { importHWPXToIR } from "../../app/LIB/ir/hwpxImport";
import { createHWPXMinimalExportInput, exportIRToMinimalHWPX } from "../../app/LIB/ir/hwpxMinimalExport";
import {
  buildNativeNoteCorpusManifest,
  createNativeNoteInteroperabilityCorpusIR,
  projectNativeNoteSemantics,
  writeNativeNoteCorpusArtifacts
} from "../helpers/nativeNoteInteroperabilityCorpus";

const inflateRaw = (bytes) => new Uint8Array(inflateRawSync(bytes));
const extractedAt = "2026-07-15T00:00:00.000Z";
const fixtureDir = path.join(process.cwd(), "tests", "fixtures", "notes");
const docxErrors = (result) => result.warnings.filter((entry) =>
  entry.severity === "error" && entry.code.startsWith("docx-import-note-")
);
const hwpxErrors = (result) => result.lossReport.entries.filter((entry) =>
  entry.severity === "error" && entry.code.startsWith("hwpx-import-note-")
);
const mutateZip = (bytes, mutate) => {
  const entries = unzipSync(bytes, { inflateRaw });
  const api = {
    text: (path) => strFromU8(entries[path]),
    setText: (path, value) => { entries[path] = strToU8(value); },
    remove: (path) => { delete entries[path]; }
  };
  mutate(api);
  return zipSync(entries);
};
const mutateDocxNormalNote = (xml, kind, id, update) => xml.replace(
  new RegExp(`<w:${kind} w:id="${id}">[\\s\\S]*?</w:${kind}>`), update
);
const mutateFirstHwpxNote = (xml, kind, update) => xml.replace(
  new RegExp(`<hp:${kind}\\b[\\s\\S]*?</hp:${kind}>`), update
);
const expectBlocked = (result, errors, code) => {
  expect(errors(result)).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  expect(result.irDocument.notes).toBeUndefined();
};
const expectExportCode = (action, code) => {
  expect(action).toThrow(expect.objectContaining({ code }));
};
const exportDOCX = (ir = createNativeNoteInteroperabilityCorpusIR()) =>
  exportIRToMinimalDOCX(createDOCXMinimalExportInput(ir));
const exportHWPX = (ir = createNativeNoteInteroperabilityCorpusIR()) =>
  exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));
const importDOCX = (bytes) => importDOCXToIR(bytes, { extractedAt });
const importHWPX = (bytes) => importHWPXToIR(bytes, { inflateRaw, extractedAt });
const docxCanonicalSettings = (footnote) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnotePr>${footnote}</w:footnotePr></w:settings>`;

describe("Phase D N5d native note interoperability corpus", () => {
  it.each([
    ["DOCX", exportDOCX, importDOCX, docxErrors],
    ["HWPX", exportHWPX, importHWPX, hwpxErrors]
  ])("keeps %s deterministic and semantically exact through two native passes", (_format, exportPackage, importPackage, errors) => {
    const expected = projectNativeNoteSemantics(createNativeNoteInteroperabilityCorpusIR());
    const first = exportPackage();
    const duplicate = exportPackage();
    const imported = importPackage(first.packageBytes);
    const reexported = exportPackage(imported.irDocument);
    const reimported = importPackage(reexported.packageBytes);

    expect(first.packageBytes).toEqual(duplicate.packageBytes);
    expect(errors(imported)).toEqual([]);
    expect(errors(reimported)).toEqual([]);
    expect(projectNativeNoteSemantics(imported.irDocument)).toEqual(expected);
    expect(projectNativeNoteSemantics(reimported.irDocument)).toEqual(expected);
    expect(projectNativeNoteSemantics(imported.irDocument).mainText).toContain("__N5D_MAIN_TOP__");
    expect(projectNativeNoteSemantics(imported.irDocument).mainText).toContain("__N5D_MAIN_CELL__");
    expect(projectNativeNoteSemantics(imported.irDocument).mainText).not.toContain("__N5D_NOTE_ONLY__");
  });

  it("builds deterministic artifact provenance and writes only when explicitly enabled", () => {
    const input = {
      docxBytes: exportDOCX().packageBytes,
      hwpxBytes: exportHWPX().packageBytes,
      semantics: projectNativeNoteSemantics(createNativeNoteInteroperabilityCorpusIR())
    };
    const manifest = buildNativeNoteCorpusManifest(input);

    expect(manifest).toEqual(buildNativeNoteCorpusManifest(input));
    expect(manifest.schema).toBe("dockit-native-note-corpus-v1");
    Object.values(manifest.files).forEach((digest) => {
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
    });
    writeNativeNoteCorpusArtifacts(input);
  });

  it("keeps the checked-in native files and manifest byte-exact with the generator", () => {
    const docxBytes = exportDOCX().packageBytes;
    const hwpxBytes = exportHWPX().packageBytes;
    const semantics = projectNativeNoteSemantics(
      createNativeNoteInteroperabilityCorpusIR()
    );
    const manifest = buildNativeNoteCorpusManifest({
      docxBytes,
      hwpxBytes,
      semantics
    });

    expect(readFileSync(path.join(fixtureDir, "native-note-corpus.docx"))).toEqual(
      Buffer.from(docxBytes)
    );
    expect(readFileSync(path.join(fixtureDir, "native-note-corpus.hwpx"))).toEqual(
      Buffer.from(hwpxBytes)
    );
    expect(
      JSON.parse(
        readFileSync(
          path.join(fixtureDir, "native-note-corpus.manifest.json"),
          "utf8"
        )
      )
    ).toEqual(manifest);
  });

  it("binds native-app probe provenance to the exact checked-in corpus bytes", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(fixtureDir, "native-note-corpus.manifest.json"),
        "utf8"
      )
    );
    const probe = JSON.parse(
      readFileSync(
        path.join(fixtureDir, "native-note-app-probe.2026-07-15.json"),
        "utf8"
      )
    );

    expect(probe.source.files).toEqual(manifest.files);
    expect(probe.microsoftWord.open.status).toBe("PASS");
    expect(probe.microsoftWord.open).toMatchObject({
      footnoteCount: 2,
      endnoteCount: 1,
      noteBodyLeakIntoMainStory: false,
      firstFootnoteHyperlinkCount: 3
    });
    expect(probe.hancomOffice.directOpen.status).toBe("PASS");
    expect(probe.microsoftWord.roundTripSave.status).toBe("UNKNOWN");
    expect(probe.microsoftWord.visual.status).toBe("UNKNOWN");
    expect(probe.hancomOffice.automationSecurityModule.status).toBe("FAIL");
    expect(probe.hancomOffice.roundTripSave.status).toBe("UNKNOWN");
    expect(probe.hancomOffice.visual.status).toBe("UNKNOWN");
    expect(probe.libreOffice.availability).toBe("N/A");
    expect(probe.remainingOperatorGate.status).toBe("UNKNOWN");
  });

  it.each([
    ["DOCX part", exportDOCX, importDOCX, docxErrors, "docx-import-note-part-invalid", (bytes) => mutateZip(bytes, (api) => api.remove("word/footnotes.xml"))],
    ["DOCX numbering", exportDOCX, importDOCX, docxErrors, "docx-import-note-numbering-unsupported", (bytes) => mutateZip(bytes, (api) => api.setText("word/settings.xml", docxCanonicalSettings('<w:numFmt w:val="upperRoman"/>')))],
    ["DOCX pair", exportDOCX, importDOCX, docxErrors, "docx-import-note-pair-invalid", (bytes) => mutateZip(bytes, (api) => api.setText("word/document.xml", api.text("word/document.xml").replace('<w:endnoteReference w:id="1"/>', '<w:endnoteReference w:id="1"/><w:endnoteReference w:id="1"/>')))],
    ["DOCX content", exportDOCX, importDOCX, docxErrors, "docx-import-note-content-unsupported", (bytes) => mutateZip(bytes, (api) => api.setText("word/endnotes.xml", mutateDocxNormalNote(api.text("word/endnotes.xml"), "endnote", 1, (note) => note.replace("</w:r>", "<w:tab/></w:r>"))))],
    ["DOCX hyperlink", exportDOCX, importDOCX, docxErrors, "docx-import-note-hyperlink-unsupported", (bytes) => mutateZip(bytes, (api) => api.setText("word/_rels/footnotes.xml.rels", api.text("word/_rels/footnotes.xml.rels").replace("http://example.com/n5d", "javascript:alert(1)")))],
    ["HWPX structure", exportHWPX, importHWPX, hwpxErrors, "hwpx-import-note-structure-invalid", (bytes) => mutateZip(bytes, (api) => api.setText("Contents/section0.xml", api.text("Contents/section0.xml").replace(/<hp:subList\b[^>]*>[\s\S]*?<\/hp:subList>/, "")))],
    ["HWPX numbering", exportHWPX, importHWPX, hwpxErrors, "hwpx-import-note-numbering-unsupported", (bytes) => mutateZip(bytes, (api) => api.setText("Contents/section0.xml", api.text("Contents/section0.xml").replace('numType="FOOTNOTE"', 'numType="ENDNOTE"')))],
    ["HWPX pair", exportHWPX, importHWPX, hwpxErrors, "hwpx-import-note-pair-invalid", (bytes) => mutateZip(bytes, (api) => api.setText("Contents/section0.xml", api.text("Contents/section0.xml").replace(/(<hp:endNote\b[^>]*instId=")\d+/, "$11")))],
    ["HWPX content", exportHWPX, importHWPX, hwpxErrors, "hwpx-import-note-content-unsupported", (bytes) => mutateZip(bytes, (api) => api.setText("Contents/section0.xml", mutateFirstHwpxNote(api.text("Contents/section0.xml"), "footNote", (note) => note.replace("<hp:linesegarray>", '<hp:run charPrIDRef="0"><hp:tbl/></hp:run><hp:linesegarray>'))))],
    ["HWPX hyperlink", exportHWPX, importHWPX, hwpxErrors, "hwpx-import-note-hyperlink-unsupported", (bytes) => mutateZip(bytes, (api) => api.setText("Contents/section0.xml", api.text("Contents/section0.xml").replace("https\\://example.com/n5d", "javascript\\:alert(1)")))]
  ])("blocks %s without partially applying notes", (_name, exportPackage, importPackage, errors, code, mutate) => {
    expectBlocked(importPackage(mutate(exportPackage().packageBytes)), errors, code);
  });

  it.each([
    ["DOCX", exportDOCX, "DOCX_NOTE_EXPORT_PARAGRAPH_ATTR_UNSUPPORTED"],
    ["HWPX", exportHWPX, "HWPX_NOTE_EXPORT_PARAGRAPH_ATTR_UNSUPPORTED"]
  ])("fails %s unsupported note export before package bytes", (_format, exportPackage, code) => {
    const ir = createNativeNoteInteroperabilityCorpusIR();
    ir.notes[0].paragraphs[0].attrs = { textAlign: "center" };
    expectExportCode(() => exportPackage(ir), code);
  });
});
