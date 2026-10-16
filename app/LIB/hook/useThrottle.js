import { useRef, useCallback, useEffect } from "react";

/**
 * throttle 훅 - 일정 시간 간격으로 함수 실행을 제한
 * @param {Function} callback - 실행할 함수
 * @param {number} delay - 제한 시간 (ms)
 * @returns {Function} throttle된 함수
 */
export function useThrottle(callback, delay) {
  const lastRun = useRef(Date.now());
  const timeoutRef = useRef(null);

  useEffect(() => {
    // 컴포넌트 언마운트 시 타이머 정리
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRun.current;

      if (timeSinceLastRun >= delay) {
        // delay 시간이 지났으면 즉시 실행
        lastRun.current = now;
        callback(...args);
      } else {
        // delay 시간이 안 지났으면 남은 시간 후 실행 예약
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          lastRun.current = Date.now();
          callback(...args);
        }, delay - timeSinceLastRun);
      }
    },
    [callback, delay]
  );
}
