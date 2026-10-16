import { Progress, Typography } from "sud-ui";
import { useCodex } from "../../context/CodexContext";
import SmallButton from "./SmallButton";
import { useSetting } from "../../context/SettingContext";

function duration(minutes, index) {
  if (!minutes) return index ? "추가 한도" : "사용 한도";
  if (minutes % 1440 === 0) return `${minutes / 1440}일`;
  if (minutes % 60 === 0) return `${minutes / 60}시간`;
  return `${minutes}분`;
}
export default function CodexUsage() {
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
                        ? "확인 불가"
                        : `${100 - window.usedPercent}% 남음`}
                    </span>
                  </div>
                  {window.usedPercent !== null && (
                    <Progress
                      aria-label={`${bucket.name} ${duration(window.windowDurationMins, index)} 남은 사용량`}
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
                        {new Date(window.resetsAt * 1000).toLocaleString()}{" "}
                        초기화
                      </Typography>
                    )}
                    <SmallButton onClick={refreshUsage}>
                      사용량 새로고침
                    </SmallButton>
                  </div>
                </div>
              ),
          )}
          {!bucket.primary && !bucket.secondary && (
            <span>사용 한도를 확인할 수 없습니다.</span>
          )}
        </div>
      ))}
      {!connection.usage?.buckets?.length && (
        <span>사용량 정보가 없습니다.</span>
      )}
      {usageError && (
        <span role="alert">
          사용량을 불러오지 못했습니다. 다시 시도해주세요.
        </span>
      )}
    </div>
  );
}
