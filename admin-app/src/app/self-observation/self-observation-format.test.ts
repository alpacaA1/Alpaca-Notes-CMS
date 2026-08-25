import { describe, expect, it } from 'vitest'
import {
  appendObservationToDiaryBody,
  formatSelfObservationBlock,
  generateSelfObservationId,
  hasObservationId,
} from './self-observation-format'
import type { SelfObservationRecord } from './self-observation-types'

describe('self-observation-format', () => {
  it('generates a valid unique observation id', () => {
    const fixedDate = new Date(2026, 7, 25, 14, 20, 11)
    const id = generateSelfObservationId(fixedDate)
    expect(id).toMatch(/^so_20260825_142011_[a-z0-9]+$/)
  })

  it('formats emotion check-in record without optional fields', () => {
    const record: SelfObservationRecord = {
      id: 'so-101',
      kind: 'emotion',
      createdAt: '2026-08-25T14:20:00.000Z',
      data: {
        emotions: ['烦', '紧张'],
      },
    }

    const block = formatSelfObservationBlock(record)
    expect(block).toContain('<!-- alpaca:self-observation id="so-101" kind="emotion" version="1" -->')
    expect(block).toContain('### 🔖')
    expect(block).toContain('> 💭 **我现在**：烦、紧张')
    expect(block).not.toContain('发生了什么')
    expect(block).not.toContain('我想')
    expect(block).toContain('<!-- /alpaca:self-observation -->')
  })

  it('formats emotion check-in record with all fields', () => {
    const record: SelfObservationRecord = {
      id: 'so-102',
      kind: 'emotion',
      createdAt: '2026-08-25T14:20:00.000Z',
      data: {
        emotions: ['烦'],
        event: '她说我今天显得有点安静',
        intention: '停一下',
      },
    }

    const block = formatSelfObservationBlock(record)
    expect(block).toContain('> 💭 **我现在**：烦')
    expect(block).toContain('> 📝 **发生了什么**：她说我今天显得有点安静')
    expect(block).toContain('> 🎯 **我想**：停一下')
  })

  it('formats behavior record with all fields', () => {
    const record: SelfObservationRecord = {
      id: 'so-201',
      kind: 'behavior',
      createdAt: '2026-08-25T15:30:00.000Z',
      data: {
        behaviors: ['表达需求'],
        actualEvent: '我说想早点回去，对方正常接受。',
      },
    }

    const block = formatSelfObservationBlock(record)
    expect(block).toContain('<!-- alpaca:self-observation id="so-201" kind="behavior" version="1" -->')
    expect(block).toContain('### 🔖')
    expect(block).toContain('行为尝试')
    expect(block).toContain('> 🔖 **我做了**：表达需求')
    expect(block).toContain('> 📝 **实际发生了什么**：我说想早点回去，对方正常接受。')
    expect(block).toContain('<!-- /alpaca:self-observation -->')
  })

  it('checks if an observation id exists in diary body', () => {
    const diary = `## 自我观察\n\n<!-- alpaca:self-observation id="so-101" kind="emotion" version="1" -->\n### 🔖 14:20\n<!-- /alpaca:self-observation -->`
    expect(hasObservationId(diary, 'so-101')).toBe(true)
    expect(hasObservationId(diary, 'so-999')).toBe(false)
    expect(hasObservationId('', 'so-101')).toBe(false)
  })

  it('appends observation under ## 自我观察 for empty, non-existing, and existing sections', () => {
    const obs1 = `<!-- alpaca:self-observation id="so-1" kind="emotion" version="1" -->\n### 🔖 10:00\n- 我现在：烦\n<!-- /alpaca:self-observation -->`
    const obs2 = `<!-- alpaca:self-observation id="so-2" kind="behavior" version="1" -->\n### 🔖 14:00\n- 我做了：表达需求\n<!-- /alpaca:self-observation -->`

    // Case 1: Empty
    const result1 = appendObservationToDiaryBody('', obs1)
    expect(result1).toBe(`## 自我观察\n\n${obs1}\n`)

    // Case 2: Existing diary without ## 自我观察
    const result2 = appendObservationToDiaryBody('早上完成了晨间规划。', obs1)
    expect(result2).toBe(`早上完成了晨间规划。\n\n## 自我观察\n\n${obs1}\n`)

    // Case 3: Existing diary with ## 自我观察
    const result3 = appendObservationToDiaryBody(result2, obs2)
    expect(result3).toBe(`早上完成了晨间规划。\n\n## 自我观察\n\n${obs1}\n\n${obs2}\n`)

    // Case 4: Existing diary with ## 自我观察 followed by another ## 待读摘录
    const bodyWithNext = `## 自我观察\n\n${obs1}\n\n## 待读摘录\n\n### 🔖 11:00\n> 摘录`
    const result4 = appendObservationToDiaryBody(bodyWithNext, obs2)
    expect(result4).toBe(`## 自我观察\n\n${obs1}\n\n${obs2}\n\n## 待读摘录\n\n### 🔖 11:00\n> 摘录\n`)
  })
})
