import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PreviewPane from './preview-pane'

describe('PreviewPane', () => {
  it('renders markdown headings as collapsible sections in preview', () => {
    render(
      <PreviewPane
        title="标题折叠"
        date="2026-05-08 10:00:00"
        markdown={`导语内容。

## 需求背景
平台需要在预览态快速折叠长文档。

### 业务流程
1. 平台发起刷新。
2. 设备执行任务。

#### 执行结果
设备回写执行状态。`}
      />,
    )

    expect(screen.getByText('导语内容。')).toBeTruthy()

    const backgroundDetails = screen.getByRole('heading', { name: '需求背景' }).closest('details') as HTMLDetailsElement | null
    const flowDetails = screen.getByRole('heading', { name: '业务流程' }).closest('details') as HTMLDetailsElement | null
    const resultDetails = screen.getByRole('heading', { name: '执行结果' }).closest('details') as HTMLDetailsElement | null

    expect(backgroundDetails?.open).toBe(true)
    expect(flowDetails?.open).toBe(true)
    expect(resultDetails?.open).toBe(true)

    fireEvent.click(backgroundDetails?.querySelector('summary') as HTMLElement)
    expect(backgroundDetails?.open).toBe(false)

    fireEvent.click(backgroundDetails?.querySelector('summary') as HTMLElement)
    expect(backgroundDetails?.open).toBe(true)
  })
})
