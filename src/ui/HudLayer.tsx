import type { ReactNode } from 'react';

interface HudLayerProps {
  /** True while the opening cinematic plays */
  introPlaying: boolean;
  children: ReactNode;
}

/**
 * The HUD (top strip, objectives, notifications and console) on one layer,
 * so the opening cinematic can hide it whole: hidden and inert while the
 * intro plays, so the letterbox bars frame the full screen, then a short
 * fade-in (HUD_FADE_MS) once it ends or is skipped. The blocks stay mounted
 * the whole time, so nothing reflows when they appear.
 */
export function HudLayer({ introPlaying, children }: HudLayerProps) {
  return (
    <div className={introPlaying ? 'hud-layer hud-layer--intro' : 'hud-layer'} inert={introPlaying}>
      {children}
    </div>
  );
}
