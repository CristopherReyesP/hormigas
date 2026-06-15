import type { GameNotification } from '../game/GameManager';

const SEVERITY_CLASS: Record<GameNotification['severity'], string> = {
  info: 'pixel-notif--info',
  success: 'pixel-notif--success',
  warning: 'pixel-notif--warning',
  danger: 'pixel-notif--danger',
};

interface NotificationStackProps {
  notifications: GameNotification[];
}

/** Floating global alerts over the canvas — top-center, newest at the bottom */
export function NotificationStack({ notifications }: NotificationStackProps) {
  if (notifications.length === 0) return null;

  const visible = notifications.slice(-4);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      {visible.map((n) => (
        <div key={n.id} className={`pixel-notif ${SEVERITY_CLASS[n.severity]}`}>
          {n.message}
        </div>
      ))}
    </div>
  );
}
