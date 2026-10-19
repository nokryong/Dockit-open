import { t as uiText, useI18n } from "../../../../i18n";
import { Button, Card, Modal, Select, Typography } from "sud-ui";
import { VscOpenai } from "react-icons/vsc";
import { useChatGPT } from "@/app/LIB/context/ChatGPTContext";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";
import { useSetting } from "@/app/LIB/context/SettingContext";
import { withOverlayShadow } from "@/app/LIB/constant/uiProps";
import ChatGPTError from "../../../common/ChatGPTError";
import { SmallButton, TitleComponent } from "./CommonComponents";

export default function ChatGPTConnection() {
  useI18n();
  const {
    connection,
    loading,
    busy,
    notice,
    error,
    signIn,
    cancelSignIn,
    signOut,
    selectProfile,
    openUsage,
    acknowledge,
  } = useChatGPT();
  const { active, profiles, signingIn, streaming } = connection;
  const { setting } = useSetting();
  const { isDarkMode } = useDarkMode();
  const disabled = loading || busy || signingIn || streaming;
  const welcome = active?.sharing && !active.welcomeSeen;
  return (
    <section
      aria-labelledby="chatgpt-settings-title"
      className="flex min-w-0 flex-col gap-2"
    >
      <TitleComponent id="chatgpt-settings-title" icon={VscOpenai}>
        ChatGPT
      </TitleComponent>
      <Card
        width="100%"
        shadow="none"
        border={false}
        background={`${setting.theme}-1`}
      >
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-col">
            <Typography pretendard="SB" size="md">
              {uiText("내 ChatGPT 요금제 사용")}</Typography>
            <Typography size="sm">
              {uiText("Dockit Open에서 ChatGPT 요금제를 사용하세요.")}</Typography>
          </div>
          {profiles.length > 0 && (
            <>
              <Select
                size="sm"
                label={uiText("현재 계정")}
                aria-label={uiText("ChatGPT 연결 계정")}
                value={active?.id || ""}
                onChange={(value) => selectProfile(value)}
                disabled={disabled}
                options={[
                  ...profiles.map((profile) => ({
                    value: profile.id,
                    label: `${profile.email}${
                      profile.connected ? "" : uiText(" · 연결 필요")
                    }`,
                  })),
                ]}
              />
            </>
          )}
          {!active?.sharing && (
            <>
              <Button
                className="disabled:opacity-50"
                disabled={disabled}
                onClick={() =>
                  signIn({
                    consent: Boolean(active?.connected && !active.sharing),
                  })
                }
                color="black-1"
                background="black-10"
                icon={<VscOpenai size={21} />}
              >
                <Typography size="sm">Continue with ChatGPT</Typography>
              </Button>
            </>
          )}
          {signingIn && (
            <div
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[12px]"
              role="status"
            >
              <span>{uiText("브라우저에서 연결을 마쳐주세요.")}</span>
              <SmallButton onClick={cancelSignIn}>{uiText("취소")}</SmallButton>
            </div>
          )}
          {profiles.length > 0 && (
            <div className="flex flex-wrap items-center justify-between">
              <div>
                <SmallButton
                  disabled={disabled}
                  onClick={() => signIn({ newProfile: true })}
                >
                  {uiText("계정 추가")}</SmallButton>
                {active?.sharing && (
                  <SmallButton
                    disabled={disabled}
                    onClick={() =>
                      signIn({ consent: error?.detail?.action === "consent" })
                    }
                  >
                    {uiText("다시 연결")}</SmallButton>
                )}
                {active?.connected && (
                  <SmallButton disabled={disabled} onClick={signOut}>
                    {uiText("연결 해제")}</SmallButton>
                )}
                {!active?.sharing && (
                  <SmallButton onClick={openUsage}>{uiText("사용량 관리 ↗")}</SmallButton>
                )}
              </div>
              <SmallButton onClick={openUsage}>{uiText("사용량 관리 ↗")}</SmallButton>
            </div>
          )}
          {notice && (
            <p
              className="m-0 text-[12px] [overflow-wrap:anywhere]"
              role="status"
            >
              {notice}
            </p>
          )}
          <ChatGPTError />
        </div>
      </Card>
      <Modal
        open={Boolean(welcome)}
        onClose={acknowledge}
        style={withOverlayShadow(
          { maxWidth: "420px", width: "calc(100vw - 40px)" },
          isDarkMode,
        )}
      >
        <div className="flex flex-col items-center gap-4 p-3 text-center">
          <VscOpenai size={48} className="shrink-0" />
          <Typography as="h2" pretendard="B" size="lg">
            {uiText("ChatGPT 요금제를 사용합니다")}</Typography>
          <Typography size="sm">
            {uiText("Dockit Open의 AI 채팅에 내 ChatGPT 요금제 또는 크레딧이 사용돼요. ChatGPT 설정에서 사용량과 한도를 관리할 수 있어요.")}</Typography>
          <SmallButton onClick={openUsage}>{uiText("사용량 관리 ↗")}</SmallButton>
          <Button
            onClick={acknowledge}
            disabled={busy}
            background={`${setting.theme}-7`}
            color={`${setting.theme}-1`}
            border={false}
          >
            {uiText("확인")}</Button>
        </div>
      </Modal>
    </section>
  );
}
