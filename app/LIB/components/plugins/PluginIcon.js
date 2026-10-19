import { TbCalendar, TbDice, TbMusic, TbPuzzle } from "react-icons/tb";

export const pluginIcons = { calendar: TbCalendar, dice: TbDice, music: TbMusic, puzzle: TbPuzzle };
const components = new WeakMap();

export default function PluginIcon({ icon, size = 20, style, ...props }) {
  if (!icon?.src?.startsWith('data:image/svg+xml;base64,')) {
    const Icon = pluginIcons[icon] || TbPuzzle;
    return <Icon size={size} style={style} {...props} />;
  }
  const dimensions = { width: size, height: size, flexShrink: 0, ...style };
  // SVG는 이미지 리소스로만 사용 (플러그인 마크업은 호스트 DOM에 들어오지 않음)
  return icon.monochrome
    ? <span aria-hidden="true" {...props} style={{ display: 'inline-block', backgroundColor: 'currentColor', mask: `url("${icon.src}") center / contain no-repeat`, ...dimensions }} />
    : <img alt="" draggable={false} {...props} src={icon.src} width={size} height={size} style={{ objectFit: 'contain', ...dimensions }} />;
}

export function getPluginIcon(icon) {
  if (!icon || typeof icon !== 'object') return pluginIcons[icon] || TbPuzzle;
  if (!components.has(icon)) {
    const RegisteredIcon = props => <PluginIcon icon={icon} {...props} />;
    components.set(icon, RegisteredIcon);
  }
  return components.get(icon);
}
