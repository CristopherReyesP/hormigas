import './save.css';
import { useEffect, useState } from 'react';
import { subscribeToasts, type Toast } from './toasts';

/** Small save/load messages at the bottom of the screen; never blocks a tap */
export function SaveToasts() {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);
  if (toasts.length === 0) return null;
  return (
    <div className="save-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`save-toast save-toast--${t.tone}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
