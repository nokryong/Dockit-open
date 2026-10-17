const weightPriority = {
  Thin: 1, ExtraLight: 2, Light: 3, Regular: 4, Medium: 5,
  SemiBold: 6, Bold: 7, ExtraBold: 8, Black: 9, R: 4, B: 7,
  "Puzzle Outline": 1, "Puzzle Black": 9,
};
const weightNames = Object.keys(weightPriority).sort((a, b) => b.length - a.length);
const hanjaValues = new Set([
  "NotoSansTC", "NotoSerifTC", "NotoSansSC", "NotoSerifSC", "ChironGoRoundTC",
  "MaShanZheng", "ZCOOLQingKeHuangYou", "LiuJianMaoCao", "851ShouShu", "AllSeto",
  "GenWanMin", "Jyhphy", "SweiFistLeg", "TaiWanMing", "UnGungseo", "XianErTi",
]);
const koreanOrder = new Intl.Collator("ko");
const englishOrder = new Intl.Collator("en");

export function sortFontOptions(options) {
  // Compute each name's sort key once, instead of parsing it on every comparison.
  return options.map((option) => {
    const label = String(option.label);
    const group = hanjaValues.has(option.value) ? 3 : label.includes("(Eng)") ? 2 : /^[A-Za-z]/.test(label) ? 0 : 1;
    const numericWeight = label.match(/\d{3}/)?.[0];
    const weight = numericWeight || weightNames.find((name) => label.includes(name));
    return {
      option, label, group,
      family: weight ? label.replace(weight, "").trim() : label,
      weight: numericWeight ? Number(numericWeight) / 100 : weightPriority[weight] || 4,
    };
  }).sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    if (a.group === 3) return koreanOrder.compare(a.label, b.label);
    if (a.group === 2) return englishOrder.compare(a.label, b.label);
    return koreanOrder.compare(a.family, b.family) || a.weight - b.weight;
  }).map(({ option }) => option);
}
