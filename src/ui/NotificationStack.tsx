import type { GameNotification } from '../game/GameManager';
import { stripEmoji } from './console/format';

interface NotificationStackProps {
  notifications: GameNotification[];
  /** Sticky instruction for the active build mode, shown above the feed */
  hint?: string | null;
}

/** Compact message feed just above the console, newest at the bottom. */
export function NotificationStack({ notifications, hint }: NotificationStackProps) {
  const visible = notifications.slice(-4);
  if (visible.length === 0 && !hint) return null;

  return (
    <div className="notif-feed" aria-live="polite">
      {hint && <div className="notif-line notif-line--hint">{hint}</div>}
      {visible.map((n) => (
        <div key={n.id} className={`notif-line notif-line--${n.severity}`}>
          {stripEmoji(n.message)}
        </div>
      ))}
    </div>
  );
}
