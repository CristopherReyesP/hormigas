import { useEffect, useState } from 'react';
import { hudLayout, hudScale, type HudLayout } from './hudMetrics';

export interface WindowHud {
  scale: number;
  layout: HudLayout;
}

function windowHud(): WindowHud {
  if (typeof window === 'undefined') return { scale: 1, layout: 'desktop' };
  return { scale: hudScale(window.innerWidth, window.innerHeight), layout: hudLayout(window.innerWidth, window.innerHeight) };
}

/** The HUD scale step and layout for the current window, updated on resize and rotation. */
export function useWindowHud(): WindowHud {
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
