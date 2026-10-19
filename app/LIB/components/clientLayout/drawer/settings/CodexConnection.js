import { t as uiText, useI18n, translateMessage } from "../../../../i18n";
import { Button, Card, Tag, Typography } from "sud-ui";
import { TbTerminal2 } from "react-icons/tb";
import { useCodex } from "@/app/LIB/context/CodexContext";
import { useSetting } from "@/app/LIB/context/SettingContext";
import CodexUsage from "../../../common/CodexUsage";
import { SmallButton, TitleComponent } from "./CommonComponents";

export default function CodexConnection() {
  useI18n();
  const {
    connection,
    busy,
    loading,
    error,
    signIn,
    cancelSignIn,
    signOut,
    reload,
  } = useCodex();
  const { setting } = useSetting();
  const disabled =
    busy || loading || connection.streaming || connection.generating;
  return (
    <section
      aria-labelledby="codex-settings-title"
      className="flex min-w-0 flex-col gap-2"
    >
      <TitleComponent id="codex-settings-title" icon={TbTerminal2}>
        Codex CLI
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
              {uiText("Codex CLI 사용")}</Typography>
            <Typography size="sm">
              {uiText("Dockit Open에서 Codex CLI를 사용하세요.")}</Typography>
          </div>
          {connection.connected ? (
            <>
              <div className="flex min-w-0 flex-col">
                <Tag
                  color="white-2"
                  background="white-10"
                  size="lg"
                  style={{ width: "full" }}
                >
                  <Typography size="sm" className="[overflow-wrap:anywhere]">
                    {connection.account?.email}
                    {connection.account?.planType
                      ? ` · ${connection.account.planType}`
                      : ""}
                  </Typography>
                </Tag>
              </div>
              <CodexUsage />
            </>
          ) : (
            <>
              <Button
                className="disabled:opacity-50"
                disabled={disabled}
                onClick={signIn}
                color="black-1"
                background="black-10"
                icon={<TbTerminal2 size={21} />}
              >
                <Typography size="sm">{uiText("CLI로 로그인하기")}</Typography>
              </Button>
              {!loading && !connection.available && (
                <div className="flex min-w-0 flex-col gap-2 text-[12px]">
                  <span>{uiText("Codex CLI 설치")}</span>
                  <code className="whitespace-normal [overflow-wrap:anywhere]">
                    npm install -g @openai/codex
                  </code>
                  <div className="flex flex-wrap items-center justify-between">
                    <SmallButton onClick={reload}>{uiText("설치 확인")}</SmallButton>
                  </div>
                </div>
              )}
            </>
          )}
          {connection.signingIn && (
            <div
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[12px]"
              role="status"
            >
              <span>{uiText("브라우저에서 CLI 로그인을 마쳐주세요.")}</span>
              <SmallButton onClick={cancelSignIn}>{uiText("로그인 취소")}</SmallButton>
            </div>
          )}
          {connection.connected && (
            <div className="flex flex-wrap items-center justify-end">
              <SmallButton disabled={disabled} onClick={signOut}>
                {uiText("CLI 로그아웃")}</SmallButton>
            </div>
          )}
          {error && (
            <div
              className="flex flex-col items-start gap-2 rounded-lg bg-[#d33d330d] p-2 text-[12px] text-[#a32a25] [overflow-wrap:anywhere] dark:text-[#ffaaa3]"
              role="alert"
            >
              {translateMessage(error.message)}
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
