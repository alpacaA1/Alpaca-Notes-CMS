import type { PostIndexItem } from '../posts/post-types'

export type DiaryViewMode = 'calendar' | 'timeline'

export interface DiaryCalendarCell {
  dateStr: string // 'YYYY-MM-DD'
  dayNumber: number
  isCurrentMonth: boolean
  isToday: boolean
  post: PostIndexItem | null
  wordCount: number
  bgColor: string
  isPinned: boolean
  isSearchHit: boolean
}

export interface DiaryMonthStats {
  diaryCount: number
  totalWords: number
  streakDays: number
}

export type DiarySectionType = 'emotion' | 'read-later' | 'note' | 'reading'

export interface DiaryStructuredSection {
  type: DiarySectionType
  timeStr?: string
  title: string
  emotions?: string[]
  event?: string
  quote?: string
  source?: string
  items?: string[]
  bookTitle?: string
  quoteCount?: number
}

export interface ParsedDiarySummary {
  sections: DiaryStructuredSection[]
  categoriesSummary: string[]
  timeRangeStr?: string
  totalItemsCount: number
}
