const roundPanelSize = (value) => Math.round(value * 1000) / 1000;

const parsePanelSize = (value, fallback = 0) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePanelSize = (value) => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.abs(value) < 1 ? 0 : value;
};

export const clampDocumentPanelSizes = (
  sizes = {},
  fallbackSizes = {},
  containerWidth = 0
) => {
  let left = normalizePanelSize(
    parsePanelSize(sizes.left, parsePanelSize(fallbackSizes.left, 0))
  );
  let right = normalizePanelSize(
    parsePanelSize(sizes.right, parsePanelSize(fallbackSizes.right, 0))
  );

  const width = parsePanelSize(containerWidth, 0);
  if (width <= 0) {
    return {
      left: roundPanelSize(left),
      right: roundPanelSize(right)
    };
  }

  const maxSideTotal = width * 0.5;
  const sideMax = width * 0.25;
  const leftCollapsed = left === 0;
  const rightCollapsed = right === 0;

  left = Math.min(left, rightCollapsed ? maxSideTotal : sideMax);
  right = Math.min(right, leftCollapsed ? maxSideTotal : sideMax);

  const sideTotal = left + right;
  if (sideTotal > maxSideTotal && sideTotal > 0) {
    const ratio = maxSideTotal / sideTotal;
    left *= ratio;
    right *= ratio;
  }

  return {
    left: roundPanelSize(left),
    right: roundPanelSize(right)
  };
};

export const getWorkspacePanelBounds = (
  containerWidth = 0,
  { min = 300, max = 440, centerMinRatio = 0.55 } = {}
) => {
  const width = parsePanelSize(containerWidth, 0);
  const maxByCenter = width > 0 ? width * (1 - centerMinRatio) : max;
  const nextMax = roundPanelSize(Math.max(0, Math.min(max, maxByCenter)));

  return {
    min: roundPanelSize(Math.min(min, nextMax)),
    max: nextMax
  };
};

export const clampWorkspacePanelRight = (
  value,
  fallback = 320,
  containerWidth = 0,
  options
) => {
  const parsed = normalizePanelSize(parsePanelSize(value, fallback));
  if (parsed === 0) return 0;

  const { min, max } = getWorkspacePanelBounds(containerWidth, options);
  if (max <= 0) return 0;

  return roundPanelSize(Math.min(Math.max(parsed, min), max));
};
