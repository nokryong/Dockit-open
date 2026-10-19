import { t as uiText } from "../i18n";
export const formatTime = (time) => {
  const now = new Date();
  const target = new Date(time);

  // 9시간을 더해 KST(UTC+9)로 보정할 수 있게 함
  target.setHours(target.getHours() + 9);

  const diff = Math.floor((now - target) / 1000); // 초 단위 차이

  // 1분 미만
  if (diff < 60) {
    return uiText("방금 전");
  }

  // 1시간 이내
  if (diff < 3600) {
    const minutes = Math.floor(diff / 60);
    return uiText("{0}분 전", minutes);
  }

  // 하루 이내
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return uiText("{0}시간 전", hours);
  }

  // 일주일 이내
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return uiText("{0}일 전", days);
  }

  // 일주일 이상
  const year = target.getFullYear();
  const month = target.getMonth() + 1; // getMonth()는 0부터 시작
  const day = target.getDate();

  return uiText("{0}년 {1}월 {2}일", year, month, day);
};

export const downloadImage = async (imageUrl, prefix = "image") => {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix}-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error(uiText("이미지 다운로드 실패:"), error);
  }
};
