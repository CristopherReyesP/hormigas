// A tiny toast bus: saving and loading report here, SaveToasts shows it.

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

type Listener = (toasts: readonly Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const TOAST_MS = 3200;

function emit(): void {
  for (const listener of listeners) listener(toasts);
}

export function showToast(message: string, tone: ToastTone = 'info'): void {
  // The same message twice at once (React's dev double mount, repeated failures) shows once
  if (toasts.some((t) => t.message === message)) return;
  const toast = { id: nextId++, message, tone };
  toasts = [...toasts.slice(-2), toast];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    emit();
  }, TOAST_MS);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}
