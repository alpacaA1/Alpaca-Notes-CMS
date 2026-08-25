import { useState, type FormEvent } from 'react'
import type { SessionState } from '../session'
import { generateSelfObservationId } from './self-observation-format'
import {
  enqueueObservation,
  getPendingObservationCount,
  syncObservationOutbox,
} from './self-observation-outbox'
import {
  DEFAULT_BEHAVIORS,
  DEFAULT_DRAWER_EMOTIONS,
  DEFAULT_INTENTIONS,
  DEFAULT_PRIMARY_EMOTIONS,
  type BehaviorRecordData,
  type EmotionCheckinData,
  type SelfObservationKind,
  type SelfObservationRecord,
} from './self-observation-types'

export interface QuickCheckinViewProps {
  session?: SessionState | null
  onOpenTodayDiary?: () => void
  onExitQuickMode?: () => void
  onClose?: () => void
  isModal?: boolean
}

export default function QuickCheckinView({
  session,
  onOpenTodayDiary,
  onExitQuickMode,
  onClose,
  isModal = false,
}: QuickCheckinViewProps) {
  const [kind, setKind] = useState<SelfObservationKind>('emotion')

  // Emotion Form State
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([])
  const [customEmotions, setCustomEmotions] = useState<string[]>([])
  const [isEventExpanded, setIsEventExpanded] = useState<boolean>(false)
  const [eventText, setEventText] = useState<string>('')
  const [selectedIntention, setSelectedIntention] = useState<string>('')

  // Behavior Form State
  const [selectedBehaviors, setSelectedBehaviors] = useState<string[]>([])
  const [actualEventText, setActualEventText] = useState<string>('')

  // Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false)
  const [customInputText, setCustomInputText] = useState<string>('')

  // Submission & Sync State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState<number>(() => getPendingObservationCount())
  const [isSyncing, setIsSyncing] = useState<boolean>(false)

  const handleToggleEmotion = (emotion: string) => {
    if (emotion === '其他') {
      setIsDrawerOpen(true)
      return
    }

    if (selectedEmotions.includes(emotion)) {
      setSelectedEmotions(selectedEmotions.filter((e) => e !== emotion))
    } else {
      if (selectedEmotions.length >= 3) {
        // Replace the oldest or keep max 3
        setSelectedEmotions([...selectedEmotions.slice(1), emotion])
      } else {
        setSelectedEmotions([...selectedEmotions, emotion])
      }
    }
  }

  const handleSelectDrawerEmotion = (emotion: string) => {
    if (!customEmotions.includes(emotion) && !DEFAULT_PRIMARY_EMOTIONS.includes(emotion as any)) {
      setCustomEmotions([...customEmotions, emotion])
    }
    if (!selectedEmotions.includes(emotion)) {
      if (selectedEmotions.length >= 3) {
        setSelectedEmotions([...selectedEmotions.slice(1), emotion])
      } else {
        setSelectedEmotions([...selectedEmotions, emotion])
      }
    }
    setIsDrawerOpen(false)
  }

  const handleAddCustomEmotion = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = customInputText.trim().slice(0, 10)
    if (!trimmed) return

    if (!customEmotions.includes(trimmed)) {
      setCustomEmotions([...customEmotions, trimmed])
    }
    if (!selectedEmotions.includes(trimmed)) {
      if (selectedEmotions.length >= 3) {
        setSelectedEmotions([...selectedEmotions.slice(1), trimmed])
      } else {
        setSelectedEmotions([...selectedEmotions, trimmed])
      }
    }
    setCustomInputText('')
    setIsDrawerOpen(false)
  }

  const handleToggleIntention = (intention: string) => {
    if (selectedIntention === intention) {
      setSelectedIntention('')
    } else {
      setSelectedIntention(intention)
    }
  }

  const handleToggleBehavior = (behavior: string) => {
    if (selectedBehaviors.includes(behavior)) {
      setSelectedBehaviors(selectedBehaviors.filter((b) => b !== behavior))
    } else {
      if (selectedBehaviors.length >= 3) {
        setSelectedBehaviors([...selectedBehaviors.slice(1), behavior])
      } else {
        setSelectedBehaviors([...selectedBehaviors, behavior])
      }
    }
  }

  const handleManualSync = async () => {
    if (!session) {
      setStatusMessage('请先登录后再同步记录。')
      return
    }

    setIsSyncing(true)
    const result = await syncObservationOutbox(session)
    setIsSyncing(false)
    setPendingCount(result.remainingCount)

    if (result.error) {
      setStatusMessage('暂未写入日记，记录仍保留在本机。')
    } else {
      setStatusMessage(`已同步 ${result.syncedCount} 条记录到今日日记。`)
      setTimeout(() => setStatusMessage(null), 3000)
    }
  }

  const handleSubmit = async () => {
    if (kind === 'emotion' && selectedEmotions.length === 0) return
    if (kind === 'behavior' && selectedBehaviors.length === 0) return

    setIsSubmitting(true)
    const recordId = generateSelfObservationId()

    let record: SelfObservationRecord
    if (kind === 'emotion') {
      const data: EmotionCheckinData = {
        emotions: selectedEmotions,
        event: eventText.trim() || undefined,
        intention: selectedIntention || undefined,
      }
      record = {
        id: recordId,
        kind: 'emotion',
        createdAt: new Date().toISOString(),
        data,
      }
    } else {
      const data: BehaviorRecordData = {
        behaviors: selectedBehaviors,
        actualEvent: actualEventText.trim() || undefined,
      }
      record = {
        id: recordId,
        kind: 'behavior',
        createdAt: new Date().toISOString(),
        data,
      }
    }

    // Always enqueue locally first
    enqueueObservation(record)
    setPendingCount(getPendingObservationCount())

    // Clear form state immediately
    if (kind === 'emotion') {
      setSelectedEmotions([])
      setEventText('')
      setSelectedIntention('')
      setIsEventExpanded(false)
    } else {
      setSelectedBehaviors([])
      setActualEventText('')
    }

    // Attempt background sync if online & logged in
    if (session && navigator.onLine) {
      const syncResult = await syncObservationOutbox(session)
      setPendingCount(syncResult.remainingCount)
      if (syncResult.error) {
        setStatusMessage('已保存在本机，联网后可同步。')
      } else {
        setStatusMessage('已记录。')
      }
    } else {
      setStatusMessage('已保存在本机，联网后可同步。')
    }

    setIsSubmitting(false)
    setTimeout(() => {
      setStatusMessage(null)
    }, 2800)
  }

  const primaryEmotionsList = [
    ...DEFAULT_PRIMARY_EMOTIONS.filter((e) => e !== '其他'),
    ...customEmotions,
    '其他',
  ]

  const isEmotionSubmitEnabled = selectedEmotions.length > 0 && !isSubmitting
  const isBehaviorSubmitEnabled = selectedBehaviors.length > 0 && !isSubmitting

  return (
    <div className={`quick-checkin${isModal ? ' quick-checkin--modal' : ''}`}>
      <header className="quick-checkin__header">
        <div className="quick-checkin__brand" onClick={onExitQuickMode || onClose} role="button" tabIndex={0}>
          <img
            src={`${import.meta.env.BASE_URL}alpaca-notes-folded-film-icon.png`}
            alt=""
            className="quick-checkin__logo"
          />
          <span className="quick-checkin__title">Alpaca Notes</span>
        </div>
        <div className="quick-checkin__nav-actions">
          {onOpenTodayDiary ? (
            <button
              type="button"
              className="quick-checkin__nav-link"
              onClick={onOpenTodayDiary}
            >
              今日日记
            </button>
          ) : null}
          <button
            type="button"
            className="quick-checkin__nav-toggle"
            onClick={() => setKind(kind === 'emotion' ? 'behavior' : 'emotion')}
          >
            {kind === 'emotion' ? '行为记录' : '情绪签到'}
          </button>
          {onClose ? (
            <button
              type="button"
              className="quick-checkin__nav-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          ) : null}
        </div>
      </header>

      {pendingCount > 0 ? (
        <div className="quick-checkin__outbox-banner" role="status">
          <span>⚡️ 本机有 {pendingCount} 条待同步记录</span>
          <button
            type="button"
            className="quick-checkin__outbox-sync-btn"
            onClick={handleManualSync}
            disabled={isSyncing}
          >
            {isSyncing ? '同步中…' : '同步'}
          </button>
        </div>
      ) : null}

      {statusMessage ? (
        <div className="quick-checkin__status-toast" role="status">
          {statusMessage}
        </div>
      ) : null}

      <main className="quick-checkin__main">
        {kind === 'emotion' ? (
          <section className="quick-checkin__content" aria-label="情绪签到">
            <div className="quick-checkin__section">
              <h2 className="quick-checkin__section-title">我现在</h2>
              <div className="quick-checkin__chips-grid">
                {primaryEmotionsList.map((emotion) => {
                  const isSelected = selectedEmotions.includes(emotion)
                  return (
                    <button
                      key={emotion}
                      type="button"
                      className={`quick-checkin__chip${isSelected ? ' is-selected' : ''}`}
                      onClick={() => handleToggleEmotion(emotion)}
                      aria-pressed={isSelected}
                    >
                      {emotion}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="quick-checkin__section quick-checkin__section--collapsible">
              <button
                type="button"
                className="quick-checkin__accordion-trigger"
                onClick={() => setIsEventExpanded(!isEventExpanded)}
                aria-expanded={isEventExpanded}
              >
                <span className="quick-checkin__accordion-icon">🪶</span>
                <span className="quick-checkin__accordion-label">补充一句（可选）</span>
                <span className={`quick-checkin__accordion-chevron${isEventExpanded ? ' is-expanded' : ''}`}>
                  {isEventExpanded ? '▴' : '▾'}
                </span>
              </button>

              {isEventExpanded ? (
                <div className="quick-checkin__accordion-body">
                  <textarea
                    className="quick-checkin__textarea"
                    placeholder="发生了什么…"
                    value={eventText}
                    onChange={(e) => setEventText(e.target.value)}
                    rows={3}
                  />
                </div>
              ) : null}
            </div>

            <div className="quick-checkin__section">
              <h2 className="quick-checkin__section-title">我想（可选）</h2>
              <div className="quick-checkin__chips-grid quick-checkin__chips-grid--intentions">
                {DEFAULT_INTENTIONS.map((intention) => {
                  const isSelected = selectedIntention === intention
                  return (
                    <button
                      key={intention}
                      type="button"
                      className={`quick-checkin__chip quick-checkin__chip--intention${isSelected ? ' is-selected' : ''}`}
                      onClick={() => handleToggleIntention(intention)}
                      aria-pressed={isSelected}
                    >
                      {intention}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="quick-checkin__submit-box">
              <button
                type="button"
                className="quick-checkin__submit-btn"
                disabled={!isEmotionSubmitEnabled}
                onClick={handleSubmit}
              >
                {isSubmitting ? '记录中…' : '先记下来'}
              </button>
              <span className="quick-checkin__privacy-note">🔒 仅保存到你的私有日记</span>
            </div>
          </section>
        ) : (
          <section className="quick-checkin__content" aria-label="行为记录">
            <div className="quick-checkin__section">
              <h2 className="quick-checkin__section-title">我做了</h2>
              <div className="quick-checkin__chips-grid">
                {DEFAULT_BEHAVIORS.map((behavior) => {
                  const isSelected = selectedBehaviors.includes(behavior)
                  return (
                    <button
                      key={behavior}
                      type="button"
                      className={`quick-checkin__chip${isSelected ? ' is-selected' : ''}`}
                      onClick={() => handleToggleBehavior(behavior)}
                      aria-pressed={isSelected}
                    >
                      {behavior}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="quick-checkin__section">
              <h2 className="quick-checkin__section-title">实际发生了什么（可选）</h2>
              <textarea
                className="quick-checkin__textarea"
                placeholder="例如：我说想早点回去，对方正常接受…"
                value={actualEventText}
                onChange={(e) => setActualEventText(e.target.value)}
                rows={3}
              />
            </div>

            <div className="quick-checkin__submit-box">
              <button
                type="button"
                className="quick-checkin__submit-btn"
                disabled={!isBehaviorSubmitEnabled}
                onClick={handleSubmit}
              >
                {isSubmitting ? '记录中…' : '记录这次尝试'}
              </button>
              <span className="quick-checkin__privacy-note">🔒 仅保存到你的私有日记</span>
            </div>
          </section>
        )}
      </main>

      {/* Drawer for "其他" Emotions */}
      {isDrawerOpen ? (
        <div className="quick-checkin__drawer-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <div
            className="quick-checkin__drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="选择更多情绪词"
          >
            <div className="quick-checkin__drawer-header">
              <span className="quick-checkin__drawer-title">更多感受</span>
              <button
                type="button"
                className="quick-checkin__drawer-close"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>

            <div className="quick-checkin__drawer-body">
              <div className="quick-checkin__drawer-group">
                <span className="quick-checkin__drawer-subtitle">受挫 / 紧张</span>
                <div className="quick-checkin__chips-grid">
                  {DEFAULT_DRAWER_EMOTIONS.negative.map((emotion) => (
                    <button
                      key={emotion}
                      type="button"
                      className={`quick-checkin__chip${selectedEmotions.includes(emotion) ? ' is-selected' : ''}`}
                      onClick={() => handleSelectDrawerEmotion(emotion)}
                    >
                      {emotion}
                    </button>
                  ))}
                </div>
              </div>

              <div className="quick-checkin__drawer-group">
                <span className="quick-checkin__drawer-subtitle">舒缓 / 向好</span>
                <div className="quick-checkin__chips-grid">
                  {DEFAULT_DRAWER_EMOTIONS.positive.map((emotion) => (
                    <button
                      key={emotion}
                      type="button"
                      className={`quick-checkin__chip${selectedEmotions.includes(emotion) ? ' is-selected' : ''}`}
                      onClick={() => handleSelectDrawerEmotion(emotion)}
                    >
                      {emotion}
                    </button>
                  ))}
                </div>
              </div>

              <form className="quick-checkin__custom-form" onSubmit={handleAddCustomEmotion}>
                <input
                  type="text"
                  className="quick-checkin__custom-input"
                  placeholder="自己写一个词（限10字）"
                  value={customInputText}
                  onChange={(e) => setCustomInputText(e.target.value)}
                  maxLength={10}
                />
                <button
                  type="submit"
                  className="quick-checkin__custom-submit"
                  disabled={!customInputText.trim()}
                >
                  确定
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
