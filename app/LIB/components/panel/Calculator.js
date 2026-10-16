import { Card, Typography, Button } from "sud-ui";
import WidgetCard from "./WidgetCard";
import { TbCalculator } from "react-icons/tb";
import { useState, useEffect, useCallback, useRef } from "react";
import { useDarkMode } from "../../context/DarkModeContext";
import {
  newShadowDarkMdInset,
  newShadowDarkSm,
  newShadowLightMdInset,
  newShadowLightSm
} from "../../constant/uiProps";

export default function Calculator({ dragHandleProps }) {
  const { isDarkMode } = useDarkMode();
  const [display, setDisplay] = useState("0");
  const [firstOperand, setFirstOperand] = useState(null);
  const [operator, setOperator] = useState(null);
  const [waitingForSecondOperand, setWaitingForSecondOperand] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const calculatorRef = useRef(null);

  const inputDigit = useCallback(
    (digit) => {
      if (waitingForSecondOperand) {
        setDisplay(String(digit));
        setWaitingForSecondOperand(false);
      } else {
        setDisplay(display === "0" ? String(digit) : display + digit);
      }
    },
    [display, waitingForSecondOperand]
  );

  const inputDecimal = useCallback(() => {
    if (waitingForSecondOperand) {
      setDisplay("0.");
      setWaitingForSecondOperand(false);
      return;
    }
    if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  }, [display, waitingForSecondOperand]);

  const clearDisplay = useCallback(() => {
    setDisplay("0");
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecondOperand(false);
  }, []);

  const handleOperator = useCallback(
    (nextOperator) => {
      const inputValue = parseFloat(display);

      if (firstOperand === null) {
        setFirstOperand(inputValue);
      } else if (operator) {
        const result = calculate(firstOperand, inputValue, operator);
        setDisplay(String(result));
        setFirstOperand(result);
      }

      setWaitingForSecondOperand(true);
      setOperator(nextOperator);
    },
    [display, firstOperand, operator]
  );

  const calculate = (firstOperand, secondOperand, operator) => {
    switch (operator) {
      case "+":
        return firstOperand + secondOperand;
      case "-":
        return firstOperand - secondOperand;
      case "*":
        return firstOperand * secondOperand;
      case "/":
        return firstOperand / secondOperand;
      default:
        return secondOperand;
    }
  };

  const performCalculation = useCallback(() => {
    if (!operator || firstOperand === null) return;

    const inputValue = parseFloat(display);
    const result = calculate(firstOperand, inputValue, operator);
    setDisplay(String(result));
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecondOperand(false);
  }, [display, firstOperand, operator]);

  const handleBackspace = useCallback(() => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay("0");
    }
  }, [display]);

  // 키보드 이벤트 핸들러 (포커스가 있을 때만)
  useEffect(() => {
    const handleKeyDown = (event) => {
      // 계산기에 포커스가 없으면 무시
      if (!isFocused) return;

      const key = event.key;

      // 숫자 입력
      if (key >= "0" && key <= "9") {
        event.preventDefault();
        inputDigit(parseInt(key));
      }
      // 소수점
      else if (key === ".") {
        event.preventDefault();
        inputDecimal();
      }
      // 연산자
      else if (key === "+") {
        event.preventDefault();
        handleOperator("+");
      } else if (key === "-") {
        event.preventDefault();
        handleOperator("-");
      } else if (key === "*") {
        event.preventDefault();
        handleOperator("*");
      } else if (key === "/") {
        event.preventDefault();
        handleOperator("/");
      }
      // 계산 실행 (Enter 또는 =)
      else if (key === "Enter" || key === "=") {
        event.preventDefault();
        performCalculation();
      }
      // 클리어 (Escape 또는 c)
      else if (key === "Escape" || key.toLowerCase() === "c") {
        event.preventDefault();
        clearDisplay();
      }
      // 백스페이스
      else if (key === "Backspace") {
        event.preventDefault();
        handleBackspace();
      }
    };

    // 포커스가 있을 때만 이벤트 리스너 등록
    if (isFocused) {
      document.addEventListener("keydown", handleKeyDown);
    }

    // 컴포넌트 언마운트시 이벤트 리스너 제거
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    inputDigit,
    inputDecimal,
    handleOperator,
    performCalculation,
    clearDisplay,
    handleBackspace,
    isFocused
  ]);

  const renderButton = (label, onClick, style = {}) => {
    const getAriaLabel = (label) => {
      const labels = {
        C: "계산기 클리어",
        "÷": "나누기",
        "×": "곱하기",
        "-": "빼기",
        "+": "더하기",
        "=": "계산 실행",
        ".": "소수점",
        0: "숫자 0",
        1: "숫자 1",
        2: "숫자 2",
        3: "숫자 3",
        4: "숫자 4",
        5: "숫자 5",
        6: "숫자 6",
        7: "숫자 7",
        8: "숫자 8",
        9: "숫자 9"
      };
      return labels[label] || `버튼 ${label}`;
    };

    return (
      <Button
        key={label}
        shadow="none"
        onClick={onClick}
        style={style}
        size="sm"
        aria-label={getAriaLabel(label)}
        role="button"
        tabIndex={0}
        border={false}
        {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
      >
        {label}
      </Button>
    );
  };

  const btnList = [
    { label: "C", onClick: () => clearDisplay() },
    { label: "÷", onClick: () => handleOperator("/") },
    { label: "×", onClick: () => handleOperator("*") },
    { label: "-", onClick: () => handleOperator("-") },
    { label: "7", onClick: () => inputDigit(7) },
    { label: "8", onClick: () => inputDigit(8) },
    { label: "9", onClick: () => inputDigit(9) },
    { label: "+", onClick: () => handleOperator("+") },
    { label: "4", onClick: () => inputDigit(4) },
    { label: "5", onClick: () => inputDigit(5) },
    { label: "6", onClick: () => inputDigit(6) },
    {
      label: "=",
      onClick: () => performCalculation(),
      style: { gridRow: "span 2" }
    },
    { label: "1", onClick: () => inputDigit(1) },
    { label: "2", onClick: () => inputDigit(2) },
    { label: "3", onClick: () => inputDigit(3) },
    { label: ".", onClick: () => inputDecimal() },
    {
      label: "0",
      onClick: () => inputDigit(0),
      style: { gridColumn: "span 2" }
    }
  ];

  return (
    <WidgetCard
      icon={TbCalculator}
      title="계산기"
      dragHandleProps={dragHandleProps}
      widgetType="calculator"
    >
      <div
        ref={calculatorRef}
        className="w-full flex flex-col gap-2"
        tabIndex={0}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onMouseEnter={() => setIsFocused(true)}
        onMouseLeave={() => setIsFocused(false)}
        style={{ outline: "none" }}
        role="application"
        aria-label="계산기"
      >
        <Card
          shadow="none"
          width="100%"
          className="mb-2"
          border={false}
          {...(isDarkMode ? newShadowDarkMdInset : newShadowLightMdInset)}
        >
          <Typography
            as="div"
            size="xl"
            pretendard="B"
            className="flex justify-end h-[10%] items-center px-2"
            role="status"
            aria-live="polite"
            aria-label={`계산 결과: ${display}`}
          >
            {display}
          </Typography>
        </Card>

        <div className="grid grid-cols-4 gap-2">
          {btnList.map((btn, index) =>
            renderButton(btn.label, btn.onClick, btn.style)
          )}
        </div>
      </div>
    </WidgetCard>
  );
}
