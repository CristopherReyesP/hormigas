import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { hudLayout, hudScale, type HudLayout } from './layout/hudMetrics';
import { useTouchUi } from './layout/touch';

interface HudLayerProps {
  /** True while the opening cinematic plays */
  introPlaying: boolean;
  /** Whole-number HUD scale; defaults to the step the window size calls for */
  scale?: number;
  /** Desktop or a phone layout; defaults to what the window size calls for */
  layout?: HudLayout;
  children: ReactNode;
}

interface WindowHud {
  scale: number;
  layout: HudLayout;
}

function windowHud(): WindowHud {
  if (typeof window === 'undefined') return { scale: 1, layout: 'desktop' };
  return { scale: hudScale(window.innerWidth, window.innerHeight), layout: hudLayout(window.innerWidth, window.innerHeight) };
}

/** The HUD scale step and layout for the current window, updated on resize and rotation. */
function useWindowHud(): WindowHud {
  const [hud, setHud] = useState(windowHud);
  useEffect(() => {
    const update = () => setHud((current) => {
      const next = windowHud();
      return next.scale === current.scale && next.layout === current.layout ? current : next;
    });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return hud;
}

/**
 * The HUD (top strip, objectives, notifications and console) on one layer,
 * so the opening cinematic can hide it whole: hidden and inert while the
 * intro plays, so the letterbox bars frame the full screen, then a short
 * fade-in (HUD_FADE_MS) once it ends or is skipped. The blocks stay mounted
 * the whole time, so nothing reflows when they appear.
 * On big windows the layer is laid out at the window size divided by a
 * whole-number step and scaled back up (--hud-scale), so it keeps its
 * 1280×720 proportions and stays crisp. On phones it takes a compact
 * layout (hud-layer--phone-portrait / --phone-landscape), and a touch
 * screen adds hud-layer--touch.
 */
export function HudLayer({ introPlaying, scale, layout, children }: HudLayerProps) {
  const fromWindow = useWindowHud();
  const touch = useTouchUi();
  const style = { '--hud-scale': scale ?? fromWindow.scale } as CSSProperties;
  const shape = layout ?? fromWindow.layout;
  const classes = [
    'hud-layer',
    introPlaying ? 'hud-layer--intro' : '',
    shape !== 'desktop' ? `hud-layer--phone hud-layer--${shape}` : '',
    touch ? 'hud-layer--touch' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={classes} inert={introPlaying} style={style}>
      {children}
    </div>
  );
}
