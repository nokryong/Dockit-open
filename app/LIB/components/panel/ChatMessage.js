import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button, Div, Typography } from "sud-ui";
import { TbChevronDown, TbChevronUp, TbPaperclip } from "react-icons/tb";
import ChatMarkdown from "./ChatMarkdown";

export default function ChatMessage({ message, theme, dark, expanded, onToggle }) {
  const isUser = message.role === "user";
  const contentId = useId();
  const content = useRef(null);
  const [canCollapse, setCanCollapse] = useState(false);
  useLayoutEffect(() => {
    if (!isUser || !content.current) return;
    const element = content.current;
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
      setCanCollapse(element.scrollHeight > lineHeight * 8 + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isUser, message.text]);
  const collapsed = canCollapse && !expanded;
  return (
    <div
      data-chat-message={message.id}
      className="flex w-full min-w-0 items-start gap-2 pb-5"
      style={{ flexDirection: isUser ? "row-reverse" : "row" }}
    >
      <Div
        className="inline-block min-w-0 max-w-[90%] break-words rounded-2xl p-2.5"
        background={isUser ? `${theme}-1` : "transparent"}
        color={isUser ? "white-1" : "black-9"}
      >
        {message.attachments?.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {message.attachments.map((file) => (
              <span key={file.id} className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-lg border border-current/15 px-2 py-1">
                <TbPaperclip size={14} className="shrink-0" />
                <Typography size="xs" className="truncate" title={file.name}>{file.name}</Typography>
              </span>
            ))}
          </div>
        )}
        <div
          id={contentId}
          className="overflow-hidden leading-[1.6]"
          style={collapsed ? {
            maxHeight: "12.8em",
            maskImage: "linear-gradient(to bottom, black calc(100% - 2.5em), transparent)",
          } : undefined}
        >
          <div ref={content}>
            <ChatMarkdown text={message.text || ""} dark={dark} theme={theme} streaming={["pending", "streaming"].includes(message.status)} />
          </div>
        </div>
        {canCollapse && (
          <Button
            size="sm"
            colorType="text"
            color={`${theme}-8`}
            background="transparent"
            border={false}
            className="mt-2"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={onToggle}
          >
            <span className="flex items-center gap-1">
              <Typography size="sm" pretendard="SB">{expanded ? "간략히 보기" : "더 보기"}</Typography>
              {expanded ? <TbChevronUp /> : <TbChevronDown />}
            </span>
          </Button>
        )}
        {message.image && <img src={message.image} alt="생성된 이미지" className="mt-2 max-w-full rounded-lg" />}
        {!isUser && ["failed", "cancelled"].includes(message.status) && (
          <div className="chatgpt-message-status">
            {message.status === "cancelled" ? "응답 중지됨" : "응답 미완료"}
          </div>
        )}
      </Div>
    </div>
  );
}
