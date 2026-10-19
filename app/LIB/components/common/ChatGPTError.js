import { t as uiText, useI18n, translateMessage } from "../../i18n";
import { useChatGPT } from '../../context/ChatGPTContext';

export default function ChatGPTError() {
  useI18n();
  const { error, openUsage } = useChatGPT();
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-lg bg-[#d33d330d] p-2 text-[12px] text-[#a32a25] [overflow-wrap:anywhere] dark:text-[#ffaaa3]"
    >
      <span>{translateMessage(error.message)}</span>
      {error.detail?.action === "usage" && (
        <button
          type="button"
          className="cursor-pointer rounded-lg border-0 bg-black px-3 py-2 text-white focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-current focus-visible:outline-offset-[3px]"
          onClick={openUsage}
        >
          {uiText("사용량 관리")}
        </button>
      )}
    </div>
  );
}
