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

    expect(quoteSections).toHaveLength(1)
    expect(quoteSections[0].groups).toHaveLength(1)
    expect(quoteSections[0].groups?.[0].sourceTitle).toBe('同一本书')
    expect(quoteSections[0].groups?.[0].items).toHaveLength(3)
    expect(noteSection?.items).toEqual(['今天培训萃取机。'])
  })

  it('keeps five quotes as five distinct independent items without concatenation', () => {
    const markdown = `
## 待读摘录

> 摘录 1：逃避焦虑有四种主要的方法。

> 摘录 2：如果一种抑制强大到足以阻碍我们的愿望。

> 摘录 3：在认为谦虚是一种美德的教条基础之上。

来源：《我们时代的神经症人格》

---

> 摘录 4：智能手机把童年带进了一个无限延伸的扑克机。

> 摘录 5：社交剥夺正在以前所未有的规模重塑童年。

来源：《焦虑的一代》
`
    const summary = parseDiarySummaryFromMarkdown(markdown)
    const quoteSec = summary.sections.find((s) => s.type === 'read-later')

    expect(quoteSec).toBeDefined()
    expect(quoteSec?.totalQuotesCount).toBe(5)
    expect(quoteSec?.groups).toHaveLength(2)

    // Group 1: 3 items
    const g1 = quoteSec?.groups?.[0]
    expect(g1?.sourceTitle).toBe('我们时代的神经症人格')
    expect(g1?.items).toHaveLength(3)
    expect(g1?.items[0].quote).toBe('摘录 1：逃避焦虑有四种主要的方法。')
    expect(g1?.items[1].quote).toBe('摘录 2：如果一种抑制强大到足以阻碍我们的愿望。')
    expect(g1?.items[2].quote).toBe('摘录 3：在认为谦虚是一种美德的教条基础之上。')

    // Group 2: 2 items
    const g2 = quoteSec?.groups?.[1]
    expect(g2?.sourceTitle).toBe('焦虑的一代')
    expect(g2?.items).toHaveLength(2)
    expect(g2?.items[0].quote).toBe('摘录 4：智能手机把童年带进了一个无限延伸的扑克机。')
    expect(g2?.items[1].quote).toBe('摘录 5：社交剥夺正在以前所未有的规模重塑童年。')
  })

  it('falls back to 未知来源 when source metadata is missing', () => {
    const markdown = `
## 待读摘录

> 孤立的摘录内容
`
    const summary = parseDiarySummaryFromMarkdown(markdown)
    const quoteSec = summary.sections.find((s) => s.type === 'read-later')

    expect(quoteSec).toBeDefined()
    expect(quoteSec?.groups?.[0].sourceTitle).toBe('未知来源')
    expect(quoteSec?.groups?.[0].items[0].quote).toBe('孤立的摘录内容')
  })
})
