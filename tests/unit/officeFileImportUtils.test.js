import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";





vi.mock("../../app/LIB/extensions/DiagramBlockView.js", () => ({
  default: function MockDiagramBlockView() {
    return null;
  }
}));

import {
  convertOfficeFileToDocument
} from "../../app/LIB/utils/officeFileImportUtils";
import { DOCX_IMPORT_MAX_BYTES } from "../../app/LIB/utils/docxImportButtonUtils";
import { HWPX_IMPORT_MAX_BYTES } from "../../app/LIB/utils/hwpxImportButtonUtils";

const fixturePath = (folder, name) =>
  path.join(process.cwd(), "tests", "fixtures", folder, name);

const fixtureFile = (folder, name) => {
  const bytes = readFileSync(fixturePath(folder, name));

  return {
    name,
    size: bytes.length,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
};

describe("officeFileImportUtils", () => {
  it("converts a DOCX fixture into a new document payload", async () => {
    const result = await convertOfficeFileToDocument(
      fixtureFile("docx", "real-simple-list.docx")
    );

    expect(result.title).toBe("real-simple-list");
    expect(result.sourceFileName).toBe("real-simple-list.docx");
    expect(result.content).toEqual(expect.any(String));
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.warningTotal).toBeGreaterThanOrEqual(0);
  }, 30000);

  it("converts an HWPX fixture into a new document payload", async () => {
    const result = await convertOfficeFileToDocument(
      fixtureFile("hwpx", "minimal-readiness-smoke.hwpx")
    );

    expect(result.title).toBe("minimal-readiness-smoke");
    expect(result.sourceFileName).toBe("minimal-readiness-smoke.hwpx");
    expect(result.content).toEqual(expect.any(String));
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.warningTotal).toBeGreaterThanOrEqual(0);
  }, 30000);

  it("attaches conversionFailure when the DOCX preview is blocked", async () => {
    await expect(
      convertOfficeFileToDocument(fixtureFile("docx", "invalid-package.docx"))
    ).rejects.toMatchObject({
      conversionFailure: expect.objectContaining({
        category: "blocked"
      })
    });
  });

  it("classifies oversized DOCX uploads before import", async () => {
    const oversizedFile = {
      name: "too-large.docx",
      size: DOCX_IMPORT_MAX_BYTES + 1,
      arrayBuffer: async () => new ArrayBuffer(0)
    };

    await expect(convertOfficeFileToDocument(oversizedFile)).rejects.toMatchObject({
      conversionFailure: expect.objectContaining({
        category: "size-exceeded"
      })
    });
  });

  it("classifies oversized HWPX uploads before import", async () => {
    const oversizedFile = {
      name: "too-large.hwpx",
      size: HWPX_IMPORT_MAX_BYTES + 1,
      arrayBuffer: async () => new ArrayBuffer(0)
    };

    await expect(convertOfficeFileToDocument(oversizedFile)).rejects.toMatchObject({
      conversionFailure: expect.objectContaining({
        category: "size-exceeded"
      })
    });
  });
});
