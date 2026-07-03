import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FeedDashboard from './feed-dashboard'
import type { FeedSubscription } from '../rss/feed-subscriptions'

function createSubscription(overrides: Partial<FeedSubscription>): FeedSubscription {
  return {
    id: overrides.id || 'feed-default',
    title: overrides.title || '默认 Feed',
    url: overrides.url || 'https://example.com/feed.xml',
    description: overrides.description || '',
    category: overrides.category || '',
    sourceType: overrides.sourceType || 'manual',
    articleCount: overrides.articleCount ?? 0,
    readLaterCount: overrides.readLaterCount ?? 0,
    createdAt: overrides.createdAt || '2026-06-04T10:00:00.000Z',
    updatedAt: overrides.updatedAt || '',
  }
}

function renderFeedDashboard(overrides: Partial<Parameters<typeof FeedDashboard>[0]> = {}) {
  const props: Parameters<typeof FeedDashboard>[0] = {
    search: '',
    manualFeedUrl: '',
    isLoading: false,
    isSavingFeed: false,
    folders: [],
    subscriptions: [],
    selectedSubscriptionUrl: null,
    previewFeed: null,
    previewArticlesByUrl: {},
    previewArticleLoadingByUrl: {},
    previewArticleErrorsByUrl: {},
    isPreviewLoading: false,
    onManualFeedUrlChange: vi.fn(),
    onAddManualFeed: vi.fn(),
    onPreviewItemChange: vi.fn(),
    onSelectSubscription: vi.fn(),
    onRemoveSubscription: vi.fn(),
    onCreateFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onMoveSubscriptionToFolder: vi.fn(),
    onCreateReadLaterFromPreview: vi.fn(),
    ...overrides,
  }

  return render(<FeedDashboard {...props} />)
}

