import { describe, expect, it } from "vitest";

import { formatWorkingTime } from "../../app/LIB/components/panel/ChatGPTWidget";

describe("ChatGPT working time", () => {
  it("shows elapsed minutes and seconds while a response is pending", () => {
    expect(formatWorkingTime(0)).toBe("0분 0초 작업 중");
    expect(formatWorkingTime(5_999)).toBe("0분 5초 작업 중");
    expect(formatWorkingTime(65_000)).toBe("1분 5초 작업 중");
    expect(formatWorkingTime(3_600_000)).toBe("60분 0초 작업 중");
    expect(formatWorkingTime(-1)).toBe("0분 0초 작업 중");
  });
});
