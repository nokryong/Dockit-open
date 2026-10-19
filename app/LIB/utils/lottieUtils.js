export const rgbToHex = (r, g, b) => {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
};

export const loadAndColorifyLottie = async (url, colorMapping) => {
  const { replaceColor } = await import("lottie-colorify");
  const res = await fetch(url);
  const originalData = await res.json();
  let newData = JSON.parse(JSON.stringify(originalData));

  colorMapping.forEach(({ from, to }) => {
    newData = replaceColor(from, to, newData);
  });

  return newData;
};