describe('FeedDashboard', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('groups feeds into folders and keeps read feeds visible without empty counts', () => {
    renderFeedDashboard({
      folders: [
        {
          id: 'folder-news',
          name: 'Newspaper',
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
      ],
      subscriptions: [
        createSubscription({
          id: 'unread-feed',
          title: '有待读 Feed',
          url: 'https://example.com/unread.xml',
          category: 'Newspaper',
          articleCount: 20,
        }),
        createSubscription({
          id: 'read-feed',
          title: '无待读 Feed',
          url: 'https://example.com/read.xml',
          articleCount: 0,
        }),
      ],
    })

    const sidebar = screen.getByLabelText('已订阅 feed')
    expect(within(sidebar).getByText('Newspaper')).toBeTruthy()
    expect(within(sidebar).getByText('Uncategorized')).toBeTruthy()
    expect(within(sidebar).queryByText('有待读 Feed')).toBeNull()

    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Newspaper' }))
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }))

    expect(within(sidebar).getByText('有待读 Feed')).toBeTruthy()
    expect(within(sidebar).queryByText('example.com')).toBeNull()
    expect(within(sidebar).getByLabelText('20 条待读')).toBeTruthy()
    expect(within(sidebar).getByText('无待读 Feed')).toBeTruthy()
    expect(within(sidebar).queryByLabelText('0 条待读')).toBeNull()
  })

  it('keeps every folder collapsed when entering the feed module', () => {
    renderFeedDashboard({
      folders: [
        {
          id: 'folder-news',
          name: 'Newspaper',
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
      ],
      subscriptions: [
        createSubscription({
          id: 'news-feed',
          title: '新闻 Feed',
          url: 'https://example.com/news.xml',
          category: 'Newspaper',
        }),
        createSubscription({
          id: 'design-feed',
          title: '设计 Feed',
          url: 'https://example.com/design.xml',
        }),
      ],
    })

    const sidebar = screen.getByLabelText('已订阅 feed')
    expect(within(sidebar).getByRole('button', { name: '展开 Newspaper' }).getAttribute('aria-expanded')).toBe('false')
    expect(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }).getAttribute('aria-expanded')).toBe('false')
    expect(within(sidebar).queryByText('新闻 Feed')).toBeNull()
    expect(within(sidebar).queryByText('设计 Feed')).toBeNull()

    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Newspaper' }))

    expect(within(sidebar).getByRole('button', { name: '收起 Newspaper' }).getAttribute('aria-expanded')).toBe('true')
    expect(within(sidebar).getByText('新闻 Feed')).toBeTruthy()
    expect(within(sidebar).queryByText('设计 Feed')).toBeNull()
  })

  it('collapses and expands the left subscription sidebar', () => {
    renderFeedDashboard({
      subscriptions: [
        createSubscription({
          id: 'design-feed',
          title: '设计 Feed',
          url: 'https://example.com/design.xml',
          articleCount: 3,
        }),
      ],
    })

    expect(screen.getByLabelText('已订阅 feed')).toBeTruthy()
    expect(screen.getByText('阅读列表')).toBeTruthy()
    expect(screen.queryByText('设计 Feed')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '收起 RSS 订阅栏' }))

    expect(screen.queryByLabelText('已订阅 feed')).toBeNull()
    expect(screen.queryByText('阅读列表')).toBeNull()
    expect(screen.queryByText('设计 Feed')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '展开 RSS 订阅栏' }))

    expect(screen.getByLabelText('已订阅 feed')).toBeTruthy()
    expect(screen.getByText('阅读列表')).toBeTruthy()
    expect(screen.queryByText('设计 Feed')).toBeNull()
  })

  it('keeps cached preview items visible while a feed refresh is loading', () => {
    const subscription = createSubscription({
      id: 'design-feed',
      title: '设计 Feed',
      url: 'https://example.com/design.xml',
      articleCount: 1,
    })

    renderFeedDashboard({
      subscriptions: [subscription],
      selectedSubscriptionUrl: subscription.url,
      isPreviewLoading: true,
      previewFeed: {
        title: '设计 Feed',
        description: '',
        requestedUrl: subscription.url,
        finalUrl: subscription.url,
        items: [
          {
            id: 'item-1',
            title: '缓存文章',
            url: 'https://example.com/posts/cached',
            summary: '缓存摘要。',
            publishedAt: '2026-06-04T08:00:00.000Z',
            sourceName: '设计 Feed',
          },
        ],
      },
    })

    expect(screen.queryByText('正在读取最近条目…')).toBeNull()
    expect(screen.getByRole('button', { name: /缓存文章/ })).toBeTruthy()
  })

  it('removes clicked preview items from the unread count', () => {
    const subscription = createSubscription({
      id: 'design-feed',
      title: '设计 Feed',
      url: 'https://example.com/design.xml',
      articleCount: 2,
    })

    renderFeedDashboard({
      subscriptions: [subscription],
      selectedSubscriptionUrl: subscription.url,
      previewFeed: {
        title: '设计 Feed',
        description: '',
        requestedUrl: subscription.url,
        finalUrl: subscription.url,
        items: [
          {
            id: 'item-1',
            title: '文章一',
            url: 'https://example.com/posts/one',
            summary: '第一篇摘要。',
            publishedAt: '2026-06-04T08:00:00.000Z',
            sourceName: '设计 Feed',
          },
          {
            id: 'item-2',
            title: '文章二',
            url: 'https://example.com/posts/two',
            summary: '第二篇摘要。',
            publishedAt: '2026-06-04T09:00:00.000Z',
            sourceName: '设计 Feed',
          },
        ],
      },
    })

    const sidebar = screen.getByLabelText('已订阅 feed')
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }))
    expect(within(sidebar).getByLabelText('2 条待读')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /文章一/ }))
    expect(within(sidebar).getByLabelText('1 条待读')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /文章二/ }))
    expect(within(sidebar).getByText('设计 Feed')).toBeTruthy()
    expect(within(sidebar).queryByLabelText('0 条待读')).toBeNull()
  })

  it('counts unread items from current feed URLs when the total article count stays the same', () => {
    const subscription = createSubscription({
      id: 'stable-feed',
      title: '稳定数量 Feed',
      url: 'https://example.com/stable.xml',
      articleCount: 2,
    })

    renderFeedDashboard({
      subscriptions: [subscription],
      feedItemsByUrl: {
        [subscription.url]: [
          {
            id: 'item-2',
            title: '旧文章二',
            url: 'https://example.com/posts/two',
            summary: '旧摘要。',
            publishedAt: '2026-06-04T09:00:00.000Z',
            sourceName: '稳定数量 Feed',
          },
          {
            id: 'item-3',
            title: '新文章三',
            url: 'https://example.com/posts/three',
            summary: '新摘要。',
            publishedAt: '2026-06-05T09:00:00.000Z',
            sourceName: '稳定数量 Feed',
          },
        ],
      },
      viewedFeedItemsByUrl: {
        [subscription.url]: [
          'https://example.com/posts/one',
          'https://example.com/posts/two',
          '__alpaca-feed-read-count:2',
        ],
      },
    })

    const sidebar = screen.getByLabelText('已订阅 feed')
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }))
    expect(within(sidebar).getByLabelText('1 条待读')).toBeTruthy()
  })

  it('marks every current preview item as read from the feed item module', () => {
    const subscription = createSubscription({
      id: 'product-feed',
      title: '产品 Feed',
      url: 'https://example.com/product.xml',
      articleCount: 2,
    })

    renderFeedDashboard({
      subscriptions: [subscription],
      selectedSubscriptionUrl: subscription.url,
      previewFeed: {
        title: '产品 Feed',
        description: '',
        requestedUrl: subscription.url,
        finalUrl: subscription.url,
        items: [
          {
            id: 'item-1',
            title: '文章一',
            url: 'https://example.com/posts/one',
            summary: '第一篇摘要。',
            publishedAt: '2026-06-04T08:00:00.000Z',
            sourceName: '产品 Feed',
          },
          {
            id: 'item-2',
            title: '文章二',
            url: 'https://example.com/posts/two#comments',
            summary: '第二篇摘要。',
            publishedAt: '2026-06-04T09:00:00.000Z',
            sourceName: '产品 Feed',
          },
        ],
      },
    })

    const sidebar = screen.getByLabelText('已订阅 feed')
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }))
    expect(within(sidebar).getByLabelText('2 条待读')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '全部标为已读' }))

    expect(within(sidebar).getByText('产品 Feed')).toBeTruthy()
    expect(within(sidebar).queryByLabelText('0 条待读')).toBeNull()
    expect((screen.getByRole('button', { name: '全部标为已读' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('creates a read-later draft from the selected preview article', () => {
    const onCreateReadLaterFromPreview = vi.fn()
    const subscription = createSubscription({
      id: 'product-feed',
      title: '产品 Feed',
      url: 'https://example.com/product.xml',
      articleCount: 1,
    })
    const previewItem = {
      id: 'item-1',
      title: '文章一',
      url: 'https://example.com/posts/one',
      summary: '第一篇摘要。',
      publishedAt: '2026-06-04T08:00:00.000Z',
      sourceName: '产品 Feed',
    }
    const previewArticle = {
      title: '文章一',
      desc: '第一篇摘要。',
      sourceName: '产品 Feed',
      markdown: '# 正文标题',
      requestedUrl: 'https://example.com/posts/one',
      finalUrl: 'https://example.com/posts/one',
      needsManualPaste: false,
    }

    renderFeedDashboard({
      subscriptions: [subscription],
      selectedSubscriptionUrl: subscription.url,
      previewFeed: {
        title: '产品 Feed',
        description: '',
        requestedUrl: subscription.url,
        finalUrl: subscription.url,
        items: [previewItem],
      },
      previewArticlesByUrl: {
        [previewItem.url]: previewArticle,
      },
      onCreateReadLaterFromPreview,
    })

    fireEvent.click(screen.getByRole('button', { name: '加入待读' }))

    expect(onCreateReadLaterFromPreview).toHaveBeenCalledWith(previewItem, previewArticle)
  })

  it('shows a subtle outline for the selected RSS article body', () => {
    const subscription = createSubscription({
      id: 'product-feed',
      title: '产品 Feed',
      url: 'https://example.com/product.xml',
      articleCount: 1,
    })
    const previewItem = {
      id: 'item-1',
      title: '文章一',
      url: 'https://example.com/posts/one',
      summary: '第一篇摘要。',
      publishedAt: '2026-06-04T08:00:00.000Z',
      sourceName: '产品 Feed',
    }

    const { container } = renderFeedDashboard({
      subscriptions: [subscription],
      selectedSubscriptionUrl: subscription.url,
      previewFeed: {
        title: '产品 Feed',
        description: '',
        requestedUrl: subscription.url,
        finalUrl: subscription.url,
        items: [previewItem],
      },
      previewArticlesByUrl: {
        [previewItem.url]: {
          title: '文章一',
          desc: '第一篇摘要。',
          sourceName: '产品 Feed',
          markdown: '# 正文标题\n\n## 第二节\n\n正文内容。',
          requestedUrl: previewItem.url,
          finalUrl: previewItem.url,
          needsManualPaste: false,
        },
      },
    })

    const outline = container.querySelector('.feed-dashboard__reader-preview .preview-post-outline')
    expect(outline).toBeTruthy()
    expect(outline?.className).toContain('preview-post-outline--read-later')
    expect(within(outline as HTMLElement).getByRole('heading', { name: '导航' })).toBeTruthy()
    expect(within(outline as HTMLElement).getByRole('link', { name: '正文标题' })).toBeTruthy()
    expect(within(outline as HTMLElement).getByRole('link', { name: '第二节' })).toBeTruthy()
  })

  it('expands the reader by collapsing the subscription and feed item lists', () => {
    const subscription = createSubscription({
      id: 'product-feed',
      title: '产品 Feed',
      url: 'https://example.com/product.xml',
      articleCount: 1,
    })
    const previewItem = {
      id: 'item-1',
      title: '文章一',
      url: 'https://example.com/posts/one',
      summary: '第一篇摘要。',
      publishedAt: '2026-06-04T08:00:00.000Z',
      sourceName: '产品 Feed',
    }

    renderFeedDashboard({
      subscriptions: [subscription],
      selectedSubscriptionUrl: subscription.url,
      previewFeed: {
        title: '产品 Feed',
        description: '',
        requestedUrl: subscription.url,
        finalUrl: subscription.url,
        items: [previewItem],
      },
      previewArticlesByUrl: {
        [previewItem.url]: {
          title: '文章一',
          desc: '第一篇摘要。',
          sourceName: '产品 Feed',
          markdown: '# 正文标题',
          requestedUrl: previewItem.url,
          finalUrl: previewItem.url,
          needsManualPaste: false,
        },
      },
    })

    expect(screen.getByLabelText('已订阅 feed')).toBeTruthy()
    expect(screen.getByLabelText('Feed 条目列表')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '上一条' })).toBeNull()
    expect(screen.queryByRole('button', { name: '下一条' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '放大阅读区' }))

    expect(screen.queryByLabelText('已订阅 feed')).toBeNull()
    expect(screen.queryByLabelText('Feed 条目列表')).toBeNull()
    expect(screen.getByRole('button', { name: '还原阅读布局' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '还原阅读布局' }))

    expect(screen.getByLabelText('已订阅 feed')).toBeTruthy()
    expect(screen.getByLabelText('Feed 条目列表')).toBeTruthy()
  })

  it('marks a single feed as read and deletes it from the feed action menu', () => {
    const onRemoveSubscription = vi.fn()
    const subscription = createSubscription({
      id: 'design-feed',
      title: '设计 Feed',
      url: 'https://example.com/design.xml',
      articleCount: 3,
    })

    renderFeedDashboard({
      subscriptions: [subscription],
      onRemoveSubscription,
    })

    const sidebar = screen.getByLabelText('已订阅 feed')
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }))
    expect(within(sidebar).getByLabelText('3 条待读')).toBeTruthy()
    expect(within(sidebar).queryByRole('button', { name: '删除 设计 Feed' })).toBeNull()

    fireEvent.click(within(sidebar).getByRole('button', { name: '设计 Feed 更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as read' }))

    expect(within(sidebar).queryByLabelText('0 条待读')).toBeNull()

    fireEvent.click(within(sidebar).getByRole('button', { name: '设计 Feed 更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(onRemoveSubscription).toHaveBeenCalledWith(subscription)
  })

  it('stores current item URLs instead of a read-count marker when marking a loaded feed as read', () => {
    const subscription = createSubscription({
      id: 'loaded-feed',
      title: '已加载 Feed',
      url: 'https://example.com/loaded.xml',
      articleCount: 2,
    })

    renderFeedDashboard({
      subscriptions: [subscription],
      feedItemsByUrl: {
        [subscription.url]: [
          {
            id: 'item-1',
            title: '文章一',
            url: 'https://example.com/posts/one#comments',
            summary: '第一篇摘要。',
            publishedAt: '2026-06-04T08:00:00.000Z',
            sourceName: '已加载 Feed',
          },
          {
            id: 'item-2',
            title: '文章二',
            url: 'https://example.com/posts/two',
            summary: '第二篇摘要。',
            publishedAt: '2026-06-04T09:00:00.000Z',
            sourceName: '已加载 Feed',
          },
        ],
      },
    })

    const sidebar = screen.getByLabelText('已订阅 feed')
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }))
    fireEvent.click(within(sidebar).getByRole('button', { name: '已加载 Feed 更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as read' }))

    const stored = JSON.parse(window.localStorage.getItem('alpaca-admin-viewed-feed-items') || '{}') as Record<string, string[]>
    expect(stored[subscription.url]).toEqual([
      'https://example.com/posts/one',
      'https://example.com/posts/two',
    ])
  })

  it('creates, renames, and deletes folders from the sidebar controls', () => {
    const onCreateFolder = vi.fn()
    const onRenameFolder = vi.fn()
    const onDeleteFolder = vi.fn()
    const folder = {
      id: 'folder-news',
      name: 'Newspaper',
      createdAt: '2026-06-04T10:00:00.000Z',
      updatedAt: '',
    }

    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('Blogs')
      .mockReturnValueOnce('Magazine')

    renderFeedDashboard({
      folders: [folder],
      onCreateFolder,
      onRenameFolder,
      onDeleteFolder,
    })

    fireEvent.click(screen.getByRole('button', { name: '+ New Folder' }))
    expect(onCreateFolder).toHaveBeenCalledWith('Blogs')

    fireEvent.click(screen.getByRole('button', { name: 'Newspaper 更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onRenameFolder).toHaveBeenCalledWith(folder, 'Magazine')

    fireEvent.click(screen.getByRole('button', { name: 'Newspaper 更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onDeleteFolder).toHaveBeenCalledWith(folder)
  })

  it('moves feeds into folders with drag and drop', () => {
    const onMoveSubscriptionToFolder = vi.fn()
    const subscription = createSubscription({
      id: 'design-feed',
      title: '设计 Feed',
      url: 'https://example.com/design.xml',
    })
    const folder = {
      id: 'folder-news',
      name: 'Newspaper',
      createdAt: '2026-06-04T10:00:00.000Z',
      updatedAt: '',
    }
    const dataTransferData = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn((type: string, value: string) => {
        dataTransferData.set(type, value)
      }),
      getData: vi.fn((type: string) => dataTransferData.get(type) || ''),
    }

    renderFeedDashboard({
      folders: [folder],
      subscriptions: [subscription],
      onMoveSubscriptionToFolder,
    })

    const sidebar = screen.getByLabelText('已订阅 feed')
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }))
    const feedItem = within(sidebar).getByText('设计 Feed').closest('article')
    const targetFolder = within(sidebar).getByText('Newspaper').closest('section')
    if (!feedItem || !targetFolder) {
      throw new Error('missing drag test elements')
    }

    fireEvent.dragStart(feedItem, { dataTransfer })
    fireEvent.dragOver(targetFolder, { dataTransfer })
    fireEvent.drop(targetFolder, { dataTransfer })

    expect(onMoveSubscriptionToFolder).toHaveBeenCalledWith(subscription, 'Newspaper')
  })

  it('moves feeds out of folders when dropped on Uncategorized', () => {
    const onMoveSubscriptionToFolder = vi.fn()
    const subscription = createSubscription({
      id: 'design-feed',
      title: '设计 Feed',
      url: 'https://example.com/design.xml',
      category: 'Newspaper',
    })
    const dataTransferData = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn((type: string, value: string) => {
        dataTransferData.set(type, value)
      }),
      getData: vi.fn((type: string) => dataTransferData.get(type) || ''),
    }

    renderFeedDashboard({
      folders: [
        {
          id: 'folder-news',
          name: 'Newspaper',
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
      ],
      subscriptions: [
        subscription,
        createSubscription({
          id: 'uncategorized-feed',
          title: '未分类 Feed',
          url: 'https://example.com/uncategorized.xml',
        }),
      ],
      onMoveSubscriptionToFolder,
    })

    const sidebar = screen.getByLabelText('已订阅 feed')
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Newspaper' }))
    const feedItem = within(sidebar).getByText('设计 Feed').closest('article')
    const targetFolder = within(sidebar).getByText('Uncategorized').closest('section')
    if (!feedItem || !targetFolder) {
      throw new Error('missing drag test elements')
    }

    fireEvent.dragStart(feedItem, { dataTransfer })
    fireEvent.drop(targetFolder, { dataTransfer })

    expect(onMoveSubscriptionToFolder).toHaveBeenCalledWith(subscription, '')
  })
})
