import { describe, expect, it } from "vitest";

import {
  DKT_MAX_SCHEMA_VERSION,
  DKT_SEMANTIC_SCHEMA_VERSION,
  DKT_SCHEMA_VERSION,
  MAX_DKT_BYTES,
  createDockitDocumentSnapshot,
  getCreatedDockitDocumentId,
  normalizeDockitDocumentForImport,
  validateDockitImportFile
} from "../../app/LIB/utils/dktDocumentUtils.js";

const currentDocument = (overrides = {}) => ({
  fileType: "dkt-document",
  schemaVersion: DKT_SCHEMA_VERSION,
  title: "보고서",
  content: "<p>본문</p>",
  docSetting: { pageWidth: 210, pageHeight: 297 },
  bulletStyle: { disc: "•" },
  viewPage: true,
  pageNumber: "center",
  focus: 9,
  sourceFileName: "source.docx",
  ...overrides
});

describe("Dockit document schema", () => {
  it("keeps v1 for semantic-free allowlisted snapshots", () => {
    expect(
      createDockitDocumentSnapshot({
        document: {
          ...currentDocument(),
          _id: "private-id",
          user_uid: "private-user",
          teamMembers: ["other-user"],
          public: true,
          linkShare: true,
          contentURL: "https://storage.example/private-token"
        },
        content: "<p>최신 편집 내용</p>",
        focus: 14
      })
    ).toEqual({
      fileType: "dkt-document",
      schemaVersion: 1,
      title: "보고서",
      content: "<p>최신 편집 내용</p>",
      docSetting: { pageWidth: 210, pageHeight: 297 },
      bulletStyle: { disc: "•" },
      viewPage: true,
      pageNumber: "center",
      focus: 14,
      sourceFileName: "source.docx"
    });
  });

  it("writes and imports v2 only for validated semantic HTML", () => {
    const semanticContent = '<p data-dockit-semantic-key="문단~2" data-dockit-semantic-role="본문" data-dockit-semantic-tags="[&quot;가&quot;,&quot;나&quot;]">본문</p>';
    expect(createDockitDocumentSnapshot({ document: currentDocument(), content: semanticContent }).schemaVersion).toBe(DKT_SEMANTIC_SCHEMA_VERSION);
    expect(normalizeDockitDocumentForImport(currentDocument({ schemaVersion: DKT_SEMANTIC_SCHEMA_VERSION, content: semanticContent })).content).toBe(semanticContent);
    expect(() => normalizeDockitDocumentForImport(currentDocument({ schemaVersion: 1, content: semanticContent }))).toThrow("의미 정보");
    expect(() => normalizeDockitDocumentForImport(currentDocument({ schemaVersion: 2, content: '<p data-dockit-semantic-key="bad key">x</p>' }))).toThrow("의미 정보");
    expect(() => normalizeDockitDocumentForImport(currentDocument({ schemaVersion: 2, content: '<span data-dockit-semantic-key="valid">x</span>' }))).toThrow("의미 정보");
    expect(() => normalizeDockitDocumentForImport(currentDocument({ schemaVersion: 2, content: "data-dockit-semantic-key" }))).toThrow("의미 정보");
    expect(() => normalizeDockitDocumentForImport(currentDocument({ schemaVersion: 2, content: '<p data-dockit-semantic-key="same">x</p><p data-dockit-semantic-key="same">y</p>' }))).toThrow("의미 정보");
    expect(() => normalizeDockitDocumentForImport(currentDocument({ schemaVersion: 2, content: '<p data-dockit-semantic-tags="not-json">x</p>' }))).toThrow("의미 정보");
    expect(() => normalizeDockitDocumentForImport(currentDocument({ schemaVersion: 2, content: "<p>본문</p>" }))).toThrow("의미 정보");
    expect(() => createDockitDocumentSnapshot({ document: currentDocument(), content: '<p data-dockit-semantic-key="bad key">x</p>' })).toThrow("의미 정보");
  });

  it("does not upgrade plain documents that merely mention semantic attribute names", () => {
    const content = '<p>data-dockit-semantic-key</p><p title="data-dockit-semantic-role">본문</p><!-- data-dockit-semantic-tags -->';
    expect(createDockitDocumentSnapshot({ document: currentDocument(), content }).schemaVersion).toBe(DKT_SCHEMA_VERSION);
  });

  it("normalizes current and legacy files without importing account fields", () => {
    expect(
      normalizeDockitDocumentForImport({
        ...currentDocument(),
        _id: "private-id",
        user_uid: "private-user",
        teamMembers: ["other-user"],
        contentURL: "https://storage.example/private-token"
      })
    ).toEqual({
      title: "보고서",
      content: "<p>본문</p>",
      docSetting: { pageWidth: 210, pageHeight: 297 },
      bulletStyle: { disc: "•" },
      viewPage: true,
      pageNumber: "center",
      focus: 9,
      sourceFileName: "source.docx"
    });

    expect(
      normalizeDockitDocumentForImport({
        fileType: "dockit-document",
        title: "legacy",
        content: "<p>legacy</p>"
      })
    ).toMatchObject({
      title: "legacy",
      content: "<p>legacy</p>",
      pageNumber: "none"
    });
  });

  it("rejects malformed and future schema documents", () => {
    expect(() =>
      normalizeDockitDocumentForImport(
        currentDocument({ schemaVersion: DKT_MAX_SCHEMA_VERSION + 1 })
      )
    ).toThrow("지원하지 않는 Dockit schema version");
    expect(() =>
      normalizeDockitDocumentForImport(currentDocument({ content: null }))
    ).toThrow("본문이 올바르지 않습니다");
  });

  it("resolves API create IDs and enforces the browser import size limit", () => {
    expect(getCreatedDockitDocumentId({ content: { _id: "doc-1" } })).toBe(
      "doc-1"
    );
    expect(getCreatedDockitDocumentId({ _id: "doc-2" })).toBe("doc-2");
    expect(validateDockitImportFile({ size: MAX_DKT_BYTES }).valid).toBe(true);
    expect(validateDockitImportFile({ size: MAX_DKT_BYTES + 1 })).toEqual({
      valid: false,
      message: "50MB를 초과하는 Dockit 문서는 불러올 수 없습니다."
    });
  });
});
