import type {
  BehaviorRecordData,
  EmotionCheckinData,
  SelfObservationRecord,
} from './self-observation-types'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export function generateSelfObservationId(date: Date = new Date()): string {
  const yyyy = date.getFullYear()
  const MM = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  const randomSuffix = Math.random().toString(36).slice(2, 6)
  return `so_${yyyy}${MM}${dd}_${hh}${mm}${ss}_${randomSuffix}`
}

export function formatSelfObservationBlock(record: SelfObservationRecord): string {
  const date = new Date(record.createdAt)
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const boundaryStart = `<!-- alpaca:self-observation id="${record.id}" kind="${record.kind}" version="1" -->`
  const boundaryEnd = `<!-- /alpaca:self-observation -->`

  if (record.kind === 'emotion') {
    const data = record.data as EmotionCheckinData
    const heading = `### 🔖 ${timeStr} · 情绪签到`
    const lines: string[] = [heading, '']

    const emotionsText = (data.emotions || []).join('、').trim()
    lines.push(`- 我现在：${emotionsText || '说不清'}`)

    const eventText = (data.event || '').trim()
    if (eventText) {
      lines.push(`- 发生了什么：${eventText}`)
    }

    const intentionText = (data.intention || '').trim()
    if (intentionText) {
      lines.push(`- 我想：${intentionText}`)
    }

    return `${boundaryStart}\n\n${lines.join('\n')}\n\n${boundaryEnd}`
  }

  const data = record.data as BehaviorRecordData
  const heading = `### 🔖 ${timeStr} · 行为尝试`
  const lines: string[] = [heading, '']

  const behaviorsText = (data.behaviors || []).join('、').trim()
  lines.push(`- 我做了：${behaviorsText || '自我观察与练习'}`)

  const actualEventText = (data.actualEvent || '').trim()
  if (actualEventText) {
    lines.push(`- 实际发生了什么：${actualEventText}`)
  }

  return `${boundaryStart}\n\n${lines.join('\n')}\n\n${boundaryEnd}`
}

export function hasObservationId(diaryBody: string, id: string): boolean {
  if (!diaryBody || !id) return false
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`<!--\\s*alpaca:self-observation[^>]*id=["']${escapedId}["']`, 'i')
  return pattern.test(diaryBody)
}

const DIARY_SELF_OBSERVATION_HEADING_PATTERN = /^##\s+(?:🔖\s*)?自我观察\s*$/m

export function appendObservationToDiaryBody(existingBody: string, observationBlock: string): string {
  const trimmed = (existingBody || '').trim()
  if (!trimmed) {
    return `## 自我观察\n\n${observationBlock}\n`
  }

  const match = trimmed.match(DIARY_SELF_OBSERVATION_HEADING_PATTERN)
  if (!match || match.index === undefined) {
    return `${trimmed}\n\n## 自我观察\n\n${observationBlock}\n`
  }

  const headingStartIndex = match.index
  const afterHeadingIndex = headingStartIndex + match[0].length
  const restOfContent = trimmed.slice(afterHeadingIndex)

  // Find if there is a subsequent Level 2 heading (e.g. \n## Heading)
  const nextH2Match = restOfContent.match(/\n(##\s+[^\n]+)/)
  if (nextH2Match && nextH2Match.index !== undefined) {
    const insertPosition = afterHeadingIndex + nextH2Match.index
    const beforeInsert = trimmed.slice(0, insertPosition).trimEnd()
    const afterInsert = trimmed.slice(insertPosition).trimStart()
    return `${beforeInsert}\n\n${observationBlock}\n\n${afterInsert}\n`
  }

  return `${trimmed}\n\n${observationBlock}\n`
}
