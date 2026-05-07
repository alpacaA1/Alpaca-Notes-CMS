import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import * as indexPostsModule from './posts/index-posts'
import * as readLaterIndexModule from './read-later/index-items'
import * as sessionModule from './session'

const supportedPost = {
  path: 'source/_posts/preview-supported.md',
  sha: 'sha-preview-supported',
  title: 'Preview supported post',
  date: '2026-04-03 12:00:00',
  desc: 'desc',
  published: true,
  hasExplicitPublished: true,
  categories: ['专业'],
  tags: ['产品'],
  permalink: 'preview-supported-post/',
}

const supportedContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

# Preview Title

Body with **bold** text and [link](https://example.com).`

const unsafeLinkContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Body with [safe link](https://example.com), [relative link](/internal), [bare relative link](guide/), [asset link](assets/file.pdf), [unsafe link](javascript:alert), [tab-obfuscated link](java	script:alert(1)), [newline-obfuscated link](java
script:alert(1)), and [protocol-relative link](//example.com).`

const bareUrlContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Body with https://example.com and https://alpaca.example/docs?a=1.`

const unsafeBareUrlContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Body with javascript:alert(1), http://safe.example/path, and //protocol-relative.example`

const bareUrlWithParenthesesContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Body with https://en.wikipedia.org/wiki/Function_(mathematics).`

const bareUrlWithFullWidthClosingParenContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Body with（https://alpaca.example/docs）`

const bareUrlWithFullWidthClosingParenAndFollowingTextContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

详情见https://alpaca.example/docs）谢谢`

const bareUrlWithAsciiClosingParenAndFollowingTextContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

See https://alpaca.example/docs)thanks`

const bareUrlWithCommaAndFollowingTextContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

See https://alpaca.example/docs,thanks`

const bareUrlWithPeriodAndFollowingChineseTextContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

详见https://alpaca.example/docs.谢谢`

const bareUrlWithModernTldContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Body with https://example.technology`

const bareUrlWithDottedPathSegmentContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Body with https://example.com/report.finaldraft`

const bareUrlWithCommaInQueryValueContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Body with https://example.com/path?tags=alpha,betatest`

const bareUrlWithExclamationAndFollowingTextContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

See https://example.com!thanks`

const diaryPost = {
  path: 'source/diary/20260506090909.md',
  sha: 'sha-diary-preview',
  title: '2026-05-06-星期三',
  date: '2026-05-06 09:09:09',
  desc: '',
  published: false,
  hasExplicitPublished: true,
  categories: [],
  tags: ['复盘'],
  permalink: null,
  contentType: 'diary' as const,
}

const diaryContent = `---
title: 2026-05-06-星期三
date: 2026-05-06 09:09:09
diary: true
published: false
tags:
  - 复盘
desc:
---

## 今日进展
- [x] 完成预览适配
- [ ] 整理上线检查

## 知识点
系统能力来自稳定复用过的决策边界。`

const topicNodePost = {
  path: 'source/_knowledge/topic-yingxiangli.md',
  sha: 'sha-topic-yingxiangli',
  title: '影响力',
  date: '2026-05-05 09:00:00',
  desc: '',
  published: false,
  hasExplicitPublished: true,
  categories: [],
  tags: ['读书'],
  permalink: null,
  contentType: 'knowledge' as const,
  knowledgeKind: 'topic' as const,
  topicType: 'book' as const,
  nodeKey: 'book/影响力',
  aliases: ['《影响力》'],
}

const wikiLinkContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

今天又想到 [[book/影响力|《影响力》]] 里讲的互惠原则。`

const topicNodeContent = `---
title: 影响力
knowledge: true
knowledge_kind: topic
topic_type: book
node_key: book/影响力
aliases:
  - 《影响力》
date: 2026-05-05 09:00:00
published: false
tags:
  - 读书
desc:
---

这是一个主题节点。`

const nestedOrderedListContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

1. 一级条目
   1. 二级条目
      1. 三级条目
   2. 第二个二级条目
2. 第二个一级条目`

const bareUrlWithColonAndFollowingChineseTextContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

详见https://example.com:后文`

const imagePost = {
  ...supportedPost,
  path: 'source/_posts/preview-image.md',
  sha: 'sha-preview-image',
  title: 'Preview image post',
  permalink: 'preview-image-post/',
}

const imageContent = `---
title: Preview image post
permalink: preview-image-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Before ![alt](/uploads/image.png) after`

const unsafeImageContent = `---
title: Preview image post
permalink: preview-image-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

![bad](javascript:alert(1))`

const tablePost = {
  ...supportedPost,
  path: 'source/_posts/preview-table.md',
  sha: 'sha-preview-table',
  title: 'Preview table post',
  permalink: 'preview-table-post/',
}

const tableContent = `---
title: Preview table post
permalink: preview-table-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

| 列一 | 列二 |
| --- | --- |
| A | B |
| C | D |`

const paragraphLineBreakContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

第一行
第二行`

const plainTextContent = `---
title: Preview supported post
format: plaintxt
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

## 这不是标题
1. 这不是列表
See https://example.com/plain`

const blockquoteLineBreakContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

> 第一行
> 第二行`

const readLaterPost = {
  path: 'source/read-later-items/preview-read-later.md',
  sha: 'sha-preview-read-later',
  title: 'Read-later preview item',
  date: '2026-04-05 09:30:00',
  desc: 'desc',
  published: false,
  hasExplicitPublished: false,
  categories: [],
  tags: ['待读'],
  permalink: 'read-later/preview-read-later/',
  contentType: 'read-later' as const,
  externalUrl: 'https://example.com/original',
  sourceName: 'Preview Source',
  readingStatus: 'reading' as const,
  cover: 'https://example.com/cover.jpg',
}

const readLaterContent = `---
title: Read-later preview item
permalink: read-later/preview-read-later/
date: 2026-04-05 09:30:00
desc: 这是一条待读摘要。
external_url: https://example.com/original
source_name: Preview Source
reading_status: reading
read_later: true
nav_exclude: true
layout: read-later-item
cover: https://example.com/cover.jpg
---

## 原文摘录
这里是原文摘录。

## 我的总结
这里是我的总结。

## 我的评论
这里是我的评论。`

const readLaterFallbackContent = `---
title: Read-later preview item
permalink: read-later/preview-read-later/
date: 2026-04-05 09:30:00
desc: 这是一条待读摘要。
external_url: https://example.com/original
source_name: Preview Source
reading_status: reading
read_later: true
nav_exclude: true
layout: read-later-item
---

没有分段标题，直接保留 markdown fallback。`

const readLaterPlainTextContent = `---
title: Read-later preview item
format: plaintxt
permalink: read-later/preview-read-later/
date: 2026-04-05 09:30:00
desc: 这是一条待读摘要。
external_url: https://example.com/original
source_name: Preview Source
reading_status: reading
read_later: true
nav_exclude: true
layout: read-later-item
---

## 这不是分段标题
1. 这不是列表
See https://example.com/plain-reader`

describe('App preview mode', () => {
  beforeEach(() => {
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([])
    vi.spyOn(indexPostsModule, 'buildKnowledgeIndex').mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    githubClientModule.clearMarkdownFileCache()
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('renders the current document title, date, and body in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: supportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    expect(await screen.findByRole('heading', { name: 'Preview supported post' })).toBeTruthy()
    expect(screen.getByText('2026-04-03 12:00:00')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Preview Title' })).toBeTruthy()
    expect(screen.getByText(/Body with/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'link' })).toBeTruthy()
  })

  it('opens a topic node when a resolved wiki link is clicked in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(indexPostsModule, 'buildKnowledgeIndex').mockResolvedValue([topicNodePost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockImplementation(async (_session, path) => {
      if (path === supportedPost.path) {
        return {
          path: supportedPost.path,
          sha: supportedPost.sha,
          content: wikiLinkContent,
        }
      }

      return {
        path: topicNodePost.path,
        sha: topicNodePost.sha,
        content: topicNodeContent,
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))
    fireEvent.click(await screen.findByRole('button', { name: '《影响力》' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('影响力')).toBeTruthy()
    })
  })

  it('sanitizes unsafe markdown links before rendering preview anchors', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: unsafeLinkContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const safeLink = await screen.findByRole('link', { name: 'safe link' })
    expect(safeLink.getAttribute('href')).toBe('https://example.com')

    const relativeLink = screen.getByRole('link', { name: 'relative link' })
    expect(relativeLink.getAttribute('href')).toBe('/internal')

    const bareRelativeLink = screen.getByRole('link', { name: 'bare relative link' })
    expect(bareRelativeLink.getAttribute('href')).toBe('guide/')

    const assetLink = screen.getByRole('link', { name: 'asset link' })
    expect(assetLink.getAttribute('href')).toBe('assets/file.pdf')

    const unsafeLink = screen.getByText('unsafe link')
    expect(unsafeLink.tagName).toBe('SPAN')

    const tabObfuscatedLink = screen.getByText('tab-obfuscated link')
    expect(tabObfuscatedLink.tagName).toBe('SPAN')

    const newlineObfuscatedLink = screen.getByText('newline-obfuscated link')
    expect(newlineObfuscatedLink.tagName).toBe('SPAN')

    const protocolRelativeLink = screen.getByText('protocol-relative link')
    expect(protocolRelativeLink.tagName).toBe('SPAN')
  })

  it('auto-links bare https urls in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const primaryUrl = await screen.findByRole('link', { name: 'https://example.com' })
    expect(primaryUrl.getAttribute('href')).toBe('https://example.com')

    const queryUrl = screen.getByRole('link', { name: 'https://alpaca.example/docs?a=1' })
    expect(queryUrl.getAttribute('href')).toBe('https://alpaca.example/docs?a=1')
  })

  it('only auto-links safe bare urls in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: unsafeBareUrlContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const safeBareUrl = await screen.findByRole('link', { name: 'http://safe.example/path' })
    expect(safeBareUrl.getAttribute('href')).toBe('http://safe.example/path')

    const unsafeBareUrl = screen.getByText(
      (_, element) => element?.tagName === 'P' && element.textContent?.includes('javascript:alert(1),') === true,
    )
    expect(unsafeBareUrl.tagName).toBe('P')
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull()

    const protocolRelativeBareUrl = screen.getByText(
      (_, element) => element?.tagName === 'P' && element.textContent?.includes('//protocol-relative.example') === true,
    )
    expect(protocolRelativeBareUrl.tagName).toBe('P')
    expect(screen.queryByRole('link', { name: '//protocol-relative.example' })).toBeNull()
  })

  it('auto-links bare urls that contain balanced parentheses in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlWithParenthesesContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const parenthesesUrl = await screen.findByRole('link', {
      name: 'https://en.wikipedia.org/wiki/Function_(mathematics)',
    })
    expect(parenthesesUrl.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Function_(mathematics)')
  })

  it('excludes full-width closing punctuation from bare preview links', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlWithFullWidthClosingParenContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const punctuationTrimmedUrl = await screen.findByRole('link', {
      name: 'https://alpaca.example/docs',
    })
    expect(punctuationTrimmedUrl.getAttribute('href')).toBe('https://alpaca.example/docs')
    expect(screen.queryByRole('link', { name: 'https://alpaca.example/docs）' })).toBeNull()
  })

  it('excludes full-width closing punctuation from bare links when more text follows immediately', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlWithFullWidthClosingParenAndFollowingTextContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const punctuationTrimmedUrl = await screen.findByRole('link', {
      name: 'https://alpaca.example/docs',
    })
    expect(punctuationTrimmedUrl.getAttribute('href')).toBe('https://alpaca.example/docs')

    const paragraph = screen.getByText(
      (_, element) => element?.tagName === 'P' && element.textContent?.includes('详情见https://alpaca.example/docs）谢谢') === true,
    )
    expect(paragraph.tagName).toBe('P')
    expect(screen.queryByRole('link', { name: 'https://alpaca.example/docs）。谢谢' })).toBeNull()
  })

  it('excludes ascii closing punctuation from bare links when latin text follows immediately', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlWithAsciiClosingParenAndFollowingTextContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const punctuationTrimmedUrl = await screen.findByRole('link', {
      name: 'https://alpaca.example/docs',
    })
    expect(punctuationTrimmedUrl.getAttribute('href')).toBe('https://alpaca.example/docs')

    const paragraph = screen.getByText(
      (_, element) => element?.tagName === 'P' && element.textContent?.includes('See https://alpaca.example/docs)thanks') === true,
    )
    expect(paragraph.tagName).toBe('P')
    expect(screen.queryByRole('link', { name: 'https://alpaca.example/docs)thanks' })).toBeNull()
  })

  it('excludes ascii commas from bare links when latin text follows immediately', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlWithCommaAndFollowingTextContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const punctuationTrimmedUrl = await screen.findByRole('link', {
      name: 'https://alpaca.example/docs',
    })
    expect(punctuationTrimmedUrl.getAttribute('href')).toBe('https://alpaca.example/docs')

    const paragraph = screen.getByText(
      (_, element) => element?.tagName === 'P' && element.textContent?.includes('See https://alpaca.example/docs,thanks') === true,
    )
    expect(paragraph.tagName).toBe('P')
    expect(screen.queryByRole('link', { name: 'https://alpaca.example/docs,thanks' })).toBeNull()
  })

  it('excludes ascii periods from bare links when chinese text follows immediately', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlWithPeriodAndFollowingChineseTextContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const punctuationTrimmedUrl = await screen.findByRole('link', {
      name: 'https://alpaca.example/docs',
    })
    expect(punctuationTrimmedUrl.getAttribute('href')).toBe('https://alpaca.example/docs')

    const paragraph = screen.getByText(
      (_, element) => element?.tagName === 'P' && element.textContent?.includes('详见https://alpaca.example/docs.谢谢') === true,
    )
    expect(paragraph.tagName).toBe('P')
    expect(screen.queryByRole('link', { name: 'https://alpaca.example/docs.谢谢' })).toBeNull()
  })

  it('keeps modern bare-url tlds intact in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlWithModernTldContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const intactUrl = await screen.findByRole('link', {
      name: 'https://example.technology',
    })
    expect(intactUrl.getAttribute('href')).toBe('https://example.technology')
    expect(screen.queryByRole('link', { name: 'https://example' })).toBeNull()
  })

  it('keeps dotted path segments intact in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlWithDottedPathSegmentContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const intactUrl = await screen.findByRole('link', {
      name: 'https://example.com/report.finaldraft',
    })
    expect(intactUrl.getAttribute('href')).toBe('https://example.com/report.finaldraft')
    expect(screen.queryByRole('link', { name: 'https://example.com/report' })).toBeNull()
  })

  it('keeps commas inside bare-url query values intact in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlWithCommaInQueryValueContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const intactUrl = await screen.findByRole('link', {
      name: 'https://example.com/path?tags=alpha,betatest',
    })
    expect(intactUrl.getAttribute('href')).toBe('https://example.com/path?tags=alpha,betatest')
    expect(screen.queryByRole('link', { name: 'https://example.com/path?tags=alpha' })).toBeNull()
  })

  it('excludes exclamation marks from bare links when latin text follows immediately', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlWithExclamationAndFollowingTextContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const punctuationTrimmedUrl = await screen.findByRole('link', {
      name: 'https://example.com',
    })
    expect(punctuationTrimmedUrl.getAttribute('href')).toBe('https://example.com')

    const paragraph = screen.getByText(
      (_, element) => element?.tagName === 'P' && element.textContent?.includes('See https://example.com!thanks') === true,
    )
    expect(paragraph.tagName).toBe('P')
    expect(screen.queryByRole('link', { name: 'https://example.com!thanks' })).toBeNull()
  })

  it('excludes colons from bare links when chinese text follows immediately', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: bareUrlWithColonAndFollowingChineseTextContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const punctuationTrimmedUrl = await screen.findByRole('link', {
      name: 'https://example.com',
    })
    expect(punctuationTrimmedUrl.getAttribute('href')).toBe('https://example.com')

    const paragraph = screen.getByText(
      (_, element) => element?.tagName === 'P' && element.textContent?.includes('详见https://example.com:后文') === true,
    )
    expect(paragraph.tagName).toBe('P')
    expect(screen.queryByRole('link', { name: 'https://example.com:后文' })).toBeNull()
  })

  it('renders markdown paragraph soft line breaks in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: paragraphLineBreakContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const paragraph = await screen.findByText(
      (_, element) => element?.tagName === 'P' && element.textContent === '第一行第二行',
    )
    expect(paragraph.querySelector('br')).toBeTruthy()
  })

  it('renders plain text posts without interpreting markdown syntax', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: plainTextContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    expect(await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent?.includes('## 这不是标题') === true)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '这不是标题' })).toBeNull()
    expect(screen.queryByText((_, element) => element?.tagName === 'LI' && element.textContent === '这不是列表')).toBeNull()
    expect(screen.getByRole('link', { name: 'https://example.com/plain' }).getAttribute('href')).toBe('https://example.com/plain')
  })

  it('renders read-later metadata and structured sections in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterContent,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    await waitFor(() => {
      expect(screen.getByText('Read-later preview item')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /read-later preview item/i }))

    expect((await screen.findByLabelText('摘要') as HTMLTextAreaElement).value).toBe('这是一条待读摘要。')
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull()
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
    expect(screen.getByRole('link', { name: '原文摘录' })).toBeTruthy()
    expect(screen.getAllByText('Preview Source').length).toBeGreaterThan(0)
    expect(screen.getAllByText('在读').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /阅读原文/ }).some((link) => link.getAttribute('href') === 'https://example.com/original')).toBe(true)
    expect(screen.getByRole('img', { name: 'Read-later preview item' }).getAttribute('src')).toBe('https://example.com/cover.jpg')
    expect(screen.getByRole('heading', { name: '原文摘录' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '我的总结' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '我的评论' })).toBeTruthy()
    expect(screen.getByText('这里是原文摘录。')).toBeTruthy()
    expect(screen.getByText('这里是我的总结。')).toBeTruthy()
    expect(screen.getByText('这里是我的评论。')).toBeTruthy()
  })

  it('falls back to normal markdown rendering when read-later sections are missing', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterFallbackContent,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    await waitFor(() => {
      expect(screen.getByText('Read-later preview item')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /read-later preview item/i }))

    expect(await screen.findByText('没有分段标题，直接保留 markdown fallback。')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull()
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
    expect(screen.getByRole('link', { name: '阅读内容' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '原文摘录' })).toBeNull()
  })

  it('renders plain text read-later items without promoting markdown headings into the outline', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterPlainTextContent,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    await waitFor(() => {
      expect(screen.getByText('Read-later preview item')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /read-later preview item/i }))

    expect(await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent?.includes('## 这不是分段标题') === true)).toBeTruthy()
    expect(screen.getByRole('link', { name: '阅读内容' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '这不是分段标题' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '这不是分段标题' })).toBeNull()
    expect(screen.queryByText((_, element) => element?.tagName === 'LI' && element.textContent === '这不是列表')).toBeNull()
    expect(screen.getByRole('link', { name: 'https://example.com/plain-reader' }).getAttribute('href')).toBe('https://example.com/plain-reader')
  })

  it('renders diary task lists in preview mode and keeps knowledge sections readable', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([diaryPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: diaryPost.path,
      sha: diaryPost.sha,
      content: diaryContent,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '日记' }))

    await waitFor(() => {
      expect(screen.getByText('2026-05-06-星期三')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /2026-05-06-星期三/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const completedCheckbox = await screen.findByRole('checkbox', { name: '完成预览适配' }) as HTMLInputElement
    const pendingCheckbox = screen.getByRole('checkbox', { name: '整理上线检查' }) as HTMLInputElement

    expect(completedCheckbox.checked).toBe(true)
    expect(pendingCheckbox.checked).toBe(false)
    expect(screen.getByRole('heading', { name: '知识点' })).toBeTruthy()
    expect(screen.getByText('系统能力来自稳定复用过的决策边界。')).toBeTruthy()
  })

  it('preserves nested ordered lists in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: nestedOrderedListContent,
    })

    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    expect(await screen.findByText('一级条目')).toBeTruthy()
    expect(screen.getByText('三级条目')).toBeTruthy()

    const topLevelList = container.querySelector('.preview-content > ol')
    expect(topLevelList).toBeTruthy()
    expect(topLevelList?.children).toHaveLength(2)

    const secondLevelList = topLevelList?.children[0]?.querySelector('ol')
    expect(secondLevelList).toBeTruthy()
    expect(secondLevelList?.children).toHaveLength(2)

    const thirdLevelList = secondLevelList?.children[0]?.querySelector('ol')
    expect(thirdLevelList).toBeTruthy()
    expect(thirdLevelList?.children).toHaveLength(1)
  })

  it('renders markdown blockquote soft line breaks in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: blockquoteLineBreakContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const blockquote = await screen.findByText(
      (_, element) => element?.tagName === 'P' && element.textContent === '第一行第二行',
    )
    expect(blockquote.closest('blockquote')).toBeTruthy()
    expect(blockquote.querySelector('br')).toBeTruthy()
  })

  it('renders markdown images inline in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([imagePost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: imagePost.path,
      sha: imagePost.sha,
      content: imageContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview image post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview image post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    expect(await screen.findByText(/Before/)).toBeTruthy()
    expect(screen.getByRole('img', { name: 'alt' })).toBeTruthy()
    expect(screen.getByText(/after/)).toBeTruthy()
    expect(screen.queryByText('富文本模式暂不支持图片语法。')).toBeNull()
    expect(screen.queryByText('这是客户端近似预览，最终呈现仍以 Hexo 与主题渲染结果为准。')).toBeNull()
  })

  it('rejects unsafe markdown image URLs in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([imagePost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: imagePost.path,
      sha: imagePost.sha,
      content: unsafeImageContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview image post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview image post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    await screen.findByRole('heading', { name: 'Preview image post' })
    expect(screen.queryByRole('img', { name: 'bad' })).toBeNull()
  })

  it('renders markdown tables in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([tablePost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: tablePost.path,
      sha: tablePost.sha,
      content: tableContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview table post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview table post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    await screen.findByRole('heading', { name: 'Preview table post' })
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '列一' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '列二' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'A' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'D' })).toBeTruthy()
  })
})
