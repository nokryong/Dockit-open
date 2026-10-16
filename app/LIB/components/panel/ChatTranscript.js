import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import SmallButton from "../common/SmallButton";
import ChatMessage from "./ChatMessage";

const PAGE_SIZE = 30;

function HistoryHeader({ context }) {
  return context.hasOlder ? (
    <div className="flex justify-center pb-3">
      <SmallButton onClick={context.loadOlder}>이전 대화 보기</SmallButton>
    </div>
  ) : null;
}

function ActivityFooter({ context }) {
  return context.footer;
}

const components = { Header: HistoryHeader, Footer: ActivityFooter };

export default function ChatTranscript({ messages, theme, dark = false, children }) {
  const [first, setFirst] = useState(() => Math.max(0, messages.length - PAGE_SIZE));
  const [expanded, setExpanded] = useState(() => new Set());
  const [height, setHeight] = useState(350);
  const atBottom = useRef(true);
  const virtuoso = useRef(null);
  const data = useMemo(() => messages.slice(first), [messages, first]);
  const loadOlder = useCallback(() => setFirst((value) => Math.max(0, value - PAGE_SIZE)), []);
  const toggle = (id) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const last = messages.at(-1);
  useEffect(() => {
    // Streaming changes an existing row, rather than the number of rows.
    if (atBottom.current) virtuoso.current?.autoscrollToBottom();
  }, [last?.text, last?.image, last?.activity]);
  if (!messages.length) return <div aria-label="AI 대화" />;
  return (
    <Virtuoso
      ref={virtuoso}
      aria-label="AI 대화"
      className="w-full overflow-y-auto pt-3 text-[16px]"
      style={{ height, overflowAnchor: "none" }}
      data={data}
      firstItemIndex={first}
      initialTopMostItemIndex={{ index: "LAST", align: "end" }}
      computeItemKey={(index, message) => message.id ?? index}
      followOutput="auto"
      atBottomStateChange={(value) => { atBottom.current = value; }}
      atBottomThreshold={40}
      increaseViewportBy={{ top: 200, bottom: 100 }}
      startReached={loadOlder}
      totalListHeightChanged={(value) => setHeight(Math.min(350, Math.max(1, value)))}
      components={components}
      context={{ hasOlder: first > 0, loadOlder, footer: children }}
      itemContent={(index, message) => (
        <ChatMessage
          message={message}
          theme={theme}
          dark={dark}
          expanded={expanded.has(message.id ?? index)}
          onToggle={() => toggle(message.id ?? index)}
        />
      )}
    />
  );
}
