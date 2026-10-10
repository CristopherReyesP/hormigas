import type { CSSProperties } from 'react';

const COLORS = ['#c6ff3d', '#f0b541', '#4e9ad1', '#ff7ab8', '#e8d8dc', '#5fbf4a'];
const PIECES = 28;

/** A burst of pixel confetti from the middle of the screen. Deterministic per `seed`, pure CSS animation. */
export function Confetti({ seed }: { seed: number }) {
  return (
    <div className="tut-confetti" aria-hidden="true">
      {Array.from({ length: PIECES }, (_, i) => {
        // A cheap hash spreads the pieces differently each burst
        const h = Math.abs(Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1;
        const angle = (i / PIECES) * Math.PI * 2 + h;
        const dist = 90 + h * 140;
        const style = {
          '--dx': `${Math.round(Math.cos(angle) * dist)}px`,
          '--dy': `${Math.round(Math.sin(angle) * dist - 60)}px`,
          '--spin': `${Math.round((h - 0.5) * 720)}deg`,
          '--delay': `${Math.round(h * 120)}ms`,
          background: COLORS[i % COLORS.length],
        } as CSSProperties;
        return <span key={i} className={i % 5 === 0 ? 'tut-confetti-piece tut-confetti-piece--star' : 'tut-confetti-piece'} style={style} />;
      })}
    </div>
  );
}
