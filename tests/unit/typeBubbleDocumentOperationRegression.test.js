import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const source = fs.readFileSync(
  path.join(rootDir, "app/LIB/components/write/TypeBubble.js"),
  "utf8"
);

const between = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
};

describe("TypeBubble DocumentOperation C1/C2 integration", () => {
  it("keeps one executor instance per editor and records the local actor identity", () => {
    expect(source).toContain("documentOperationExecutorRef.current = createDocumentOperationExecutor");
    expect(source).toContain("documentOperationEditorRef.current !== editor");
    expect(source).toContain('actor: user?.uid ? `user:${user.uid}` : "local-user"');
    expect(source).not.toContain("user?.id ?");
    expect(source).toContain("createDocumentOperationNonce");
    expect(source).not.toContain("manualOperationSequenceRef");
  });

  it("uses nonce-backed manual keys", () => {
    expect(source).toContain("type-bubble-bold-${createDocumentOperationNonce()}");
  });

  it("routes eligible manual bold through C2 and retains an explicit C1 fallback", () => {
    const manualPath = between(
      "const runManualBoldOperation",
      "const [isLinkPromptOpen"
    );

    expect(manualPath).toContain("executeDocumentRootOperation");
    expect(manualPath).toContain("executeDocumentBlockRangeOperation");
    expect(manualPath).toContain("createSemanticSelectionAnchor");
    expect(manualPath).toContain("operationContext.resolvedRange");
    expect(manualPath).toContain("attachDocumentOperationTransactionMetadata");
    expect(manualPath).toContain("chain.toggleBold().run()");
    expect(manualPath).toContain("DOCUMENT_OPERATION_SOURCES.MANUAL");
    expect(manualPath).toContain("DOCUMENT_OPERATION_TYPES.FORMAT_TOGGLE");
  });

});
