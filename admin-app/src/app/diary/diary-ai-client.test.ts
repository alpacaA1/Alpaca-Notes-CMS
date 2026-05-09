import { afterEach, describe, expect, it, vi } from 'vitest'
import { DIARY_AI_URL } from '../config'
import { organizeWritingMaterials } from './diary-ai-client'

describe('organizeWritingMaterials', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts selected mixed writing materials to the diary ai endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        materialMarkdown: '  # 月报素材整理\n\n- 素材  ',
        model: 'test-model',
      }),
    } as Response)

    const result = await organizeWritingMaterials(
      { token: 'token-1' },
      [
        {
          sourceType: 'diary',
          path: 'source/diary/20260505010101.md',
          title: '五月日记',
          date: '2026-05-05 01:01:01',
          tags: ['复盘'],
          body: '今天继续整理素材。',
        },
        {
          sourceType: 'read-later',
          path: 'source/read-later-items/product.md',
          title: '产品文章',
          date: '2026-05-02 10:00:00',
          tags: ['产品', '写作'],
          sourceName: 'Product Weekly',
          externalUrl: 'https://example.com/product',
          readingStatus: 'reading',
          summary: '这里是我的总结。',
          commentary: '这里是我的评论。',
          annotationNotes: [
            {
              sectionLabel: '我的总结',
              quote: '关键句子',
              note: '这句可以放进月报。',
              updatedAt: '2026-05-02T11:00:00.000Z',
            },
          ],
        },
      ],
    )

    expect(result).toEqual({
      materialMarkdown: '# 月报素材整理\n\n- 素材',
      model: 'test-model',
    })
    expect(fetchSpy).toHaveBeenCalledWith(DIARY_AI_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer token-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        entries: [
          {
            sourceType: 'diary',
            path: 'source/diary/20260505010101.md',
            title: '五月日记',
            date: '2026-05-05 01:01:01',
            tags: ['复盘'],
            body: '今天继续整理素材。',
          },
          {
            sourceType: 'read-later',
            path: 'source/read-later-items/product.md',
            title: '产品文章',
            date: '2026-05-02 10:00:00',
            tags: ['产品', '写作'],
            sourceName: 'Product Weekly',
            externalUrl: 'https://example.com/product',
            readingStatus: 'reading',
            summary: '这里是我的总结。',
            commentary: '这里是我的评论。',
            annotationNotes: [
              {
                sectionLabel: '我的总结',
                quote: '关键句子',
                note: '这句可以放进月报。',
                updatedAt: '2026-05-02T11:00:00.000Z',
              },
            ],
          },
        ],
      }),
    })
  })

  it('throws GitHubAuthError on 401 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'GitHub 会话已过期，请重新登录。' }),
    } as Response)

    await expect(organizeWritingMaterials({ token: 'token-1' }, [])).rejects.toEqual(
      expect.objectContaining({
        name: 'GitHubAuthError',
        message: 'GitHub 会话已过期，请重新登录。',
      }),
    )
  })

  it('throws when the successful response has no material markdown', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ materialMarkdown: '' }),
    } as Response)

    await expect(organizeWritingMaterials({ token: 'token-1' }, [])).rejects.toThrow('素材整理结果为空，请稍后重试。')
  })
})
