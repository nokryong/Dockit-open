/**
 * 인쇄 단위 변환 유틸리티 (96 DPI 기준)
 *
 * 저장 단위:
 *   - 크기·여백·모서리: mm
 *   - 폰트·선·그림자:   pt
 *
 * CSS 렌더링은 항상 px로 변환하여 적용
 */

const PX_PER_MM = 96 / 25.4;  // ≈ 3.7795
const PX_PER_PT = 96 / 72;    // ≈ 1.3333

/** mm → px (CSS 렌더링용) */
export const mm2px = (mm) => Number(mm) * PX_PER_MM;

/** px → mm (저장용, 소수점 1자리) */
export const px2mm = (px) =>
  parseFloat((Number(px) / PX_PER_MM).toFixed(1));

/** pt → px (CSS 렌더링용) */
export const pt2px = (pt) => Number(pt) * PX_PER_PT;

/** px → pt (저장용, 소수점 1자리) */
export const px2pt = (px) =>
  parseFloat((Number(px) / PX_PER_PT).toFixed(1));
