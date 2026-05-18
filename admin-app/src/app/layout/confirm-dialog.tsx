import { useId } from 'react'

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
  const titleId = useId()
  const messageId = useId()
  const toneClass = isDangerous ? 'confirm-dialog--danger' : 'confirm-dialog--notice'

  return (
    <div className="confirm-dialog__overlay" onClick={isProcessing ? undefined : onCancel}>
      <div
        className={`confirm-dialog ${toneClass}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog__header">
          <span className="confirm-dialog__mark" aria-hidden="true">
            {isDangerous ? '!' : '?'}
          </span>
          <div className="confirm-dialog__copy">
            <h3 id={titleId} className="confirm-dialog__title">{title}</h3>
            <p id={messageId} className="confirm-dialog__message">{message}</p>
          </div>
        </div>

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
