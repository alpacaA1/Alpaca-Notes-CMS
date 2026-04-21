type ConfirmDialogProps = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  isDangerous?: boolean
  isProcessing?: boolean
  processingMessage?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  isDangerous = false,
  isProcessing = false,
  processingMessage,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="confirm-dialog__overlay" onClick={isProcessing ? undefined : onCancel}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="confirm-dialog__title">{title}</h3>
        <p id="confirm-dialog-message" className="confirm-dialog__message">{message}</p>

        {isProcessing && processingMessage ? (
          <p className="confirm-dialog__processing">{processingMessage}</p>
        ) : null}

        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--cancel"
            disabled={isProcessing}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-dialog__btn confirm-dialog__btn--confirm${isDangerous ? ' confirm-dialog__btn--danger' : ''}`}
            disabled={isProcessing}
            onClick={onConfirm}
          >
            {isProcessing ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
