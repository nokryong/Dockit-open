import { t as uiText } from "../i18n";
export const shortcuts = [
  {
    get title() { return uiText("일반"); },
    shortcuts: [
      {
        get name() { return uiText("실행 취소"); },
        shortcut: ["Ctrl", "z"]
      },
      {
        get name() { return uiText("다시 실행(1)"); },
        shortcut: ["Ctrl", "y"]
      },
      {
        get name() { return uiText("다시 실행(2)"); },
        shortcut: ["Ctrl", "Shift", "z"]
      },
      {
        get name() { return uiText("인쇄하기 "); },
        shortcut: ["Ctrl", "p"]
      },
      {
        get name() { return uiText("저장하기"); },
        shortcut: ["Ctrl", "s"]
      },
      {
        get name() { return uiText("전체 선택"); },
        shortcut: ["Ctrl", "a"]
      },
      {
        get name() { return uiText("찾기"); },
        shortcut: ["Ctrl", "f"]
      }
    ]
  },
  {
    get title() { return uiText("글자"); },
    shortcuts: [
      {
        get name() { return uiText("글자 굵게"); },
        shortcut: ["Ctrl", "b"]
      },
      {
        get name() { return uiText("글자 기울게"); },
        shortcut: ["Ctrl", "i"]
      },
      {
        get name() { return uiText("글자 밑줄"); },
        shortcut: ["Ctrl", "u"]
      },
      {
        get name() { return uiText("취소선"); },
        shortcut: ["Ctrl", "Shift", "s"]
      },
      {
        get name() { return uiText("윗 첨자"); },
        shortcut: ["Ctrl", "."]
      },
      {
        get name() { return uiText("아래 첨자"); },
        shortcut: ["Ctrl", ","]
      }
    ]
  },
  {
    get title() { return uiText("문단"); },
    shortcuts: [
      {
        get name() { return uiText("양쪽 정렬"); },
        shortcut: ["Ctrl", "Shift", "j"]
      },
      {
        get name() { return uiText("가운데 정렬"); },
        shortcut: ["Ctrl", "Shift", "e"]
      },
      {
        get name() { return uiText("오른쪽 정렬"); },
        shortcut: ["Ctrl", "Shift", "r"]
      },
      {
        get name() { return uiText("왼쪽 정렬"); },
        shortcut: ["Ctrl", "Shift", "l"]
      },
      {
        get name() { return uiText("들여쓰기"); },
        shortcut: ["Tab"]
      },
      {
        get name() { return uiText("내어쓰기"); },
        shortcut: ["Shift", "Tab"]
      }
    ]
  },
  {
    get title() { return uiText("타이포"); },
    shortcuts: [
      {
        get name() { return uiText("글자 크기 1pt 줄이기"); },
        shortcut: ["Alt", "["]
      },
      {
        get name() { return uiText("글자 크기 1pt 키우기"); },
        shortcut: ["Alt", "]"]
      },
      {
        get name() { return uiText("자간 좁히기"); },
        shortcut: ["Alt", "Left"]
      },
      {
        get name() { return uiText("자간 넓히기"); },
        shortcut: ["Alt", "Right"]
      }
    ]
  },
  {
    get title() { return uiText("표"); },
    shortcuts: [
      {
        get name() { return uiText("표 선택 순환"); },
        shortcut: ["F5"]
      },
      {
        get name() { return uiText("표 전체 선택"); },
        shortcut: ["Ctrl", "a"]
      },
      {
        get name() { return uiText("다음 셀 이동"); },
        shortcut: ["Tab"]
      },
      {
        get name() { return uiText("행 추가"); },
        shortcut: ["Ctrl", "Enter"]
      },
      {
        get name() { return uiText("행 제거"); },
        shortcut: ["Ctrl", "Backspace"]
      },
      {
        get name() { return uiText("행 헤더 토글"); },
        shortcut: ["Alt", "h"]
      },
      {
        get name() { return uiText("열 헤더 토글"); },
        shortcut: ["Alt", "r"]
      },
      {
        get name() { return uiText("셀 헤더 토글"); },
        shortcut: ["Alt", "s"]
      }
    ]
  },
  {
    get title() { return uiText("표 선택"); },
    shortcuts: [
      {
        get name() { return uiText("선택 셀 이동"); },
        shortcut: ["방향키"]
      },
      {
        get name() { return uiText("선택 셀 확장"); },
        shortcut: ["Shift", "방향키"]
      },
      {
        get name() { return uiText("선택 셀 크기 조절"); },
        shortcut: ["Ctrl", "방향키"]
      },
      {
        get name() { return uiText("행 높이 같게"); },
        shortcut: ["h"]
      },
      {
        get name() { return uiText("자동채우기"); },
        shortcut: ["a"]
      },
      {
        get name() { return uiText("마지막 셀 합계"); },
        shortcut: ["s"]
      },
      {
        get name() { return uiText("열 너비 같게"); },
        shortcut: ["w"]
      },
      {
        get name() { return uiText("셀 합치기"); },
        shortcut: ["m"]
      }
    ]
  },
  {
    get title() { return uiText("헤딩"); },
    shortcuts: [
      {
        get name() { return uiText("헤딩 1"); },
        shortcut: ["Ctrl", "Alt", "1"]
      },
      {
        get name() { return uiText("헤딩 2"); },
        shortcut: ["Ctrl", "Alt", "2"]
      },
      {
        get name() { return uiText("헤딩 3"); },
        shortcut: ["Ctrl", "Alt", "3"]
      },
      {
        get name() { return uiText("헤딩 4"); },
        shortcut: ["Ctrl", "Alt", "4"]
      },
      {
        get name() { return uiText("헤딩 5"); },
        shortcut: ["Ctrl", "Alt", "5"]
      },
      {
        get name() { return uiText("헤딩 6"); },
        shortcut: ["Ctrl", "Alt", "6"]
      }
    ]
  },
  {
    get title() { return uiText("리스트"); },
    shortcuts: [
      {
        get name() { return uiText("숫자 없는 리스트"); },
        shortcut: ["Ctrl", "Shift", "8"]
      },
      {
        get name() { return uiText("숫자 있는 리스트"); },
        shortcut: ["Ctrl", "Shift", "7"]
      },
      {
        get name() { return uiText("체크 리스트"); },
        shortcut: ["Ctrl", "Shift", "9"]
      }
    ]
  },
  {
    get title() { return uiText("블록"); },
    shortcuts: [
      {
        get name() { return uiText("코드 블록"); },
        shortcut: ["Ctrl", "Alt", "c"]
      },
      {
        get name() { return uiText("강제 줄바꿈(1)"); },
        shortcut: ["Shift", "Enter"]
      },
      {
        get name() { return uiText("강제 줄바꿈(2)"); },
        shortcut: ["Ctrl", "Enter"]
      },
      {
        get name() { return uiText("태그"); },
        shortcut: ["Alt", "t"]
      },
      {
        get name() { return uiText("가로선 입력"); },
        shortcut: ["---"]
      }
    ]
  }
];
