import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import semanticExpectations from "../fixtures/hwpx/visualGoldenExpectations.json";
import visualCases from "../fixtures/hwpx/visualCaseManifest.json";
import {
  HWPX_VISUAL_ARTIFACT_METADATA_FILE,
  expectHWPXVisualArtifactRenderResult,
  readHWPXVisualArtifactRenderResult
} from "./hwpxVisualArtifactAdapter";

const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures", "hwpx");
const ARTIFACT_ROOT = process.env.HWPX_VISUAL_ARTIFACT_OUT;
const ROUND_TRIP_MODES = ["original", "paired"];
const RENDER_TARGETS = ["pdf", "page-screenshot"];
const PAGE_SCOPES = ["first-page", "all-pages"];
const BASELINE_POLICIES = ["artifact-only-smoke", "manual-review"];
const TOLERANCE_PROFILES = [
  "font-sensitive",
  "geometry-sensitive",
  "smoke"
];

const artifactCaseDir = (visualCase) =>
  path.join(
    ARTIFACT_ROOT,
    visualCase.fileName.replace(/\.hwpx$/i, ""),
    visualCase.renderTarget
  );

const createRenderRequest = (visualCase) => ({
  fixturePath: path.join(FIXTURE_DIR, visualCase.fileName),
  artifactDir: artifactCaseDir(visualCase),
  renderTarget: visualCase.renderTarget,
  pageScope: visualCase.pageScope
});

describe("HWPX visual artifact smoke cases", () => {
  it("keeps visual cases in a sidecar manifest backed by semantic fixtures", () => {
    const semanticFixtureNames = new Set(
      semanticExpectations.map((fixture) => fixture.fileName)
    );

    expect(visualCases.length).toBeGreaterThan(0);
    visualCases.forEach((visualCase) => {
      expect(semanticFixtureNames.has(visualCase.fileName)).toBe(true);
      expect(existsSync(path.join(FIXTURE_DIR, visualCase.fileName))).toBe(true);
      expect(ROUND_TRIP_MODES).toContain(visualCase.roundTrip);
      expect(RENDER_TARGETS).toContain(visualCase.renderTarget);
      expect(PAGE_SCOPES).toContain(visualCase.pageScope);
      expect(BASELINE_POLICIES).toContain(visualCase.baselinePolicy);
      expect(TOLERANCE_PROFILES).toContain(visualCase.toleranceProfile);
      expect(Array.isArray(visualCase.visualFocus)).toBe(true);
      expect(visualCase.visualFocus.length).toBeGreaterThan(0);
      if (visualCase.roundTrip === "paired") {
        expect(
          existsSync(
            path.join(
              FIXTURE_DIR,
              "roundtrip",
              visualCase.fileName.replace(".hwpx", ".roundtrip.hwpx")
            )
          )
        ).toBe(true);
      }
    });
  });

  it.skipIf(!ARTIFACT_ROOT)(
    `reads artifact-only renderer output when HWPX_VISUAL_ARTIFACT_OUT provides ${HWPX_VISUAL_ARTIFACT_METADATA_FILE}`,
    () => {
      visualCases
        .filter((visualCase) => visualCase.baselinePolicy === "artifact-only-smoke")
        .forEach((visualCase) => {
          const request = createRenderRequest(visualCase);
          const result = readHWPXVisualArtifactRenderResult(request);

          expect(() =>
            expectHWPXVisualArtifactRenderResult(request, result)
          ).not.toThrow();
        });
    }
  );
});
