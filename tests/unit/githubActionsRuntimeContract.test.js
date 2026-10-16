import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workflowPaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/live-security-audit.yml"
];

describe("GitHub Actions runtime contract", () => {
  for (const workflowPath of workflowPaths) {
    it(`${workflowPath} uses the supported Node 24 action runtime`, () => {
      const workflow = readFileSync(join(root, workflowPath), "utf8");

      expect(workflow).toContain("actions/checkout@v7");
      expect(workflow).toContain("actions/setup-node@v7");
      expect(workflow).not.toMatch(
        /actions\/(?:checkout|setup-node)@v(?:[1-6])\b/
      );
      expect(workflow).toContain("node-version: 24");
      expect(workflow).toContain("contents: read");
    });
  }
});
