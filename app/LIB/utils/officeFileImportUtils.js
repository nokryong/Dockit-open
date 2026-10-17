import {
  classifyImportDryRunFailure,
  classifyImportPreviewDisposition
} from "./classifyConversionError";
import {
  DOCX_IMPORT_MAX_BYTES,
  runDOCXImportDryRun
} from "./docxImportButtonUtils";
import {
  createHWPXBrowserInflateRaw,
  HWPX_IMPORT_MAX_BYTES,
  runHWPXImportDryRun
} from "./hwpxImportButtonUtils";

const getOfficeExtension = (fileName = "") =>
  `${fileName}`.trim().split(".").pop()?.toLowerCase() || "";

const stripLastExtension = (fileName = "") =>
  `${fileName}`.replace(/\.[^.]+$/u, "") || `${fileName}`;

const createConversionError = ({
  classification,
  fallbackMessage,
  cause
} = {}) => {
  const error = new Error(
    classification?.message || fallbackMessage || "가져오기에 실패했습니다."
  );

  error.conversionFailure = classification;

  if (cause !== undefined) {
    error.cause = cause;
  }

  return error;
};

const getWarningTotal = (ext, summary = {}) => {
  const baseTotal =
    Number(summary.importWarningCount ?? 0) +
    Number(summary.projectionWarningCount ?? 0) +
    Number(summary.validationWarningCount ?? 0);

  if (ext === "hwpx") {
    return baseTotal + Number(summary.lossCount ?? 0);
  }

  return baseTotal;
};

export const convertOfficeFileToDocument = async (file) => {
  const ext = getOfficeExtension(file?.name);
  const isDocx = ext === "docx";
  const isHwpx = ext === "hwpx";

  if (!isDocx && !isHwpx) {
    throw new Error("지원하지 않는 오피스 문서 형식입니다.");
  }

  const [importer, { irToProseMirror }, { validateProseMirrorProjection }] = await Promise.all([
    isDocx ? import("../ir/docxImport") : import("../ir/hwpxImport"),
    import("../ir/toProseMirror"),
    import("../ir/proseMirrorProjectionValidation"),
  ]);

  const dryRun = isDocx
    ? await runDOCXImportDryRun({
        file,
        importDOCXToIR: importer.importDOCXToIR,
        irToProseMirror,
        validateProseMirrorProjection
      })
    : await runHWPXImportDryRun({
        file,
        importHWPXToIR: importer.importHWPXToIR,
        irToProseMirror,
        validateProseMirrorProjection,
        inflateRaw: createHWPXBrowserInflateRaw()
      });

  if (!dryRun.ok) {
    const failure = classifyImportDryRunFailure({
      dryRunResult: dryRun,
      fileName: file?.name,
      maxBytes: isDocx ? DOCX_IMPORT_MAX_BYTES : HWPX_IMPORT_MAX_BYTES
    });

    throw createConversionError({
      classification: failure,
      fallbackMessage: dryRun.message,
      cause: dryRun.error
    });
  }

  const previewFailure = classifyImportPreviewDisposition({
    preview: dryRun.preview
  });

  if (previewFailure) {
    throw createConversionError({
      classification: previewFailure,
      fallbackMessage: "가져오기에 실패했습니다."
    });
  }

  const [{ generateHTML }, { editorExtensions }] = await Promise.all([
    import("@tiptap/html"),
    import("../constant/editorExtensions"),
  ]);
  const html = generateHTML(dryRun.projection.doc, editorExtensions);

  return {
    title: stripLastExtension(file?.name),
    content: html,
    sourceFileName: file.name,
    warningTotal: getWarningTotal(ext, dryRun.preview?.summary)
  };
};
