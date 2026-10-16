import { VscOpenai } from "react-icons/vsc";
import WidgetCard from "./WidgetCard";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ChatTranscript from "./ChatTranscript";
import {
  Button,
  Card,
  Div,
  Divider,
  Menu,
  Popover,
  Slider,
  Switch,
  Textarea,
  Typography,
  resolveColor,
  useTheme,
} from "sud-ui";
import {
  TbArrowUp,
  TbCheck,
  TbPaperclip,
  TbPlayerStopFilled,
  TbPlus,
  TbX,
} from "react-icons/tb";
import { RxPencil2 } from "react-icons/rx";
import { useSetting } from "../../context/SettingContext";

import { useDarkMode } from "../../context/DarkModeContext";
import { useChatGPT } from "../../context/ChatGPTContext";
import { useCodex } from "../../context/CodexContext";
import { useDrawer } from "../../context/DrawerContext";
import ChatGPTError from "../common/ChatGPTError";
import SmallButton from "../common/SmallButton";
import "../../css/chatgpt.css";
import {
  inputProps,
  newShadowDarkSm,
  newShadowLightSm,
} from "../../constant/uiProps";
import { PiLightning, PiLightningFill } from "react-icons/pi";
import { LuDot } from "react-icons/lu";

const reasoningEffortLabels = {
  low: "Light",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultra: "Ultra",
};

