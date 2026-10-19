import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const HWPX_VISUAL_ARTIFACT_METADATA_FILE = "render-result.json";

/**
 * @typedef {"pdf" | "page-screenshot"} HWPXVisualRenderTarget
 * @typedef {"first-page" | "all-pages"} HWPXVisualPageScope
 *
 * @typedef {object} HWPXVisualRenderRequest
 * @property {string} fixturePath
 * @property {string} artifactDir
 * @property {HWPXVisualRenderTarget} renderTarget
 * @property {HWPXVisualPageScope} pageScope
 *
 * @typedef {object} HWPXVisualRenderResult
 * @property {string} fixturePath
 * @property {string[]} artifacts
 * @property {number | undefined} pageCount
 * @property {string[]} warnings
 */

const readArtifactMetadata = (metadataPath) =>
  JSON.parse(readFileSync(metadataPath, "utf8"));

const isNonEmptyArtifact = (artifactPath) =>
  existsSync(artifactPath) && statSync(artifactPath).isFile() && statSync(artifactPath).size > 0;

/**
 * 다른 프로세스에서 만든 렌더러 결과 읽기
 * (이후 렌더러 어댑터가 같은 요청·결과 계약을 직접 구현 가능)
 *
 * @param {HWPXVisualRenderRequest} request
 * @returns {HWPXVisualRenderResult}
 */
export const readHWPXVisualArtifactRenderResult = (request) => {
  const metadataPath = path.join(
    request.artifactDir,
    HWPX_VISUAL_ARTIFACT_METADATA_FILE
  );
  const metadata = readArtifactMetadata(metadataPath);
  const artifacts = Array.isArray(metadata.artifacts) ? metadata.artifacts : [];

  return {
    fixturePath: metadata.fixturePath,
    artifacts: artifacts.map((artifact) =>
      path.isAbsolute(artifact) ? artifact : path.join(request.artifactDir, artifact)
    ),
    pageCount:
      typeof metadata.pageCount === "number" ? metadata.pageCount : undefined,
    warnings: Array.isArray(metadata.warnings) ? metadata.warnings : []
  };
};

/**
 * @param {HWPXVisualRenderRequest} request
 * @param {HWPXVisualRenderResult} result
 */
export const expectHWPXVisualArtifactRenderResult = (request, result) => {
  if (result.fixturePath !== request.fixturePath) {
    throw new Error("Visual artifact metadata fixturePath mismatch");
  }

  if (!result.artifacts.length) {
    throw new Error("Visual artifact metadata must list at least one artifact");
  }

  result.artifacts.forEach((artifactPath) => {
    if (!isNonEmptyArtifact(artifactPath)) {
      throw new Error(`Visual artifact is missing or empty: ${artifactPath}`);
    }
  });

  if (!Array.isArray(result.warnings)) {
    throw new Error("Visual artifact warnings must be an array");
  }
};
