import { describe, expect, it } from "vitest";
import {
  CARD_WIDTH,
  VIEWPORT_PADDING,
  createExternalLinkPreview,
  createFallbackCardData,
  createPreviewPosition,
  normalizePreviewUrl
} from "../../app/LIB/utils/externalLinkPreviewUtils";

describe("externalLinkPreviewUtils", () => {
  it("normalizes only external http urls", () => {
    expect(
      normalizePreviewUrl({
        href: "https://example.com/guide",
        locationHref: "https://dockit.app/docs",
        currentOrigin: "https://dockit.app"
      })
    ).toBe("https://example.com/guide");

    expect(
      normalizePreviewUrl({
        href: "/internal",
        locationHref: "https://dockit.app/docs",
        currentOrigin: "https://dockit.app"
      })
    ).toBeNull();

    expect(
      normalizePreviewUrl({
        href: "mailto:test@example.com",
        locationHref: "https://dockit.app/docs",
        currentOrigin: "https://dockit.app"
      })
    ).toBeNull();
  });

  it("positions preview within viewport bounds", () => {
    const position = createPreviewPosition({
      rect: { left: 500, top: 600, bottom: 620 },
      viewportWidth: 640,
      viewportHeight: 700
    });

    expect(position.left).toBe(
      Math.max(VIEWPORT_PADDING, 640 - CARD_WIDTH - VIEWPORT_PADDING)
    );
    expect(position.top).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
  });

  it("builds fallback card data from preview metadata", () => {
    expect(
      createFallbackCardData({
        hostname: "example.com",
        href: "https://example.com"
      })
    ).toEqual({
      title: "example.com",
      description: "https://example.com",
      image: null,
      siteName: "example.com",
      hostname: "example.com"
    });
  });

  it("creates preview payload from anchor element", () => {
    const preview = createExternalLinkPreview(
      {
        getAttribute(name) {
          return name === "href" ? "https://example.com/post" : null;
        },
        getBoundingClientRect() {
          return { left: 40, top: 100, bottom: 120 };
        }
      },
      {
        locationHref: "https://dockit.app/docs",
        currentOrigin: "https://dockit.app",
        viewportWidth: 800,
        viewportHeight: 900
      }
    );

    expect(preview).toMatchObject({
      href: "https://example.com/post",
      hostname: "example.com",
      left: 40
    });
    expect(preview.top).toBe(132);
  });

  it("returns null for anchors without previewable href", () => {
    expect(
      createExternalLinkPreview(
        {
          getAttribute() {
            return "/internal";
          },
          getBoundingClientRect() {
            return { left: 0, top: 0, bottom: 0 };
          }
        },
        {
          locationHref: "https://dockit.app/docs",
          currentOrigin: "https://dockit.app",
          viewportWidth: 800,
          viewportHeight: 900
        }
      )
    ).toBeNull();
  });
});
