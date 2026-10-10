import type { GameNotification } from '../game/GameManager';
import { stripEmoji } from './console/format';

interface NotificationStackProps {
  notifications: GameNotification[];
  /** Sticky instruction for the active build mode, or a short command notice, shown above the feed */
  hint?: string | null;
  /** 'danger' when the notice explains why a command was refused */
  hintTone?: 'hint' | 'danger';
}

/** Compact message feed just above the console, newest at the bottom. */
export function NotificationStack({ notifications, hint, hintTone = 'hint' }: NotificationStackProps) {
  const visible = notifications.slice(-4);
  if (visible.length === 0 && !hint) return null;

  return (
    <div className="notif-feed" aria-live="polite">
      {hint && <div className={`notif-line notif-line--${hintTone === 'danger' ? 'refused' : 'hint'}`}>{hint}</div>}
      {visible.map((n) => (
        <div key={n.id} className={`notif-line notif-line--${n.severity}`}>
          {stripEmoji(n.message)}
        </div>
      ))}
    </div>
  );
}
