"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { toast, Typography } from "sud-ui";
import { withOverlayShadow } from "../../constant/uiProps";
import { useDarkMode } from "../../context/DarkModeContext";
import {
  CARD_WIDTH,
  IMAGE_HEIGHT,
  createFallbackCardData
} from "../../utils/externalLinkPreviewUtils";

export default function ExternalLinkPreviewPopover({
  preview,
  onMouseEnter,
  onMouseLeave
}) {
  const { isDarkMode, currentColors } = useDarkMode();
  const [isCopied, setIsCopied] = useState(false);
  const previewHref = preview?.href ?? null;
  const previewHostname = preview?.hostname ?? "";

  useEffect(() => {
    setIsCopied(false);
  }, [previewHref]);

  const cardData = previewHref
    ? createFallbackCardData({ href: previewHref, hostname: previewHostname })
    : null;

  if (!preview || !cardData || typeof document === "undefined") {
    return null;
  }

  const handleCopyLink = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("clipboard-unavailable");
      }

      await navigator.clipboard.writeText(preview.href);
      setIsCopied(true);
      toast.success("링크를 복사했습니다.");
    } catch {
      toast.danger("링크를 복사하지 못했습니다.");
    }
  };

  return createPortal(
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        top: preview.top,
        left: preview.left,
        display: "block",
        width: CARD_WIDTH,
        zIndex: 1300,
        borderRadius: 14,
        background: currentColors.white[10],
        ...withOverlayShadow({}, isDarkMode),
        overflow: "hidden",
        textDecoration: "none"
      }}
    >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            height: IMAGE_HEIGHT,
            padding: 16,
            background:
              `linear-gradient(135deg, ${currentColors.white[8]} 0%, ${currentColors.white[10]} 55%, ${currentColors.white[9]} 100%)`
          }}
        >
          <div
            style={{
              maxWidth: "100%",
              padding: "6px 10px",
              borderRadius: 999,
              background: currentColors.white[9],
              color: currentColors.black[10],
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            {cardData.siteName || preview.hostname}
          </div>
        </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <Typography
          size="sm"
          pretendard="SB"
          color="black-9"
          style={{
            display: "-webkit-box",
            overflow: "hidden",
            textOverflow: "ellipsis",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2
          }}
        >
          {cardData.title || preview.hostname}
        </Typography>
        <Typography
          size="xs"
          color="cool-gray-8"
          style={{
            display: "-webkit-box",
            minHeight: 34,
            marginTop: 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2
          }}
        >
          {cardData.description || preview.href}
        </Typography>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 10
          }}
        >
          <Typography
            size="xs"
            color="blue-7"
            style={{
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {cardData.siteName || preview.hostname}
          </Typography>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer"
              }}
            >
              <Typography size="xs" color="cool-gray-7">
                {isCopied ? "복사됨" : "링크 복사"}
              </Typography>
            </button>
            <a
              href={preview.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              style={{ textDecoration: "none" }}
            >
              <Typography size="xs" color="cool-gray-7">
                새 탭에서 열기
              </Typography>
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
