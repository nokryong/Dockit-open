import { t as uiText, useI18n, getDateLocale } from "../../i18n";
import { Progress, Typography } from "sud-ui";
import { useCodex } from "../../context/CodexContext";
import SmallButton from "./SmallButton";
import { useSetting } from "../../context/SettingContext";

function duration(minutes, index) {
  if (!minutes) return index ? uiText("추가 한도") : uiText("사용 한도");
  if (minutes % 1440 === 0) return uiText("{0}일", minutes / 1440);
  if (minutes % 60 === 0) return uiText("{0}시간", minutes / 60);
  return uiText("{0}분", minutes);
}
export default function CodexUsage() {
  useI18n();
  const { connection, refreshUsage, usageError } = useCodex();
  const { setting } = useSetting();
  return (
    <div className="flex min-w-0 flex-col ">
      {connection.usage?.buckets?.map((bucket) => (
        <div key={bucket.id} className="flex min-w-0 flex-col ">
          {connection.usage.buckets.length > 1 && <span>{bucket.name}</span>}
          {[bucket.primary, bucket.secondary].map(
            (window, index) =>
              window && (
                <div key={index} className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[12px]">
                    <span>{duration(window.windowDurationMins, index)}</span>
                    <span>
                      {window.usedPercent === null
                        ? uiText("확인 불가")
                        : uiText("{0}% 남음", 100 - window.usedPercent)}
                    </span>
                  </div>
                  {window.usedPercent !== null && (
                    <Progress
                      aria-label={uiText("{0} {1} 남은 사용량", bucket.name, duration(window.windowDurationMins, index))}
                      max={100}
                      value={100 - window.usedPercent}
                      showText={false}
                      backgroundColor="white-10"
                      color={`${setting.theme}-7`}
                    />
                  )}
                  <div className="flex flex-wrap items-center justify-between">
                    {window.resetsAt && (
                      <Typography size="xs">
                        {new Date(window.resetsAt * 1000).toLocaleString(getDateLocale())}{" "}
                        {uiText("초기화")}</Typography>
                    )}
                    <SmallButton onClick={refreshUsage}>
                      {uiText("사용량 새로고침")}</SmallButton>
                  </div>
                </div>
              ),
          )}
          {!bucket.primary && !bucket.secondary && (
            <span>{uiText("사용 한도를 확인할 수 없습니다.")}</span>
          )}
        </div>
      ))}
      {!connection.usage?.buckets?.length && (
        <span>{uiText("사용량 정보가 없습니다.")}</span>
      )}
      {usageError && (
        <span role="alert">
          {uiText("사용량을 불러오지 못했습니다. 다시 시도해주세요.")}</span>
      )}
    </div>
  );
}
