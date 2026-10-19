import { describe, expect, it } from "vitest";
import { DOCX_IMPORT_MAX_BYTES } from "../../app/LIB/utils/docxImportButtonUtils";
import { HWPX_IMPORT_MAX_BYTES } from "../../app/LIB/utils/hwpxImportButtonUtils";
import {
  classifyImportDryRunFailure,
  classifyImportPreviewDisposition,
  getBlockedWarningEntry
} from "../../app/LIB/utils/classifyConversionError";

describe("classifyConversionError", () => {
  it("classifies file-extension mismatch as unsupported format", () => {
    const result = classifyImportDryRunFailure({
      dryRunResult: {
        ok: false,
        stage: "file-validation",
        reason: "docx-import-file-extension",
        message: "DOCX 파일(.docx)만 불러올 수 있습니다."
      },
      fileName: "notes.txt",
      maxBytes: DOCX_IMPORT_MAX_BYTES
    });

    expect(result).toMatchObject({
      category: "unsupported-format",
      title: "지원하지 않는 파일 형식입니다",
      action: "choose-supported-file",
      blocked: false
    });
    expect(result.message).toContain("DOCX 또는 HWPX");
  });

  it("uses legacy HWP copy for .hwp extension mismatches", () => {
    const result = classifyImportDryRunFailure({
      dryRunResult: {
        ok: false,
        stage: "file-validation",
        reason: "hwpx-import-file-extension",
        message: "HWPX 파일(.hwpx)만 불러올 수 있습니다."
      },
      fileName: "legacy.hwp",
      maxBytes: HWPX_IMPORT_MAX_BYTES
    });

    expect(result).toMatchObject({
      category: "unsupported-format",
      title: "지원하지 않는 파일 형식입니다",
      message: "HWP(구형)는 지원하지 않습니다. HWPX로 저장 후 시도해 주세요.",
      action: "convert-hwp-to-hwpx"
    });
  });

  it("classifies max-byte failures as size exceeded using the passed limit", () => {
    const result = classifyImportDryRunFailure({
      dryRunResult: {
        ok: false,
        stage: "file-validation",
        reason: "hwpx-import-file-too-large",
        message: "HWPX 파일은 최대 20MB까지 불러올 수 있습니다."
      },
      fileName: "large.hwpx",
      maxBytes: HWPX_IMPORT_MAX_BYTES
    });

    expect(result).toMatchObject({
      category: "size-exceeded",
      title: "파일 크기 제한을 초과했습니다",
      message: "20MB 이하 파일만 가져올 수 있습니다.",
      action: "choose-smaller-file"
    });
  });

  it("classifies empty-file validation failures as invalid package", () => {
    const result = classifyImportDryRunFailure({
      dryRunResult: {
        ok: false,
        stage: "file-validation",
        reason: "docx-import-file-empty",
        message: "빈 DOCX 파일은 불러올 수 없습니다."
      },
      fileName: "empty.docx",
      maxBytes: DOCX_IMPORT_MAX_BYTES
    });

    expect(result).toMatchObject({
      category: "invalid-package",
      title: "올바른 HWPX/DOCX 파일이 아닙니다",
      action: "reselect-package"
    });
  });

  it("classifies zip/package-open dry-run failures as invalid package", () => {
    const result = classifyImportDryRunFailure({
      dryRunResult: {
        ok: false,
        stage: "dry-run",
        reason: "dry-run-error",
        message: "DOCX 불러오기에 실패했습니다.",
        error: new Error("zip central directory not found")
      },
      fileName: "broken.docx",
      maxBytes: DOCX_IMPORT_MAX_BYTES
    });

    expect(result).toMatchObject({
      category: "invalid-package",
      title: "올바른 HWPX/DOCX 파일이 아닙니다"
    });
  });

  it("classifies xml parse-like dry-run failures as parse failure with correlation id", () => {
    const result = classifyImportDryRunFailure({
      dryRunResult: {
        ok: false,
        stage: "dry-run",
        reason: "dry-run-error",
        message: "HWPX 불러오기에 실패했습니다.",
        error: new Error("XML parse error: unexpected close tag in word/document.xml")
      },
      fileName: "broken.docx",
      maxBytes: DOCX_IMPORT_MAX_BYTES
    });

    expect(result.category).toBe("parse-failure");
    expect(result.title).toBe("문서를 해석하지 못했습니다");
    expect(result.action).toBe("check-parse-error");
    expect(result.correlationId).toMatch(/^[0-9a-z]+$/);
    expect(result.message).toContain(result.correlationId);
  });

  it("classifies canApply=false previews as blocked and returns the synthetic blocked warning", () => {
    const disposition = classifyImportPreviewDisposition({
      preview: {
        summary: {
          canApply: false
        }
      }
    });

    expect(disposition).toMatchObject({
      category: "blocked",
      title: "적용 전 확인 필요",
      action: "review-blocking-items",
      blocked: true
    });
    expect(getBlockedWarningEntry()).toEqual({
      code: "import-readiness-blocked",
      severity: "blocked"
    });
  });

  it("falls back to invalid package for unknown non-parse failures", () => {
    const result = classifyImportDryRunFailure({
      dryRunResult: {
        ok: false,
        stage: "dependency-validation",
        reason: "missing-dependency",
        message: "DOCX dry-run pipeline dependency is missing."
      },
      fileName: "fixture.docx",
      maxBytes: DOCX_IMPORT_MAX_BYTES
    });

    expect(result).toMatchObject({
      category: "invalid-package",
      title: "올바른 HWPX/DOCX 파일이 아닙니다"
    });
  });
});
