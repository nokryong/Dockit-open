import { counterStyleMap, styleValueMap } from "../constant/bulletStyleMap";

export const generateCssVariables = (bulletStyle) => {
  const variables = {};

  if (bulletStyle) {
    // h1~h6 값을 counterStyleMap으로 변환
    variables["--h1-style"] = counterStyleMap[bulletStyle.h1] || "decimal";
    variables["--h2-style"] = counterStyleMap[bulletStyle.h2] || "decimal";
    variables["--h3-style"] = counterStyleMap[bulletStyle.h3] || "decimal";
    variables["--h4-style"] = counterStyleMap[bulletStyle.h4] || "decimal";
    variables["--h5-style"] = counterStyleMap[bulletStyle.h5] || "decimal";
    variables["--h6-style"] = counterStyleMap[bulletStyle.h6] || "decimal";

    // 뎁스별 리스트 스타일 처리 (뎁스 4 이상은 4와 같은 스타일)
    for (let i = 1; i <= 4; i++) {
      const listStyle = bulletStyle[`list-${i}`] || "disc";
      variables[`--list-${i}-content`] = styleValueMap[listStyle] || '"•"';
    }

    // 뎁스별 순서 리스트 스타일 처리 (뎁스 4 이상은 4와 같은 스타일)
    for (let i = 1; i <= 4; i++) {
      const orderListStyle = bulletStyle[`order-list-${i}`] || "decimal-dot";

      const lastDashIndex = orderListStyle.lastIndexOf("-");
      if (lastDashIndex !== -1) {
        const type = orderListStyle.substring(0, lastDashIndex);
        const suffixKey = orderListStyle.substring(lastDashIndex + 1);

        variables[`--order-list-${i}-type`] =
          counterStyleMap[type] || "decimal";
        variables[`--order-list-${i}-suffix`] =
          styleValueMap[suffixKey] || '". "';
      } else {
        variables[`--order-list-${i}-type`] =
          counterStyleMap[orderListStyle] || "decimal";
        variables[`--order-list-${i}-suffix`] = '". "';
      }
    }
  }

  return variables;
};
