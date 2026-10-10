import { useEffect, useState } from 'react';

/**
 * Touch-first UI: the primary pointer is a finger (phones, tablets). The HUD
 * then shows the on-screen stand-ins for keyboard and mouse-only actions
 * (Seleccionar área, group binding, long-press tooltips) and talks of
 * tapping instead of clicking. Touch input on the canvas works either way.
 */
const COARSE_QUERY = '(pointer: coarse)';

export function prefersTouch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(COARSE_QUERY).matches;
}

/** prefersTouch(), kept current (a tablet keyboard or mouse can come and go). */
export function useTouchUi(): boolean {
  const [touch, setTouch] = useState(prefersTouch);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(COARSE_QUERY);
    const update = () => setTouch(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return touch;
}
