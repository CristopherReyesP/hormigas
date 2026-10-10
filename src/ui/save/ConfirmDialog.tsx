interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A yes/no question over everything else (delete a slot, overwrite one, leave the run) */
export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="save-overlay save-overlay--top" onClick={onCancel}>
      <div
        className="save-panel save-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={message}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="save-confirm-text">{message}</p>
        <div className="save-row">
          <button type="button" className="save-btn" data-confirm-cancel="" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="save-btn save-btn--danger" data-confirm-ok="" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
