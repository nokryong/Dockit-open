import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fromEditorStateToIR } from "../../app/LIB/ir/fromProseMirror";
import {
  createHWPXV0ExportInput,
  exportIRToHWPXV0
} from "../../app/LIB/ir/hwpxMinimalExport";
import { resolveHWPXV0RemoteImageSources } from "../../app/LIB/ir/hwpxRemoteImageResolver";

const decoder = new TextDecoder();
const pngFixtureBytes = readFileSync(
  path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "hwpx",
    "media",
    "dockit-image-fixture.png"
  )
);
const minimalJpegBytes = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03,
  0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9
]);
const secondMinimalJpegBytes = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x01, 0x03,
  0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9
]);

const readZipEntries = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = {};
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);

    if (signature !== 0x04034b50) {
      break;
    }

    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    const entryPath = decoder.decode(bytes.slice(nameStart, nameEnd));
    const data = bytes.slice(dataStart, dataEnd);

    entries[entryPath] = method === 0 ? decoder.decode(data) : data;
    offset = dataEnd;
  }

  return entries;
};

const createEditorState = (pmDoc) => ({
  doc: {
    toJSON: () => pmDoc
  }
});

const imageNode = (src, attrs = {}) => ({
  type: "image",
  attrs: {
    src,
    objectId: attrs.objectId ?? "remote-image",
    width: attrs.width ?? "16px",
    height: attrs.height ?? "16px",
    altText: attrs.altText ?? "Remote image",
    ...attrs
  }
});

const exportResolvedDoc = async (pmDoc, fetchImpl) => {
  const ir = fromEditorStateToIR(createEditorState(pmDoc));
  const resolvedIr = await resolveHWPXV0RemoteImageSources(ir, { fetchImpl });

  return exportIRToHWPXV0(createHWPXV0ExportInput(resolvedIr));
};

describe("HWPX v0 remote image resolver", () => {
  it("fetches remote PNG images once and routes them through existing BinData export", async () => {
    const src = "https://cdn.example.com/assets/remote-image.png?token=1";
    const fetchImpl = vi.fn(
      async () =>
        new Response(pngFixtureBytes, {
          status: 200,
          headers: { "content-type": "image/png" }
        })
    );
    const result = await exportResolvedDoc(
      {
        type: "doc",
        content: [
          imageNode(src, { objectId: "remote-image-a" }),
          imageNode(src, { objectId: "remote-image-b" })
        ]
      },
      fetchImpl
    );
    const entries = readZipEntries(result.packageBytes);
    const imageEntry = result.entries.find(
      (entry) => entry.path === "BinData/remote-image.png"
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(Object.keys(entries)).toContain("BinData/remote-image.png");
    expect(Array.from(imageEntry.content)).toEqual(Array.from(pngFixtureBytes));
    expect(entries["Contents/content.hpf"]).toContain(
      '<opf:item id="image1" href="BinData/remote-image.png" media-type="image/png" isEmbeded="1"/>'
    );
    expect(entries["Contents/section0.xml"]).toContain(
      '<hc:img binaryItemIDRef="image1"'
    );
    expect(entries["Contents/section0.xml"]).not.toContain("[Object placeholder");
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "object-placeholder"
    );
  });

  it("fetches remote JPEG images and keeps the media type in content.hpf", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(minimalJpegBytes, {
          status: 200,
          headers: { "content-type": "image/jpeg" }
        })
    );
    const result = await exportResolvedDoc(
      {
        type: "doc",
        content: [imageNode("https://cdn.example.com/photo.jpg")]
      },
      fetchImpl
    );
    const entries = readZipEntries(result.packageBytes);

    expect(Object.keys(entries)).toContain("BinData/photo.jpg");
    expect(entries["Contents/content.hpf"]).toContain(
      '<opf:item id="image1" href="BinData/photo.jpg" media-type="image/jpeg" isEmbeded="1"/>'
    );
    expect(entries["Contents/section0.xml"]).toContain(
      '<hc:img binaryItemIDRef="image1"'
    );
  });

  it("keeps BinData paths unique when different remote URLs share a file name", async () => {
    const fetchImpl = vi.fn(
      async (url) =>
        new Response(
          `${url}`.includes("/a/") ? minimalJpegBytes : secondMinimalJpegBytes,
          {
            status: 200,
            headers: { "content-type": "image/jpeg" }
          }
        )
    );
    const result = await exportResolvedDoc(
      {
        type: "doc",
        content: [
          imageNode("https://cdn.example.com/a/photo.jpg", { objectId: "photo-a" }),
          imageNode("https://cdn.example.com/b/photo.jpg", { objectId: "photo-b" })
        ]
      },
      fetchImpl
    );
    const entries = readZipEntries(result.packageBytes);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining(["BinData/photo.jpg", "BinData/photo-2.jpg"])
    );
    expect(entries["Contents/content.hpf"]).toContain(
      '<opf:item id="image1" href="BinData/photo.jpg" media-type="image/jpeg" isEmbeded="1"/>'
    );
    expect(entries["Contents/content.hpf"]).toContain(
      '<opf:item id="image2" href="BinData/photo-2.jpg" media-type="image/jpeg" isEmbeded="1"/>'
    );
  });

  it("keeps placeholder fallback and warning when remote image fetch fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
    const result = await exportResolvedDoc(
      {
        type: "doc",
        content: [
          imageNode("https://cdn.example.com/missing.png", {
            objectId: "missing-image"
          })
        ]
      },
      fetchImpl
    );
    const entries = readZipEntries(result.packageBytes);

    expect(Object.keys(entries).some((entry) => entry.startsWith("BinData/"))).toBe(
      false
    );
    expect(entries["Contents/section0.xml"]).toContain(
      "[Object placeholder: image missing-image]"
    );
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "object-placeholder",
        severity: "warning"
      })
    ]);
  });
});
