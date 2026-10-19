import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs
  .readFileSync(
    path.join(
      process.cwd(),
      "app/LIB/components/write/ContentEditor.js"
    ),
    "utf8"
  )
  .replace(/\r\n/g, "\n");

const extractTiptapDependencyBoundary = () => {
  const editorStart = source.indexOf("const editor = useTiptapEditor(");
  const editorEnd = source.indexOf("\n  );", editorStart);
  const editorCall = source.slice(editorStart, editorEnd);
  const dependencyStart = editorCall.lastIndexOf("\n    [");
  return editorCall.slice(dependencyStart).trim();
};

describe("ContentEditor lifecycle regression", () => {
  it("does not recreate Tiptap when parent persistence callbacks change identity", () => {
    const dependencies = extractTiptapDependencyBoundary();

    expect(dependencies).toBe("[viewPage, pageMetrics, pageNumber]");
    expect(dependencies).not.toContain("debouncedOnChange");
    expect(dependencies).not.toContain("onNotePersistenceRejected");
    expect(dependencies).not.toContain("capturePersistenceSnapshot");
  });

  it("does not publish a redundant selected-object update during effect cleanup", () => {
    const cleanupStart = source.indexOf("// Cleanup Function");
    const cleanupEnd = source.indexOf("\n    };", cleanupStart);
    const cleanup = source.slice(cleanupStart, cleanupEnd);

    expect(cleanup).toMatch(
      /if \(selectedObjectRef\.current\) \{[\s\S]*?setSelectedObject\(null\);[\s\S]*?\}/
    );
  });
});
