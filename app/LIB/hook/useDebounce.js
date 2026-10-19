import { useState, useEffect } from "react";

export function useDebounce(value, delay) {
  // 디바운스된 값을 저장할 state
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // value가 바뀌면 delay 이후에 debouncedValue를 업데이트
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // cleanup 함수: 다음 value 변경이 오면 이전 타이머를 취소
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]); // value나 delay가 바뀔 때만 실행

  return debouncedValue;
}
