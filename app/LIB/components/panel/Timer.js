import { t as uiText, useI18n } from "../../i18n";
import {
  Segmented,
  Button,
  Input,
  Typography,
  Card,
  Progress,
  Modal,
  Div
} from "sud-ui";
import WidgetCard from "./WidgetCard";
import { TimerOutline } from "sud-icons";
import { useState, useEffect, useRef, useCallback } from "react";
import { PiPauseFill, PiPlayFill, PiStopFill } from "react-icons/pi";
import { LuAlarmClockCheck } from "react-icons/lu";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";
import {
  inputProps,
  newShadowDarkMdInset,
  newShadowDarkSm,
  newShadowLightMdInset,
  newShadowLightSm,
  withOverlayShadow
} from "../../constant/uiProps";

export default function Timer({ dragHandleProps }) {
  useI18n();
  const { setting } = useSetting();
  const { isDarkMode } = useDarkMode();
  const [selected, setSelected] = useState("timer");
  const [isRunning, setIsRunning] = useState(false);
  const [time, setTime] = useState(0); // 밀리초
  const [inputTime, setInputTime] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0
  });
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const intervalRef = useRef(null);
  const audioRef = useRef(null);
  const inputTimeRef = useRef(inputTime);

  const options = [
    { value: "timer", label: uiText("타이머") },
    { value: "stopwatch", label: uiText("스톱워치") }
  ];

  // 시간 포맷팅 (HH:MM:SS.mmm)
  const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const ms = milliseconds % 1000;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${ms
      .toString()
      .padStart(3, "0")}`;
  };

  // 타이머 시작/일시정지
  const toggleTimer = () => {
    if (isRunning) {
      clearInterval(intervalRef.current);
      setIsRunning(false);
    } else {
      // 타이머 모드일 때는 항상 입력된 시간으로 설정
      if (selected === "timer") {
        const totalMs =
          (inputTime.hours * 3600 +
            inputTime.minutes * 60 +
            inputTime.seconds) *
          1000;
        setTime(totalMs);
      }

      setIsRunning(true);
      intervalRef.current = setInterval(() => {
        if (selected === "timer") {
          setTime((prev) => {
            if (prev <= 0) {
              clearInterval(intervalRef.current);
              setIsRunning(false);
              setShowCompleteModal(true);
              // 알람 소리 재생
              playAlarmSound();
              return 0;
            }
            return prev - 10; // 10ms씩 감소
          });
        } else {
          setTime((prev) => prev + 10); // 10ms씩 증가
        }
      }, 10);
    }
  };

  // 타이머 리셋
  const resetTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    setIsRunning(false);
    if (selected === "timer") {
      const totalMs =
        (inputTime.hours * 3600 + inputTime.minutes * 60 + inputTime.seconds) *
        1000;
      setTime(totalMs);
    } else {
      setTime(0);
    }
  }, [inputTime.hours, inputTime.minutes, inputTime.seconds, selected]);

  useEffect(() => {
    inputTimeRef.current = inputTime;
  }, [inputTime]);

  // 컴포넌트 언마운트 시 인터벌 정리
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // 알람 소리 재생 함수
  const playAlarmSound = () => {
    try {
      const audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();
      const now = audioContext.currentTime;

      // 알람 비프음의 속성 설정
      const beepDuration = 0.1; // 각 비프음의 길이 (초)
      const gapDuration = 0.15; // 비프음 사이의 간격 (초)
      const numberOfBeeps = 4; // 비프음 반복 횟수

      // 설정된 횟수만큼 비프음 재생을 예약합니다.
      for (let i = 0; i < numberOfBeeps; i++) {
        const startTime = now + i * (beepDuration + gapDuration);

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // 1. 더 날카로운 'sawtooth'(톱니파) 파형 사용
        oscillator.type = "sawtooth";

        // 2. 두 개의 톤을 번갈아 사용하여 긴장감 조성
        oscillator.frequency.value = i % 2 === 0 ? 1000 : 1200;

        // 3. 각 비프음이 명확하게 끊어지도록 볼륨 조절(Attack/Decay)
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.01); // 빠르게 볼륨 올리기
        gainNode.gain.exponentialRampToValueAtTime(
          0.001,
          startTime + beepDuration
        ); // 빠르게 볼륨 내리기

        oscillator.start(startTime);
        oscillator.stop(startTime + beepDuration);
      }
    } catch (error) {
      console.error(uiText("알람 소리 재생 실패:"), error);
    }
  };

  // 타이머/스톱워치 전환 시 리셋
  useEffect(() => {
    clearInterval(intervalRef.current);
    setIsRunning(false);

    if (selected === "timer") {
      const totalMs =
        (inputTimeRef.current.hours * 3600 +
          inputTimeRef.current.minutes * 60 +
          inputTimeRef.current.seconds) *
        1000;
      setTime(totalMs);
    } else {
      setTime(0);
    }

    setShowCompleteModal(false);
  }, [selected]);

  return (
    <WidgetCard
      icon={TimerOutline}
      title={uiText("타이머")}
      dragHandleProps={dragHandleProps}
      widgetType="timer"
    >
      <div className="w-full flex flex-col gap-4">
        <Segmented
          options={options}
          value={selected}
          onChange={setSelected}
          block
          size="sm"
          background={setting.theme}
          color={`${setting.theme}-1`}
          {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
        />

        {/* 시간 표시 */}
        <div className="flex flex-col items-center gap-2">
          {selected === "timer" && (
            <Progress
              type="dashboard"
              value={
                ((inputTime.hours * 3600 +
                  inputTime.minutes * 60 +
                  inputTime.seconds) *
                  1000 -
                  time) /
                  1000 || 0
              }
              max={
                inputTime.hours * 3600 +
                  inputTime.minutes * 60 +
                  inputTime.seconds || 100
              }
              size="lg"
              unit={"%"}
              iconWhenFull={
                <Div
                  className="animate-pulse"
                  style={{
                    animation: "shake 0.8s ease-in-out infinite"
                  }}
                >
                  <LuAlarmClockCheck size={50} />
                </Div>
              }
              shadow={{
                gauge: true
              }}
              color={`${setting.theme}`}
            />
          )}

          <Card
            shadow="none"
            width="100%"
            border={false}
            {...(isDarkMode ? newShadowDarkMdInset : newShadowLightMdInset)}
          >
            <div className="grid grid-cols-12 w-full">
              {formatTime(time)
                .split("")
                .map((char, index) => (
                  <div key={index} className="flex justify-center">
                    <Typography size="3xl" suite="H">
                      {char}
                    </Typography>
                  </div>
                ))}
            </div>
          </Card>

          {selected === "timer" && (
            <div className="grid grid-cols-3 gap-2">
              <Input
                {...inputProps}
                background={`${setting.theme}-1`}
                suffix={uiText("시간")}
                value={inputTime.hours}
                onChange={(e) =>
                  setInputTime((prev) => ({
                    ...prev,
                    hours: parseInt(e.target.value) || 0
                  }))
                }
              />
              <Input
                {...inputProps}
                background={`${setting.theme}-1`}
                suffix={uiText("분")}
                value={inputTime.minutes}
                onChange={(e) =>
                  setInputTime((prev) => ({
                    ...prev,
                    minutes: parseInt(e.target.value) || 0
                  }))
                }
              />
              <Input
                {...inputProps}
                background={`${setting.theme}-1`}
                suffix={uiText("초")}
                value={inputTime.seconds}
                onChange={(e) =>
                  setInputTime((prev) => ({
                    ...prev,
                    seconds: parseInt(e.target.value) || 0
                  }))
                }
              />
            </div>
          )}
        </div>

        {/* 컨트롤 버튼 */}
        <div className="flex gap-2 justify-center">
          <Button
            onClick={toggleTimer}
            colorType="primary"
            icon={<PiPauseFill size={16} />}
            size="sm"
            disabled={!isRunning}
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          />
          <Button
            onClick={toggleTimer}
            colorType="success"
            icon={<PiPlayFill size={16} />}
            size="sm"
            disabled={isRunning}
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          />
          <Button
            onClick={resetTimer}
            colorType="danger"
            icon={<PiStopFill size={16} />}
            size="sm"
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          />
        </div>
      </div>

      {/* 타이머 완료 모달 */}
      <Modal
        open={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        width="300px"
        style={withOverlayShadow()}
      >
        <div className="flex flex-col gap-2 text-center items-center">
          <Typography size="lg" pretendard="SB">
            {uiText("타이머 완료")}</Typography>
          <Div
            color={`${setting.theme}-7`}
            className="animate-pulse"
            style={{
              animation: "shake 0.8s ease-in-out infinite"
            }}
          >
            <LuAlarmClockCheck size={100} />
          </Div>
          <style jsx>{`
            @keyframes shake {
              0% {
                transform: translate(0, 0);
              }
              10% {
                transform: translate(-5px, -5px);
              }
              20% {
                transform: translate(5px, -5px);
              }
              30% {
                transform: translate(-5px, 5px);
              }
              40% {
                transform: translate(5px, 5px);
              }
              50% {
                transform: translate(-5px, -5px);
              }
              60% {
                transform: translate(5px, -5px);
              }
              70% {
                transform: translate(-5px, 5px);
              }
              80% {
                transform: translate(5px, 5px);
              }
              90% {
                transform: translate(-5px, -5px);
              }
              100% {
                transform: translate(0, 0);
              }
            }
          `}</style>
          <Typography suite={"B"} size="lg">
            {formatTime(
              (inputTime.hours * 3600 +
                inputTime.minutes * 60 +
                inputTime.seconds) *
                1000
            )}
          </Typography>
          <div className="flex flex-col w-full">
            <Button
              onClick={() => setShowCompleteModal(false)}
              colorType="primary"
              size="sm"
              border={false}
            >
              {uiText("확인")}</Button>
          </div>
        </div>
      </Modal>
    </WidgetCard>
  );
}
