import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { alertStackBox, alertStackCompact } from './alertStack';
import { useWindowHud } from './layout/useWindowHud';
import './alertStack.css';

/** The window's height, kept current */
function useWindowHeight(): number {
  const [height, setHeight] = useState(() => (typeof window === 'undefined' ? 0 : window.innerHeight));
  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return height;
}

/**
 * One column under the top strip for every banner that hangs from the top
 * (alertStack.ts): they stack in order instead of covering each other or the
 * strip. Fixed over the screen, outside the scaled HUD; never takes input
 * except the banners' own buttons.
 */
export function AlertStack({ children }: { children: ReactNode }) {
  const { layout, scale } = useWindowHud();
  const height = useWindowHeight();
  const box = alertStackBox(layout, scale);
  const style: CSSProperties = {
    // Phone bars grow by the notch, as the strip does
    top: layout === 'desktop' ? box.top : `calc(${box.top}px + env(safe-area-inset-top, 0px))`,
    left: box.side,
    right: box.side,
  };
  const classes = ['alert-stack', `alert-stack--${layout}`, alertStackCompact(layout, scale, height) ? 'alert-stack--compact' : '']
    .filter(Boolean).join(' ');
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