function ReasoningEffortSlider({
  modelId,
  models,
  onSelectModel,
  onRefreshModels,
  modelLabel,
  theme,
  value,
  options,
  disabled,
  onSelect,
}) {
  const uiTheme = useTheme();
  const efforts = [
    ...new Set(
      options
        .map((option) =>
          typeof option === "string"
            ? option
            : (option.reasoningEffort ?? option.effort),
        )
        .filter((effort) => typeof effort === "string" && effort.length > 0),
    ),
  ];
  const [showModels, setShowModels] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const reasoningPanel = useRef(null);
  const modelPanel = useRef(null);
  useLayoutEffect(() => {
    const panel = showModels ? modelPanel.current : reasoningPanel.current;
    if (!panel) return;
    const measure = () =>
      setPanelHeight(Math.ceil(panel.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [showModels, models.length]);
  useEffect(() => {
    if (showModels) {
      const items = [
        ...modelPanel.current.querySelectorAll('[role="menuitem"]'),
      ];
      const selected = Math.max(
        0,
        models.findIndex((model) => model.slug === modelId),
      );
      items.forEach((item, index) => {
        item.tabIndex = index === selected ? 0 : -1;
      });
      items[selected]?.focus({ preventScroll: true });
    } else {
      reasoningPanel.current
        ?.querySelector("button")
        ?.focus({ preventScroll: true });
    }
  }, [showModels]);
  const [draft, setDraft] = useState(null);
  const [dragSession, setDragSession] = useState(0);
  const dragging = useRef(false);
  const pending = useRef(null);
  const commit = useRef(null);
  const current = draft ?? value;
  const index = efforts.indexOf(current);
  const label = reasoningEffortLabels[current] ?? current;
  commit.current = () => {
    const next = pending.current;
    pending.current = null;
    if (next === null) return;
    if (next === value) {
      setDraft(null);
      return;
    }
    const reset = () =>
      setDraft((previous) => (previous === next ? null : previous));
    Promise.resolve(onSelect(next)).then(reset, reset);
  };
  useEffect(() => {
    const finish = () => {
      if (dragging.current) {
        dragging.current = false;
        // Reset sud-ui internal dragging even if mouseup arrived while disabled.
        setDragSession((previous) => previous + 1);
      }
      commit.current();
    };
    const recoverRelease = (event) => {
      if (dragging.current && !(event.buttons & 1)) finish();
    };
    window.addEventListener("mouseup", finish);
    window.addEventListener("blur", finish);
    window.addEventListener("mousemove", recoverRelease);
    return () => {
      window.removeEventListener("mouseup", finish);
      window.removeEventListener("blur", finish);
      window.removeEventListener("mousemove", recoverRelease);
    };
  }, []);
  useEffect(() => {
    pending.current = null;
    dragging.current = false;
    setDraft(null);
  }, [modelId]);
  const selectModelItem = async (key) => {
    if (disabled) return;
    const result = await onSelectModel(key);
    if (result !== null && result?.ok !== false) setShowModels(false);
  };
  const navigateModels = (event) => {
    const items = [...modelPanel.current.querySelectorAll('[role="menuitem"]')];
    const focused = items.indexOf(document.activeElement);
    let next = focused;
    if (event.key === "ArrowDown") next = (focused + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (focused - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      if (focused < 0) return;
      event.preventDefault();
      items[focused].click();
      return;
    } else return;
    event.preventDefault();
    items.forEach((item, index) => {
      item.tabIndex = index === next ? 0 : -1;
    });
    items[next]?.focus();
  };
  const panelMotion =
    "absolute inset-x-0 top-0 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none";
  return (
    <div
      className="relative w-64 max-w-[calc(100vw-2rem)] overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none"
      style={{ height: panelHeight }}
    >
      <div
        ref={reasoningPanel}
        aria-hidden={showModels}
        inert={showModels}
        className={
          panelMotion +
          " flex flex-col justify-center gap-3 px-4 pb-2 pt-1 " +
          (showModels
            ? "-translate-x-2 opacity-0 pointer-events-none"
            : "translate-x-0 opacity-100")
        }
      >
        <Button
          colorType="text"
          ariaLabel="모델 목록 열기"
          disabled={disabled}
          onClick={() => {
            setShowModels(true);
            onRefreshModels();
          }}
        >
          <div className="flex w-full flex-col items-center justify-center text-center">
            <Typography size="md" pretendard="SB" color={theme + "-8"}>
              {label}
            </Typography>
            <Typography size="sm">{modelLabel}</Typography>
          </div>
        </Button>
        <Slider
          key={modelId + ":" + dragSession}
          onMouseDownCapture={(event) => {
            if (!disabled && event.button === 0) dragging.current = true;
          }}
          popupProps={{ open: false }}
          size="lg"
          width="100%"
          trackColor={theme + "-1"}
          background={theme + "-7"}
          thumbSize={30}
          min={0}
          max={Math.max(1, efforts.length - 1)}
          step={1}
          value={Math.max(0, index)}
          ariaLabel="추론 강도"
          ariaValueText={label}
          disabled={disabled || efforts.length < 2 || index < 0}
          onChange={(position) => {
            if (disabled) return;
            const next = efforts[position];
            if (!next) return;
            pending.current = next;
            setDraft(next);
          }}
          onKeyUp={() => commit.current()}
          onBlur={() => {
            if (!dragging.current) commit.current();
          }}
        />
      </div>
      <div
        ref={modelPanel}
        aria-hidden={!showModels}
        inert={!showModels || disabled}
        onKeyDown={navigateModels}
        className={
          panelMotion +
          " max-h-72 overflow-y-auto " +
          (showModels
            ? "translate-x-0 opacity-100"
            : "translate-x-2 opacity-0 pointer-events-none")
        }
      >
        <Menu
          aria-label="모델 목록"
          expandType="popover"
          selectedKey={modelId}
          selectedColor={resolveColor(theme + "-2", uiTheme)}
          selectedTextColor={resolveColor(theme + "-9", uiTheme)}
          hoverColor={resolveColor(theme + "-1", uiTheme)}
          className="w-full [&_.sud-menu__item>span]:w-full"
          onSelect={selectModelItem}
          items={models.map((model) => ({
            key: model.slug,
            label: (
              <span className="flex w-full min-w-0 items-center justify-between gap-2">
                <Typography size="sm" pretendard="SB" className="truncate">
                  {model.name}
                </Typography>
                {model.slug === modelId && (
                  <TbCheck size={16} className="shrink-0" aria-hidden="true" />
                )}
              </span>
            ),
          }))}
        />
      </div>
    </div>
  );
}

export default function ChatGPTWidget({ dragHandleProps }) {
  const chatgpt = useChatGPT();
  const codex = useCodex();
  const { setting, setSetting } = useSetting();
  const usingCodex = setting.aiProvider === "codex";
  const {
    models,
    messages,
    send,
    cancelResponse,
    clearHistory,
    selectModel,
    selectReasoningEffort,
    selectServiceTier,
    refreshModels,
    busy,
  } = usingCodex ? codex : chatgpt;
  const connection = usingCodex
    ? {
        ...codex.connection,
        active: {
          sharing: codex.connection.connected,
          model: codex.connection.model,
          reasoningEffort: codex.connection.reasoningEffort,
          serviceTier: codex.connection.serviceTier,
        },
      }
    : chatgpt.connection;
  const selectedModel = models.find(
    (model) => model.slug === connection.active?.model,
  );
  const fastSupported =
    selectedModel?.serviceTiers?.some(
      (tier) => tier.id === "priority" || tier.id === "fast",
    ) ?? false;
  const fastEnabled = ["priority", "fast"].includes(
    connection.active?.serviceTier,
  );
  const modelLabel = selectedModel?.name ?? connection.active?.model ?? "";
  const reasoningEffort =
    connection.active?.reasoningEffort ??
    selectedModel?.defaultReasoningEffort ??
    "";
  const reasoningEffortLabel =
    reasoningEffortLabels[reasoningEffort] ?? reasoningEffort;
  const { openOnlySettingsDrawer } = useDrawer();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attaching, setAttaching] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const attachmentAccount = usingCodex
    ? codex.connection.account?.id
    : chatgpt.connection.active?.id;
  useEffect(() => {
    setAttachments([]);
    setAttachmentError("");
  }, [setting.aiProvider, attachmentAccount]);
  const loading = connection.streaming || sending;
  const activity =
    messages.findLast(
      (message) => message.role === "assistant" && message.activity,
    )?.activity ?? (loading ? "응답 준비 중" : "응답 완료");
  const chooseAttachments = async () => {
    if (loading || busy || attaching || !connection.active?.sharing) return;
    setAttaching(true);
    setAttachmentError("");
    try {
      if (!window.dockitLocal?.chooseChatAttachments)
        throw new Error("첨부 기능을 적용하려면 앱을 다시 실행해주세요.");
      const files = await window.dockitLocal.chooseChatAttachments(
        usingCodex ? "codex" : "chatgpt",
      );
      setAttachments((previous) => [...previous, ...files]);
    } catch (failure) {
      setAttachmentError(failure.message || "파일을 첨부하지 못했습니다.");
    } finally {
      setAttaching(false);
    }
  };
  const submit = async () => {
    if (
      loading ||
      busy ||
      attaching ||
      (!input.trim() && !attachments.length) ||
      !connection.active?.sharing ||
      !models.length
    )
      return;
    const text = input;
    const files = attachments;
    setInput("");
    setAttachments([]);
    setSending(true);
    try {
      if (!(await send(text, files))) {
        setInput((current) => current || text);
        setAttachments(files);
      }
    } finally {
      setSending(false);
    }
  };

  const { isDarkMode } = useDarkMode();

  return (
    <WidgetCard
      icon={VscOpenai}
      title="ChatGPT"
      dragHandleProps={dragHandleProps}
      widgetType="aiChat"
      titleBtn={
        <div className="flex items-center gap-2 whitespace-nowrap">
          {chatgpt.connection.active?.connected && (
            <SmallButton
              className="whitespace-nowrap"
              onClick={chatgpt.openUsage}
            >
              사용량 관리 ↗
            </SmallButton>
          )}
          <Switch
            size="sm"
            ariaLabel="GPT/Codex 전환"
            checked={usingCodex}
            onText={<Typography size="xs">Codex</Typography>}
            offText={<Typography size="xs">Chat</Typography>}
            onColor={`${setting.theme}-7`}
            disabled={
              chatgpt.connection.streaming ||
              codex.connection.streaming ||
              sending ||
              attaching
            }
            onChange={(checked) =>
              setSetting((previous) => ({
                ...previous,
                aiProvider: checked ? "codex" : "chatgpt",
              }))
            }
          />
        </div>
      }
    >
      <div className="w-full flex flex-col gap-2 ">
        {connection.active?.sharing ? (
          messages.length > 0 && (
            <div className="flex justify-end w-full">
              <SmallButton
                disabled={loading || busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "이 계정의 현재 대화를 지우고 새로 시작할까요?",
                    )
                  )
                    clearHistory();
                }}
              >
                새 대화
              </SmallButton>
            </div>
          )
        ) : (
          <div className="chatgpt-actions">
            <Typography size="sm">
              {usingCodex
                ? "설정에서 CLI로 로그인해주세요."
                : "설정에서 ChatGPT를 연결해주세요."}
            </Typography>
            <SmallButton onClick={openOnlySettingsDrawer}>
              설정 열기
            </SmallButton>
          </div>
        )}

        {usingCodex ? (
          codex.error && (
            <div className="chatgpt-error" role="alert">
              {codex.error.message}
            </div>
          )
        ) : (
          <ChatGPTError />
        )}

        <Divider style={{ margin: 0 }} />

        <ChatTranscript
          key={[
            setting.aiProvider,
            attachmentAccount,
            messages[0]?.id ?? "empty",
          ].join(":")}
          messages={messages}
          theme={setting.theme}
          dark={isDarkMode}
        >
          {loading && !messages.at(-1)?.text && (
            <div className="flex justify-start items-center w-full gap-2">
              <Typography
                color={`${setting.theme}`}
                className="flex items-center gap-1 text-shimmer"
                pretendard="SB"
              >
                <RxPencil2 />
                <span className="">{activity}</span>
                <span
                  className="activity-dots inline-flex shrink-0"
                  aria-hidden="true"
                >
                  {[0, 1, 2].map((dot) => (
                    <LuDot key={dot} className="shrink-0" />
                  ))}
                </span>
              </Typography>
            </div>
          )}
        </ChatTranscript>

        <Div
          className="rounded-xl p-1"
          width="100%"
          shadow="md"
          border={true}
          borderColor="white-9"
          background="white-10"
        >
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {attachments.map((file) => (
                <Div
                  key={file.id}
                  background={`${setting.theme}-1`}
                  className="flex max-w-full min-w-0 items-center gap-1 rounded-lg py-1 pl-2"
                >
                  <TbPaperclip size={14} className="shrink-0" />
                  <Typography size="xs" className="truncate" title={file.name}>
                    {file.name}
                  </Typography>
                  <Button
                    size="sm"
                    shape="circle"
                    border={false}
                    background="transparent"
                    color="black-9"
                    className="h-6! w-6! shrink-0 p-0!"
                    ariaLabel={`${file.name} 첨부 취소`}
                    icon={<TbX size={14} />}
                    disabled={loading || attaching}
                    onClick={() =>
                      setAttachments((previous) =>
                        previous.filter((item) => item.id !== file.id),
                      )
                    }
                  />
                </Div>
              ))}
            </div>
          )}
          {attachmentError && (
            <p
              role="alert"
              className="mb-2 text-xs text-red-600 dark:text-red-400"
            >
              {attachmentError}
            </p>
          )}
          <Textarea
            value={input}
            {...inputProps}
            className="[&_textarea]:text-[15px]!"
            background="transparent"
            onChange={(e) => {
              setInput(e.target.value);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="메시지를 입력하세요"
            rows={2}
            shadow="none"
            bottomLeft={
              <Button
                size="sm"
                shape="circle"
                border={false}
                background="transparent"
                color="black-9"
                className="h-8! w-8! shrink-0 p-0! disabled:opacity-50"
                ariaLabel="파일 첨부"
                icon={<TbPlus size={20} />}
                disabled={
                  loading || busy || attaching || !connection.active?.sharing
                }
                onClick={chooseAttachments}
              />
            }
            bottomRight={
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex min-w-0 items-center">
                  {/* fast모드 활성화 버튼 - 변경 시 아이콘도 변경 */}
                  <Button
                    size="sm"
                    colorType="text"
                    icon={fastEnabled ? <PiLightningFill /> : <PiLightning />}
                    ariaLabel="Fast 모드"
                    ariaPressed={fastEnabled}
                    color={fastEnabled ? setting.theme + "-7" : "black-7"}
                    disabled={
                      loading ||
                      busy ||
                      attaching ||
                      !connection.active?.sharing ||
                      !fastSupported
                    }
                    onClick={() =>
                      selectServiceTier(fastEnabled ? "default" : "priority")
                    }
                  />
                  <Popover
                    trigger="click"
                    closeOnClick={false}
                    followTrigger
                    arrow={false}
                    placement="top"
                    content={
                      <ReasoningEffortSlider
                        key={[setting.aiProvider, attachmentAccount].join(":")}
                        modelId={connection.active?.model}
                        models={models}
                        onSelectModel={selectModel}
                        onRefreshModels={refreshModels}
                        modelLabel={modelLabel}
                        theme={setting.theme}
                        value={reasoningEffort}
                        options={selectedModel?.supportedReasoningEfforts ?? []}
                        disabled={
                          loading ||
                          busy ||
                          attaching ||
                          !connection.active?.sharing
                        }
                        onSelect={selectReasoningEffort}
                      />
                    }
                  >
                    <Button size="sm" shape="capsule" colorType="text">
                      <Typography pretendard="SB">{modelLabel}</Typography>{" "}
                      <Typography>{reasoningEffortLabel}</Typography>
                    </Button>
                  </Popover>
                </div>
                <Button
                  size="sm"
                  shape="circle"
                  className="h-8! w-8! shrink-0 p-0! disabled:opacity-50"
                  icon={
                    loading ? (
                      <TbPlayerStopFilled size={14} />
                    ) : (
                      <TbArrowUp size={20} />
                    )
                  }
                  ariaLabel={loading ? "AI 응답 중지" : "ChatGPT 전송"}
                  onClick={loading ? () => cancelResponse() : submit}
                  disabled={
                    !loading &&
                    (busy ||
                      attaching ||
                      (!input.trim() && !attachments.length) ||
                      !connection.active?.sharing ||
                      !models.length)
                  }
                  border={false}
                  {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
                  background="black-10"
                  color="black-1"
                />
              </div>
            }
          />
        </Div>
      </div>
    </WidgetCard>
  );
}
