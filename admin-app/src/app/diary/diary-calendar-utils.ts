import type { PostIndexItem } from '../posts/post-types'
import type { DiaryCalendarCell, DiaryMonthStats } from './diary-view-types'

export const MORANDI_DIARY_PALETTE = [
  '#ebd9c6', // 暖杏
  '#e2b8a6', // 浅陶
  '#bac7bd', // 鼠尾草灰绿
  '#f3d8ae', // 暖麦黄
  '#d8c4b6', // 浅砂褐
  '#c9d1c8', // 浅苔绿
  '#e5c9b6', // 柔粉陶
  '#cfbaa9', // 暖灰泥
]

export function getMorandiColorForDate(dateStr: string): string {
  let hash = 0
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % MORANDI_DIARY_PALETTE.length
  return MORANDI_DIARY_PALETTE[index]
}

export function extractDateStrFromPost(post: PostIndexItem): string {
  // 1. From post.date (e.g. "2026-08-25 08:00:00" or ISO)
  if (post.date) {
    const match = post.date.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/)
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`
    }
  }

  // 2. From post.title (e.g. "2026-08-25-星期二" or "2026-08-25")
  if (post.title) {
    const match = post.title.match(/(\d{4})[-/](\d{2})[-/](\d{2})/)
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`
    }
  }

  // 3. From post.path (e.g. "source/diary/20260825080000.md" or "2026-08-25")
  if (post.path) {
    const matchCompact = post.path.match(/(\d{4})(\d{2})(\d{2})/)
    if (matchCompact) {
      return `${matchCompact[1]}-${matchCompact[2]}-${matchCompact[3]}`
    }
  }

  return ''
}

export function getTodayDateStr(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function estimatePostWordCount(post: PostIndexItem): number {
  const text = post.body || post.desc || ''
  if (!text) {
    return 0
  }
  // Strip Markdown tags, HTML comments, frontmatter markers, then count non-whitespace characters
  const clean = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^---[\s\S]*?---/g, '')
    .replace(/[#*`_~>\-[\]()!]/g, '')
    .replace(/\s+/g, '')
  return clean.length
}

export function calculateConsecutiveStreak(dateStringsWithPosts: Set<string>, targetDateStr: string): number {
  if (dateStringsWithPosts.size === 0) {
    return 0
  }

  const currentDate = new Date(targetDateStr)
  if (Number.isNaN(currentDate.getTime())) {
    return 0
  }

  let streak = 0
  const checkDate = new Date(currentDate)

  // If target date doesn't have a post, check yesterday
  const targetIso = checkDate.toISOString().slice(0, 10)
  if (!dateStringsWithPosts.has(targetIso)) {
    checkDate.setDate(checkDate.getDate() - 1)
  }

  while (true) {
    const iso = checkDate.toISOString().slice(0, 10)
    if (dateStringsWithPosts.has(iso)) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }

  return streak
}

export function buildMonthCalendarGrid(
  year: number,
  month: number, // 1..12
  posts: PostIndexItem[],
  searchQuery = '',
): { cells: DiaryCalendarCell[]; stats: DiaryMonthStats } {
  const todayStr = getTodayDateStr()
  const searchTrimmed = searchQuery.trim().toLowerCase()

  // Map posts by date string
  const postsByDate = new Map<string, PostIndexItem>()
  const allDateStringsWithPosts = new Set<string>()

  for (const post of posts) {
    const d = extractDateStrFromPost(post)
    if (d) {
      postsByDate.set(d, post)
      allDateStringsWithPosts.add(d)
    }
  }

  // 1. Calculate first day of month and day of week (Monday=1..Sunday=7)
  const firstDayOfMonth = new Date(year, month - 1, 1)
  const lastDayOfMonth = new Date(year, month, 0)
  const daysInMonth = lastDayOfMonth.getDate()

  let firstDayWeekday = firstDayOfMonth.getDay() // 0 is Sunday, 1 is Monday...
  if (firstDayWeekday === 0) firstDayWeekday = 7 // Convert to 1..7 (Mon..Sun)

  // Starting date for the 7-col grid (Monday of the first week)
  const startDate = new Date(firstDayOfMonth)
  startDate.setDate(startDate.getDate() - (firstDayWeekday - 1))

  // Total cells needed (multiples of 7, usually 35 or 42)
  const totalCellsCount = Math.ceil((firstDayWeekday - 1 + daysInMonth) / 7) * 7
  const cells: DiaryCalendarCell[] = []

  let monthDiaryCount = 0
  let monthTotalWords = 0

  const iterDate = new Date(startDate)
  for (let i = 0; i < totalCellsCount; i++) {
    const y = iterDate.getFullYear()
    const m = iterDate.getMonth() + 1
    const d = iterDate.getDate()
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

    const isCurrentMonth = m === month && y === year
    const isToday = dateStr === todayStr

    const post = postsByDate.get(dateStr) || null
    const wordCount = post ? estimatePostWordCount(post) : 0
    const isPinned = Boolean(post?.pinned)

    let isSearchHit = false
    if (post && searchTrimmed) {
      const matchTitle = post.title?.toLowerCase().includes(searchTrimmed)
      const matchDesc = post.desc?.toLowerCase().includes(searchTrimmed)
      const matchTags = post.tags?.some((t) => t.toLowerCase().includes(searchTrimmed))
      isSearchHit = Boolean(matchTitle || matchDesc || matchTags)
    }

    if (isCurrentMonth && post) {
      monthDiaryCount++
      monthTotalWords += wordCount
    }

    cells.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth,
      isToday,
      post,
      wordCount,
      bgColor: post ? getMorandiColorForDate(dateStr) : 'transparent',
      isPinned,
      isSearchHit,
    })

    iterDate.setDate(iterDate.getDate() + 1)
  }

  const streakDays = calculateConsecutiveStreak(allDateStringsWithPosts, todayStr)

  return {
    cells,
    stats: {
      diaryCount: monthDiaryCount,
      totalWords: monthTotalWords,
      streakDays,
    },
  }
}
