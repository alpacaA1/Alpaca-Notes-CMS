import { useEffect } from 'react'
import type { SessionState } from '../session'
import QuickCheckinView from './quick-checkin-view'

export interface SelfObservationModalProps {
  isOpen: boolean
  onClose: () => void
  session?: SessionState | null
  onOpenTodayDiary?: () => void
}

export default function SelfObservationModal({
  isOpen,
  onClose,
  session,
  onOpenTodayDiary,
}: SelfObservationModalProps) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="self-observation-modal__overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="自我观察签到">
      <div className="self-observation-modal__container" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="self-observation-modal__close-btn"
          onClick={onClose}
          aria-label="关闭"
        >
          ×
        </button>
        <QuickCheckinView
          session={session}
          onOpenTodayDiary={() => {
            onClose()
            onOpenTodayDiary?.()
          }}
          onExitQuickMode={onClose}
        />
      </div>
    </div>
  )
}
