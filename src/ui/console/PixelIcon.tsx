import { iconRuns, type IconName } from './pixelIcons';

interface PixelIconProps {
  name: IconName;
  /** Rendered size in CSS px; multiples of 8 keep every art pixel the same size */
  size?: number;
  title?: string;
}

/** Crisp 8×8 pixel icon. Decorative unless a title is given. */
export function PixelIcon({ name, size = 16, title }: PixelIconProps) {
  return (
    <svg
      className="pixel-icon"
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {iconRuns(name).map((run) => (
        <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.w} height={1} fill={run.color} />
      ))}
    </svg>
  );
}
