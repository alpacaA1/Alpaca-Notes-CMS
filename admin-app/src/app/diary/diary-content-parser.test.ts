import { describe, expect, it } from 'vitest'
import { parseDiarySummaryFromMarkdown } from './diary-content-parser'

describe('diary-content-parser', () => {
  it('parses self-observation emotions and events', () => {
    const markdown = `
---
title: 2026-08-25-星期二
date: 2026-08-25 08:00:00
---

## 自我观察

<!-- alpaca:self-observation id="so_1" kind="emotion" version="1" -->
### 🔖 13:43 · 情绪签到
> 💭 **我现在**：期待、平静
> 📝 **发生了什么**：发现了小汤的钢琴教材
<!-- /alpaca:self-observation -->
`
    const summary = parseDiarySummaryFromMarkdown(markdown)
    expect(summary.sections).toHaveLength(1)
    expect(summary.sections[0].type).toBe('emotion')
    expect(summary.sections[0].timeStr).toBe('13:43')
    expect(summary.sections[0].emotions).toEqual(['期待', '平静'])
    expect(summary.sections[0].event).toBe('发现了小汤的钢琴教材')
    expect(summary.categoriesSummary).toContain('情绪签到')
  })

  it('parses read-later quotes and general list items', () => {
    const markdown = `
### 📄 15:07 · 待读摘录
> tool_calls 其实就是一套模型和后端服务的对话协议，
> 模型负责判断该查什么，后端负责执行和验货。
来源: AskCat 的 tool

## 生活记录
1. 今天天气很好
2. 下午整理了素材
`
    const summary = parseDiarySummaryFromMarkdown(markdown)
    expect(summary.sections.some((s) => s.type === 'read-later')).toBe(true)
    expect(summary.sections.some((s) => s.type === 'note')).toBe(true)

    const quoteSec = summary.sections.find((s) => s.type === 'read-later')
    expect(quoteSec?.quote).toContain('tool_calls')
    expect(quoteSec?.source).toBe('AskCat 的 tool')

    const noteSec = summary.sections.find((s) => s.type === 'note')
    expect(noteSec?.items).toContain('今天天气很好')
  })

  it('does not duplicate batch quote metadata into life notes', () => {
    const markdown = `
## 生活记录

今天培训萃取机。

## 待读摘录

> 摘录一

来源：《同一本书》

---

> 摘录二

来源：《同一本书》

想法：第二条思考

---

> 摘录三

来源：《同一本书》
`

    const summary = parseDiarySummaryFromMarkdown(markdown)
    const quoteSections = summary.sections.filter((section) => section.type === 'read-later')
    const noteSection = summary.sections.find((section) => section.type === 'note')

    expect(quoteSections).toHaveLength(3)
    expect(noteSection?.items).toEqual(['今天培训萃取机。'])
  })
})
