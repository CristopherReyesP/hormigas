import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { hudScale } from './layout/hudMetrics';

interface HudLayerProps {
  /** True while the opening cinematic plays */
  introPlaying: boolean;
  /** Whole-number HUD scale; defaults to the step the window size calls for */
  scale?: number;
  children: ReactNode;
}

function windowHudScale(): number {
  return typeof window === 'undefined' ? 1 : hudScale(window.innerWidth, window.innerHeight);
}

/** The HUD scale step for the current window, updated on resize. */
function useHudScale(): number {
  const [scale, setScale] = useState(windowHudScale);
  useEffect(() => {
    const update = () => setScale(windowHudScale());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}

/**
 * The HUD (top strip, objectives, notifications and console) on one layer,
 * so the opening cinematic can hide it whole: hidden and inert while the
 * intro plays, so the letterbox bars frame the full screen, then a short
 * fade-in (HUD_FADE_MS) once it ends or is skipped. The blocks stay mounted
 * the whole time, so nothing reflows when they appear.
 * On big windows the layer is laid out at the window size divided by a
 * whole-number step and scaled back up (--hud-scale), so it keeps its
 * 1280×720 proportions and stays crisp.
 */
export function HudLayer({ introPlaying, scale, children }: HudLayerProps) {
  const windowScale = useHudScale();
  const style = { '--hud-scale': scale ?? windowScale } as CSSProperties;
  return (
    <div className={introPlaying ? 'hud-layer hud-layer--intro' : 'hud-layer'} inert={introPlaying} style={style}>
      {children}
    </div>
  );
}
