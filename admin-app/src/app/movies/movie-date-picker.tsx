import { useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  dialogLabel?: string
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function parseDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function toDateValue(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatDisplay(value: string) {
  return value ? value.replaceAll('-', '/') : '选择日期'
}

export default function MovieDatePicker({ value, onChange, ariaLabel, dialogLabel = '选择观影日期' }: Props) {
  const initialDate = parseDate(value) || new Date()
  const [isOpen, setIsOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const nextDate = parseDate(value)
    if (nextDate && !isOpen) setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1))
  }, [value, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const close = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  const days = useMemo(() => {
    const year = visibleMonth.getFullYear()
    const month = visibleMonth.getMonth()
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - firstWeekday + 1
      return day >= 1 && day <= daysInMonth ? day : null
    })
  }, [visibleMonth])

  const selected = parseDate(value)
  const today = new Date()
  const year = visibleMonth.getFullYear()
  const month = visibleMonth.getMonth()

  return <div className={`movie-date-picker${isOpen ? ' is-open' : ''}`} ref={rootRef}>
    <button type="button" className="movie-date-picker__trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setIsOpen((current) => !current)}>
      <span>{formatDisplay(value)}</span>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.4" y="3.1" width="11.2" height="10.2" rx="1.4" stroke="currentColor" strokeWidth="1.3"/><path d="M5 2v2.4M11 2v2.4M2.5 6.2h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
    </button>
    {isOpen ? <div className="movie-date-picker__panel" role="dialog" aria-label={dialogLabel}>
      <header><button type="button" aria-label="上个月" onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}>‹</button><strong>{year} 年 {month + 1} 月</strong><button type="button" aria-label="下个月" onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}>›</button></header>
      <div className="movie-date-picker__weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="movie-date-picker__days">{days.map((day, index) => {
        if (!day) return <span key={`blank-${index}`} />
        const isSelected = Boolean(selected && selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day)
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
        return <button key={day} type="button" className={`${isSelected ? 'is-selected ' : ''}${isToday ? 'is-today' : ''}`} onClick={() => { onChange(toDateValue(year, month, day)); setIsOpen(false) }}>{day}</button>
      })}</div>
      <button type="button" className="movie-date-picker__today" onClick={() => { onChange(toDateValue(today.getFullYear(), today.getMonth(), today.getDate())); setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setIsOpen(false) }}>今天</button>
    </div> : null}
  </div>
}
