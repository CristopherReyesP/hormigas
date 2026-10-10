import type { ReactNode } from 'react';
import type { GameNotification } from '../game/GameManager';
import { stripEmoji } from './console/format';

interface NotificationStackProps {
  notifications: GameNotification[];
  /** Sticky instruction for the active build mode, or a short command notice, shown above the feed */
  hint?: string | null;
  /** 'danger' when the notice explains why a command was refused */
  hintTone?: 'hint' | 'danger';
  /** Live readout drawn inside the hint line, under its text (Excavar's counter) */
  hintExtra?: ReactNode;
}

/** Compact message feed just above the console, newest at the bottom. */
export function NotificationStack({ notifications, hint, hintTone = 'hint', hintExtra }: NotificationStackProps) {
  // A toast that says exactly what the hint already says is not repeated
  const visible = notifications.filter((n) => !hint || stripEmoji(n.message) !== hint).slice(-4);
  if (visible.length === 0 && !hint) return null;

  return (
    <div className="notif-feed" aria-live="polite">
      {hint && (
        <div className={`notif-line notif-line--${hintTone === 'danger' ? 'refused' : 'hint'}${hintExtra ? ' notif-line--meter' : ''}`}>
          {hint}
          {hintExtra}
        </div>
      )}
      {visible.map((n) => (
        <div key={n.id} className={`notif-line notif-line--${n.severity}`}>
          {stripEmoji(n.message)}
        </div>
      ))}
    </div>
  );
}
