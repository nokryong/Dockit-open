import { Button, Typography } from "sud-ui";
import WidgetCard from "./WidgetCard";
import { TbDice } from "react-icons/tb";
import { Minus, Plus } from "sud-icons";
import { useState, useEffect } from "react";
import {
  DiceOne,
  DiceTwo,
  DiceThree,
  DiceFour,
  DiceFive,
  DiceSix
} from "../../constant/icons";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";
import { newShadowDarkSm, newShadowLightSm } from "../../constant/uiProps";

const diceIcons = [
  <DiceOne size={30} key={1} />,
  <DiceTwo size={30} key={2} />,
  <DiceThree size={30} key={3} />,
  <DiceFour size={30} key={4} />,
  <DiceFive size={30} key={5} />,
  <DiceSix size={30} key={6} />
];

export default function Dice({ dragHandleProps }) {
  const { setting } = useSetting();
  const { isDarkMode } = useDarkMode();
  const [count, setCount] = useState(1);
  const [diceValues, setDiceValues] = useState([1]); // 각 주사위의 값을 저장
  const [isRolling, setIsRolling] = useState([]); // 각 주사위의 굴림 상태 저장
  const [hasRolled, setHasRolled] = useState([]); // 각 주사위가 굴려졌는지 상태 저장

  // 주사위 갯수가 변경될 때 배열 크기 조절
  useEffect(() => {
    const newValues = Array(count).fill(1);
    const newIsRolling = Array(count).fill(false);
    const newHasRolled = Array(count).fill(false);

    setDiceValues((currentValues) => {
      for (let i = 0; i < Math.min(currentValues.length, count); i++) {
        newValues[i] = currentValues[i];
      }
      return newValues;
    });
    setIsRolling((currentIsRolling) => {
      for (let i = 0; i < Math.min(currentIsRolling.length, count); i++) {
        newIsRolling[i] = currentIsRolling[i];
      }
      return newIsRolling;
    });
    setHasRolled((currentHasRolled) => {
      for (let i = 0; i < Math.min(currentHasRolled.length, count); i++) {
        newHasRolled[i] = currentHasRolled[i];
      }
      return newHasRolled;
    });
  }, [count]);

  const handleDiceClick = (index) => {
    // 이미 굴리고 있는 주사위는 다시 클릭 안되도록 함
    if (isRolling.some((rolling) => rolling)) return;

    // 클릭한 주사위 롤링 상태 true로 변경
    const newIsRolling = [...isRolling];
    newIsRolling[index] = true;
    setIsRolling(newIsRolling);

    // 굴림 상태 기록
    const newHasRolled = [...hasRolled];
    newHasRolled[index] = true;
    setHasRolled(newHasRolled);

    // 롤링 애니메이션
    const rollInterval = setInterval(() => {
      setDiceValues((currentValues) => {
        const newValues = [...currentValues];
        newValues[index] = Math.floor(Math.random() * 6) + 1;
        return newValues;
      });
    }, 130);

    // 1초 후에 롤링 멈춤
    setTimeout(() => {
      clearInterval(rollInterval);
      const finalValue = Math.floor(Math.random() * 6) + 1;
      setDiceValues((currentValues) => {
        const newValues = [...currentValues];
        newValues[index] = finalValue;
        return newValues;
      });
      newIsRolling[index] = false;
      setIsRolling(newIsRolling);
    }, 1500);
  };

  const getBackgroundColor = (i) => {
    if (isRolling[i]) {
      return { bg: `${setting.theme}-3`, text: `${setting.theme}-8` }; // 돌리는 중
    }
    if (hasRolled[i]) {
      return { bg: setting.theme, text: `${setting.theme}-1` }; // 돌린 후
    }
    return { bg: `${setting.theme}-1`, text: `${setting.theme}-9` }; // 돌리기 전
  };
  return (
    <WidgetCard
      icon={TbDice}
      title="주사위"
      dragHandleProps={dragHandleProps}
      widgetType="dice"
      titleBtn={
        <div className="flex justify-end">
          {count < 10 && (
            <Button
              size="sm"
              colorType="text"
              icon={<Plus size={15} />}
              onClick={() => setCount((prev) => (prev < 10 ? prev + 1 : prev))}
            />
          )}
          {count > 0 && (
            <Button
              size="sm"
              colorType="text"
              icon={<Minus size={15} />}
              onClick={() => setCount((prev) => (prev > 0 ? prev - 1 : prev))}
            />
          )}
        </div>
      }
    >
      <div className="w-full flex flex-col gap-2">
        {count === 0 ? (
          <div className="flex justify-center text-center">
            <Typography color={"cool-gray-7"} size="sm">
              주사위를 추가해서 사용하세요.
            </Typography>
          </div>
        ) : (
          <div className="flex flex-wrap justify-start gap-2">
            {Array.from({ length: count }).map((_, i) => (
              <Button
                key={i}
                background={getBackgroundColor(i).bg}
                color={getBackgroundColor(i).text}
                border={false}
                {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
                icon={diceIcons[diceValues[i] - 1]}
                onClick={() => handleDiceClick(i)}
                disabled={isRolling[i]}
              />
            ))}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}
