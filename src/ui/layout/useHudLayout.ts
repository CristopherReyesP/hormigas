import { useEffect, useState } from 'react';
import { hudLayout, type HudLayout } from './hudMetrics';

function windowLayout(): HudLayout {
  if (typeof window === 'undefined') return 'desktop';
  return hudLayout(window.innerWidth, window.innerHeight);
}

/** The HUD layout the window calls for (desktop or a phone layout), kept current on resize and rotation. */
export function useHudLayout(): HudLayout {
  const [layout, setLayout] = useState(windowLayout);
  useEffect(() => {
    const update = () => setLayout(windowLayout());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return layout;
}
