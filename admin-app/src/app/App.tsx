import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  batchUpdatePostContents,
  fetchMarkdownFile,
  GitHubAuthError,
  GitHubConflictError,
  listTrashEntries,
  moveMarkdownFileToTrash,
  permanentlyDeleteTrashEntry,
  purgeExpiredTrashEntries,
  readCachedMarkdownFile,
  restoreTrashEntry,
  saveMarkdownFile,
  type TrashEntry,
  uploadImageFile,
} from './github-client'
import { buildImageMarkdown, buildImageUploadDescriptor } from './editor/image-upload'
import { listLocalDraftSummaries, readLocalDraft, removeLocalDraft, saveLocalDraft } from './editor/local-draft-store'
import MarkdownEditor from './editor/markdown-editor'
import PreviewPane from './editor/preview-pane'
import { useEditorDocument, type EditorMode } from './editor/use-editor-document'
import { buildInternalReferenceCandidates, buildInternalReferenceLookup } from './internal-links'
import { createKnowledgeFromSelection, createNewKnowledgeItem } from './knowledge/new-item'
import { KNOWLEDGE_RANDOM_CATEGORY } from './knowledge/constants'
import {
  appendTopicBacklinksToMarkdown,
  buildTopicBacklinkMap,
  buildTopicNodeMap,
  collectResolvedWikiLinkTargetKeys,
  isTopicNodePost,
  stripGeneratedTopicBacklinks,
} from './knowledge/wiki-links'
import { resolveContentFormat } from './content-format'
import { FEED_SUBSCRIPTIONS_PATH } from './config'
import { organizeWritingMaterials, type DiaryAiEntry, type ReadLaterAiEntry, type WritingMaterialEntry } from './diary/diary-ai-client'
import TopBar from './layout/top-bar'
import PostListPane from './layout/post-list-pane'
import PostDashboard from './layout/post-dashboard'
import SeriesCollection from './layout/series-collection'
import FeedDashboard, {
  readViewedFeedItemsByUrl,
  type ViewedFeedItemsByUrl,
} from './layout/feed-dashboard'
import TrashView from './layout/trash-view'
import MaterialOrganizerDialog from './layout/material-organizer-dialog'
import ReadLaterAnnotationsView from './layout/read-later-annotations-view'
import SettingsPanel from './layout/settings-panel'
import ConfirmDialog from './layout/confirm-dialog'
import { getNextImmersiveMode } from './layout/immersive-mode'
import { useColorMode } from './layout/use-color-mode'
import { useReadingFont } from './layout/use-reading-font'
import LoginGate from './login-gate'
import { buildReadLaterAnnotationIndex } from './read-later/annotation-index'
import type { ReadLaterAnnotationIndexItem } from './read-later/annotation-index'
import { fetchFeedDirectory, type SharedFeedCategory, type SharedFeedSource } from './read-later/feed-directory-client'
import { importFeedFromUrl, type ImportedFeed, type ImportedFeedItem } from './read-later/feed-import-client'
import { buildReadLaterIndex, parseReadLaterIndexItem } from './read-later/index-items'
import { createNewReadLaterItem } from './read-later/new-item'
import { importReadLaterFromUrl, type ImportedReadLaterArticle, type ImportedReadLaterImage } from './read-later/import-client'
import { parseReadLaterItem, parseReadLaterSections } from './read-later/parse-item'
import { serializeReadLaterItem } from './read-later/serialize-item'
import type { ParsedReadLaterItem, ReadLaterAnnotation } from './read-later/item-types'
import {
  applyFeedRefreshErrorToSubscription,
  applyFeedRefreshSuccessToSubscription,
  createFeedItemKey,
  readFeedSubscriptions,
  saveFeedSubscriptions,
  type FeedFolder,
  type FeedSubscription,
  type FeedSubscriptionsState,
} from './rss/feed-subscriptions'
import { createNewDiaryEntry, createNewPost } from './posts/new-post'
import { buildDiaryIndex, buildKnowledgeIndex, buildPostIndex, collectPostIndexFacets, filterPostIndex, parsePostIndexItem, sortPostIndex } from './posts/index-posts'
import { parsePost } from './posts/parse-post'
import type { ParsedPost } from './posts/parse-post'
import { serializePost } from './posts/serialize-post'
import type { ContentType, PostIndexItem } from './posts/post-types'
import { findPostsWithTaxonomy, renameTaxonomyInContent, deleteTaxonomyFromContent } from './posts/taxonomy-operations'
import { AuthError, createSessionStore, loginWithPopup, readStoredSession } from './session'

type IndexedPostsByType = Record<ContentType, PostIndexItem[]>
type ReadLaterTab = 'info' | 'commentary'
type ReadLaterAnnotationAction = 'highlight' | 'note'
type ReadLaterAnnotationDraft = Pick<ReadLaterAnnotation, 'sectionKey' | 'quote' | 'prefix' | 'suffix'>
type ReaderNavigationRequest = { targetId: string; requestId: number }
type PendingFeedDraftContext = { draftPath: string; feedUrl: string } | null
type TaxonomyType = 'categories' | 'tags'
type TaxonomyConfirmAction =
  | { kind: 'rename'; type: TaxonomyType; oldName: string; newName: string; affectedPaths: string[] }
  | { kind: 'delete'; type: TaxonomyType; name: string; affectedPaths: string[] }

type PostDeleteConfirmAction = {
  kind: 'delete-post'
  post: PostIndexItem
}

const RSS_AUTO_REFRESH_CONCURRENCY = 3
const RSS_AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000
const RSS_VISIBLE_REFRESH_STALE_MS = 15 * 60 * 1000
const RSS_READ_SAVE_DEBOUNCE_MS = 2500
const BACKGROUND_PRELOAD_DELAY_MS = 1200
const RSS_INITIAL_REFRESH_DELAY_MS = 4000

function scheduleBackgroundTask(callback: () => void, delayMs = BACKGROUND_PRELOAD_DELAY_MS) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  let timeoutId: number | null = null
  let idleId: number | null = null
  const requestIdleCallback = window.requestIdleCallback

  timeoutId = window.setTimeout(() => {
    timeoutId = null

    if (requestIdleCallback) {
      idleId = requestIdleCallback(() => {
        idleId = null
        callback()
      }, { timeout: delayMs })
      return
    }

    callback()
  }, delayMs)

  return () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }

    if (idleId !== null && window.cancelIdleCallback) {
      window.cancelIdleCallback(idleId)
    }
  }
}

function decodeBase64Bytes(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function createImportedImageFile(image: ImportedReadLaterImage, index: number) {
  const extension = image.extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
  const basename = image.basename.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || `imported-image-${index + 1}`
  const bytes = decodeBase64Bytes(image.contentBase64)
  const contentType = image.contentType === 'image/jpg' ? 'image/jpeg' : image.contentType

  return new File([bytes], `${basename}.${extension}`, {
    type: contentType || 'image/jpeg',
  })
}

function replaceImportedImageUrls(markdown: string, replacements: Array<{ from: string; to: string }>) {
  return replacements.reduce((currentMarkdown, replacement) => {
    if (!replacement.from || !replacement.to || replacement.from === replacement.to) {
      return currentMarkdown
    }

    return currentMarkdown.split(replacement.from).join(replacement.to)
  }, markdown)
}

type TrashConfirmAction =
  | { kind: 'restore-trash'; entry: TrashEntry }
  | { kind: 'delete-trash'; entry: TrashEntry }

type AppConfirmRequest = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  isDangerous?: boolean
  resolve: (confirmed: boolean) => void
}

type OpenDocumentOptions = {
  draftPost?: ParsedPost | null
  successMessage?: string | null
  mode?: EditorMode
}

type EditorNavigationEntry = {
  post: PostIndexItem
  mode: EditorMode
}

type OpenIndexedPostOptions = {
  skipNavigationConfirm?: boolean
  restoreMode?: EditorMode
  navigationBehavior?: 'reset' | 'push' | 'preserve'
}

type MaterialSourceType = Extract<ContentType, 'diary' | 'read-later'>
type MaterialSelectionState = Record<MaterialSourceType, string[]>

const SAVE_SUCCESS_MESSAGE = '已保存。'
const TAXONOMY_LABELS: Record<TaxonomyType, string> = { categories: '分类', tags: '标签' }

function createEmptyIndexedPostsByType(): IndexedPostsByType {
  return { post: [], diary: [], 'read-later': [], knowledge: [] }
}

function createEmptyMaterialSelectionState(): MaterialSelectionState {
  return { diary: [], 'read-later': [] }
}

function createReadLaterAnnotationId() {
  return `annotation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function getContentTypeFromPostLike(post: Pick<PostIndexItem, 'contentType'> | Pick<ParsedPost, 'contentType'>): ContentType {
  if (post.contentType === 'read-later') {
    return 'read-later'
  }

  if (post.contentType === 'diary') {
    return 'diary'
  }

  if (post.contentType === 'knowledge') {
    return 'knowledge'
  }

  return 'post'
}

function getContentTypeLabel(contentType: ContentType) {
  if (contentType === 'read-later') {
    return '待读'
  }

  if (contentType === 'diary') {
    return '日记'
  }

  return contentType === 'knowledge' ? '知识点' : '文章'
}

function getDeleteContentTypeLabel(contentType: ContentType) {
  if (contentType === 'read-later') {
    return '待读条目'
  }

  if (contentType === 'diary') {
    return '日记'
  }

  return contentType === 'knowledge' ? '知识点' : '文章'
}

function getContentCountUnit(contentType: ContentType) {
  return contentType === 'read-later' || contentType === 'knowledge' ? '条' : '篇'
}

function getReadLaterAnnotationSectionLabel(sectionKey: ReadLaterAnnotation['sectionKey']) {
  if (sectionKey === 'summary') {
    return '我的总结'
  }

  if (sectionKey === 'commentary') {
    return '我的评论'
  }

  return '原文摘录'
}

function formatSelectedMaterialSummary(selection: MaterialSelectionState) {
  const parts: string[] = []
  if (selection.diary.length > 0) {
    parts.push(`${selection.diary.length} 篇日记`)
  }
  if (selection['read-later'].length > 0) {
    parts.push(`${selection['read-later'].length} 条待读`)
  }

  return parts.join(' · ') || '0 条素材'
}

function normalizeUrlForComparison(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  try {
    const url = new URL(trimmed)
    url.hash = ''
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/'
    return `${url.protocol}//${url.host}${normalizedPath}${url.search}`.toLowerCase()
  } catch {
    return trimmed.toLowerCase()
  }
}

function createFeedSubscriptionRecord({
  title,
  url,
  description = '',
  category = '',
  sourceType,
  articleCount = 0,
}: {
  title: string
  url: string
  description?: string
  category?: string
  sourceType: FeedSubscription['sourceType']
  articleCount?: number
}): FeedSubscription {
  const normalizedUrl = normalizeUrlForComparison(url) || url.trim()
  const slug = normalizedUrl
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'feed'

  return {
    id: `feed-${slug}`,
    title: title.trim() || '未命名 RSS',
    url: url.trim(),
    description: description.trim(),
    category: category.trim(),
    sourceType,
    articleCount,
    readLaterCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: '',
  }
}

function createCachedImportedFeed(subscription: FeedSubscription, items: ImportedFeedItem[]): ImportedFeed {
  return {
    title: subscription.title,
    description: subscription.description,
    requestedUrl: subscription.url,
    finalUrl: subscription.url,
    items,
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }))

  return results
}

function createFeedFolderRecord(name: string): FeedFolder {
  const trimmedName = name.trim()
  const slug = trimmedName
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'folder'

  return {
    id: `folder-${slug}-${Date.now().toString(36)}`,
    name: trimmedName,
    createdAt: new Date().toISOString(),
    updatedAt: '',
  }
}

function hasRecoverableChanges(draft: ParsedPost | null, saved: ParsedPost | null) {
  if (!draft) {
    return false
  }

  if (!saved) {
    return true
  }

  return JSON.stringify(draft) !== JSON.stringify(saved)
}

function buildPostIndexItemFromDocument(document: ParsedPost): PostIndexItem {
  const resolvedContentType = getContentTypeFromPostLike(document)

  return {
    path: document.path,
    sha: document.sha,
    title: document.frontmatter.title.trim() || '未命名草稿',
    date: document.frontmatter.date,
    desc: document.frontmatter.desc,
    published: resolvedContentType === 'read-later' ? false : Boolean(document.frontmatter.published),
    pinned: Boolean(document.frontmatter.pinned),
    hasExplicitPublished: document.hasExplicitPublished,
    categories: document.frontmatter.categories,
    tags: document.frontmatter.tags,
    permalink: document.frontmatter.permalink || null,
    cover: document.frontmatter.cover || null,
    body: document.body,
    contentType: resolvedContentType,
    ...(resolvedContentType === 'read-later'
      ? {
          externalUrl: document.frontmatter.external_url || null,
          sourceName: document.frontmatter.source_name || null,
          readingStatus: document.frontmatter.reading_status || 'unread',
        }
      : resolvedContentType === 'knowledge' || resolvedContentType === 'post'
        ? {
            ...(resolvedContentType === 'knowledge'
              ? {
                  sourceType: document.frontmatter.source_type || null,
                  sourcePath: document.frontmatter.source_path || null,
                  sourceTitle: document.frontmatter.source_title || null,
                  sourceUrl: document.frontmatter.source_url || null,
                  knowledgeKind: document.frontmatter.knowledge_kind || 'note',
                }
              : {}),
            isTopic: document.frontmatter.topic === true,
            topicType: document.frontmatter.topic_type || null,
            nodeKey: document.frontmatter.node_key || null,
            aliases: document.frontmatter.aliases || [],
            series: document.frontmatter.series || null,
          }
      : {}),
  }
}

function replacePostIndexItem(currentPosts: PostIndexItem[], nextPost: PostIndexItem, previousPath?: string) {
  return sortPostIndex(
    currentPosts.filter((post) => post.path !== nextPost.path && post.path !== previousPath).concat(nextPost),
    'date-desc',
  )
}

function buildNextPostsByType(
  currentPostsByType: IndexedPostsByType,
  contentType: ContentType,
  nextPost: PostIndexItem,
  previousPath?: string,
): IndexedPostsByType {
  return {
    ...currentPostsByType,
    [contentType]: replacePostIndexItem(currentPostsByType[contentType], nextPost, previousPath),
  }
}

function upsertDocumentIntoIndexItems(posts: PostIndexItem[], document: ParsedPost | null) {
  if (!document) {
    return posts
  }

  const nextPost = buildPostIndexItemFromDocument(document)
  return [nextPost, ...posts.filter((post) => post.path !== nextPost.path)]
}

function isTopicDocument(document: ParsedPost | PostIndexItem | null | undefined) {
  return Boolean(document && isTopicNodePost(document))
}

function buildIndexItemFromSavedFile(
  contentType: ContentType,
  file: { path: string; sha: string; content: string },
): PostIndexItem {
  if (contentType === 'read-later') {
    return parseReadLaterIndexItem(file)
  }

  return parsePostIndexItem(file)
}

type BuildIndexByContentTypeOptions = {
  onFilesListed?: (posts: PostIndexItem[]) => void
}

async function buildIndexByContentType(session: { token: string }, type: ContentType, options: BuildIndexByContentTypeOptions = {}) {
  if (type === 'read-later') {
    return buildReadLaterIndex(session, options)
  }

  if (type === 'diary') {
    return buildDiaryIndex(session, options)
  }

  if (type === 'knowledge') {
    return buildKnowledgeIndex(session, options)
  }

  return buildPostIndex(session, options)
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <section className="hero-card">
      <div className="hero-card__grid" />
      <p className="eyebrow">写作后台</p>
      <h1>内容编辑台</h1>
      <p>请选择一条内容开始编辑，或新建一篇草稿。</p>
      {error ? <p className="error-message">{error}</p> : null}
    </section>
  )
}

type AdminView = 'dashboard' | 'editor' | 'annotations' | 'trash' | 'feeds' | 'series'

export default function App() {
  const sessionStore = useMemo(() => createSessionStore(readStoredSession()), [])
  const [session, setSession] = useState(() => sessionStore.getSession())
  const { isDark, toggle: toggleColorMode } = useColorMode()
  const {
    fontSize: previewReadingFontSize,
    fontWeight: previewReadingFontWeight,
    fontWeightIndex: previewReadingFontWeightIndex,
    setFontSize: setPreviewReadingFontSize,
    setFontWeightIndex: setPreviewReadingFontWeightIndex,
  } = useReadingFont()
  const [contentType, setContentType] = useState<ContentType>('post')
  const [postsByType, setPostsByType] = useState<IndexedPostsByType>(createEmptyIndexedPostsByType)
  const posts = postsByType[contentType]
  const readLaterPosts = postsByType['read-later']
  const [activePostPath, setActivePostPath] = useState<string | null>(null)
  const [editorNavigationStack, setEditorNavigationStack] = useState<EditorNavigationEntry[]>([])
  const [search, setSearch] = useState('')
  const [isImmersive, setIsImmersive] = useState(false)
  const [adminView, setAdminView] = useState<AdminView>('dashboard')
  const [isLoading, setIsLoading] = useState(false)
  const [isIndexing, setIsIndexing] = useState(false)
  const [isAnnotationIndexing, setIsAnnotationIndexing] = useState(false)
  const [isTrashIndexing, setIsTrashIndexing] = useState(false)
  const [isOpeningPost, setIsOpeningPost] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isImportingFromUrl, setIsImportingFromUrl] = useState(false)
  const [isQuickCollectingReadLater, setIsQuickCollectingReadLater] = useState(false)
  const [isOrganizingMaterials, setIsOrganizingMaterials] = useState(false)
  const [isMaterialOrganizerOpen, setIsMaterialOrganizerOpen] = useState(false)
  const [isMaterialOrganizerLoadingSources, setIsMaterialOrganizerLoadingSources] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [materialResult, setMaterialResult] = useState<string | null>(null)
  const [selectedMaterialPaths, setSelectedMaterialPaths] = useState<MaterialSelectionState>(createEmptyMaterialSelectionState)
  const [quickReadLaterUrl, setQuickReadLaterUrl] = useState('')
  const [rssSubscriptionsState, setRssSubscriptionsState] = useState<FeedSubscriptionsState>({
    path: FEED_SUBSCRIPTIONS_PATH,
    folders: [],
    subscriptions: [],
  })
  const [selectedRssFeedUrl, setSelectedRssFeedUrl] = useState<string | null>(null)
  const [rssPreviewFeed, setRssPreviewFeed] = useState<ImportedFeed | null>(null)
  const [rssFeedItemsByUrl, setRssFeedItemsByUrl] = useState<Record<string, ImportedFeedItem[]>>({})
  const [rssPreviewArticlesByUrl, setRssPreviewArticlesByUrl] = useState<Record<string, ImportedReadLaterArticle>>({})
  const [rssPreviewArticleLoadingByUrl, setRssPreviewArticleLoadingByUrl] = useState<Record<string, boolean>>({})
  const [rssPreviewArticleErrorsByUrl, setRssPreviewArticleErrorsByUrl] = useState<Record<string, string>>({})
  const [viewedFeedItemsByUrl, setViewedFeedItemsByUrl] = useState<ViewedFeedItemsByUrl>(readViewedFeedItemsByUrl)
  const [manualFeedUrl, setManualFeedUrl] = useState('')
  const [isRssSubscriptionsLoading, setIsRssSubscriptionsLoading] = useState(false)
  const [hasLoadedRssSubscriptions, setHasLoadedRssSubscriptions] = useState(false)
  const [isSavingRssSubscription, setIsSavingRssSubscription] = useState(false)
  const [isRssPreviewLoading, setIsRssPreviewLoading] = useState(false)
  const [isRssBackgroundRefreshing, setIsRssBackgroundRefreshing] = useState(false)
  const [isFeedDirectoryVisible, setIsFeedDirectoryVisible] = useState(false)
  const [quickReadLaterDirectory, setQuickReadLaterDirectory] = useState<SharedFeedCategory[]>([])
  const [isQuickReadLaterDirectoryLoading, setIsQuickReadLaterDirectoryLoading] = useState(false)
  const [quickReadLaterDirectoryPendingFeedUrl, setQuickReadLaterDirectoryPendingFeedUrl] = useState<string | null>(null)
  const [quickReadLaterPendingItemUrl, setQuickReadLaterPendingItemUrl] = useState<string | null>(null)
  const [pendingFeedDraftContext, setPendingFeedDraftContext] = useState<PendingFeedDraftContext>(null)
  const [previewImageUrls, setPreviewImageUrls] = useState<Record<string, string>>({})
  const [readLaterAnnotationIndex, setReadLaterAnnotationIndex] = useState<ReadLaterAnnotationIndexItem[]>([])
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([])
  const previewObjectUrlsRef = useRef<string[]>([])
  const preloadAttemptedRef = useRef<Partial<Record<ContentType, boolean>>>({})
  const rssAutoRefreshAttemptedRef = useRef(false)
  const rssBackgroundRefreshInFlightRef = useRef(false)
  const rssLastRefreshAtRef = useRef(0)
  const rssReadSaveTimerRef = useRef<number | null>(null)
  const pendingRssReadKeysByUrlRef = useRef<Record<string, Set<string>>>({})
  const rssSubscriptionsStateRef = useRef(rssSubscriptionsState)
  const rssPreviewRequestIdRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [taxonomyConfirm, setTaxonomyConfirm] = useState<TaxonomyConfirmAction | null>(null)
  const [postDeleteConfirm, setPostDeleteConfirm] = useState<PostDeleteConfirmAction | null>(null)
  const [trashConfirm, setTrashConfirm] = useState<TrashConfirmAction | null>(null)
  const [appConfirm, setAppConfirm] = useState<AppConfirmRequest | null>(null)
  const [isBatchUpdating, setIsBatchUpdating] = useState(false)
  const [isDeletingPost, setIsDeletingPost] = useState(false)
  const [deletingPostPath, setDeletingPostPath] = useState<string | null>(null)
  const [isProcessingTrash, setIsProcessingTrash] = useState(false)
  const [processingTrashPath, setProcessingTrashPath] = useState<string | null>(null)
  const [isTogglingPinned, setIsTogglingPinned] = useState(false)
  const [togglingPinnedPostPath, setTogglingPinnedPostPath] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState('')
  const [readLaterTab, setReadLaterTab] = useState<ReadLaterTab>('commentary')
  const [isReadLaterTopBarHidden, setIsReadLaterTopBarHidden] = useState(false)
  const [isPostListDrawerOpen, setIsPostListDrawerOpen] = useState(false)
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [shouldFocusSettingsTitle, setShouldFocusSettingsTitle] = useState(false)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [annotationNoteDraft, setAnnotationNoteDraft] = useState('')
  const [annotationScrollRequest, setAnnotationScrollRequest] = useState(0)
  const [readerNavigationRequest, setReaderNavigationRequest] = useState<ReaderNavigationRequest | null>(null)
  const [activeOutlineTargetId, setActiveOutlineTargetId] = useState<string | null>(null)
  const {
    document,
    savedDocument,
    mode,
    isDirty,
    validationErrors,
    canNavigateAway,
    setMode,
    replaceDocument,
    updateFrontmatter,
    updateBody,
    updateReadLaterAnnotations,
    validate,
    markSaved,
  } = useEditorDocument()

  useEffect(() => {
    if (!isPostListDrawerOpen && !isSettingsDrawerOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPostListDrawerOpen(false)
        setIsSettingsDrawerOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPostListDrawerOpen, isSettingsDrawerOpen])

  const filteredPosts = useMemo(
    () =>
      filterPostIndex(posts, {
        query: search,
        publishState: 'all',
        category: null,
        tag: null,
        series: null,
        sort: 'date-desc',
      }),
    [posts, search],
  )
  const { categories: availableCategories, tags: availableTags, seriesList: availableSeries } = useMemo(() => {
    const facets = collectPostIndexFacets(posts)
    if (contentType !== 'knowledge' || facets.categories.includes(KNOWLEDGE_RANDOM_CATEGORY)) {
      return facets
    }

    return {
      ...facets,
      categories: [KNOWLEDGE_RANDOM_CATEGORY, ...facets.categories].sort((left, right) =>
        left.localeCompare(right, 'zh-CN'),
      ),
    }
  }, [contentType, posts])
  const selectedMaterialCounts = useMemo(
    () => ({
      diary: selectedMaterialPaths.diary.length,
      'read-later': selectedMaterialPaths['read-later'].length,
    }),
    [selectedMaterialPaths],
  )
  const selectedDiaryPosts = useMemo(() => {
    const selectedPathSet = new Set(selectedMaterialPaths.diary)
    return postsByType.diary.filter((post) => selectedPathSet.has(post.path))
  }, [postsByType.diary, selectedMaterialPaths.diary])
  const selectedReadLaterPosts = useMemo(() => {
    const selectedPathSet = new Set(selectedMaterialPaths['read-later'])
    return postsByType['read-later'].filter((post) => selectedPathSet.has(post.path))
  }, [postsByType['read-later'], selectedMaterialPaths['read-later']])
  const rssSubscriptions = rssSubscriptionsState.subscriptions
  useEffect(() => {
    rssSubscriptionsStateRef.current = rssSubscriptionsState
  }, [rssSubscriptionsState])

  const rssUnreadCount = useMemo(
    () => rssSubscriptions.reduce((total, subscription) => total + (subscription.unreadItemKeys?.length || 0), 0),
    [rssSubscriptions],
  )
  const selectedRssSubscription = useMemo(
    () => rssSubscriptions.find((subscription) => subscription.url === selectedRssFeedUrl) || null,
    [rssSubscriptions, selectedRssFeedUrl],
  )

  useEffect(() => {
    if (adminView !== 'feeds' || !successMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null)
    }, 3200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [adminView, successMessage])

  useEffect(() => {
    const availablePathsByType: Record<MaterialSourceType, Set<string>> = {
      diary: new Set(postsByType.diary.map((post) => post.path)),
      'read-later': new Set(postsByType['read-later'].map((post) => post.path)),
    }

    setSelectedMaterialPaths((current) => {
      const nextDiaryPaths = current.diary.filter((path) => availablePathsByType.diary.has(path))
      const nextReadLaterPaths = current['read-later'].filter((path) => availablePathsByType['read-later'].has(path))

      if (
        nextDiaryPaths.length === current.diary.length &&
        nextReadLaterPaths.length === current['read-later'].length
      ) {
        return current
      }

      return {
        diary: nextDiaryPaths,
        'read-later': nextReadLaterPaths,
      }
    })
  }, [postsByType.diary, postsByType['read-later']])

  useEffect(() => {
    if (adminView !== 'dashboard' || (contentType !== 'diary' && contentType !== 'read-later')) {
      setIsMaterialOrganizerOpen(false)
    }
  }, [adminView, contentType])

  const readLaterAnnotations = useMemo(
    () => (document?.contentType === 'read-later' ? (document.annotations || []) : []),
    [document],
  )
  const documentContentFormat = useMemo(
    () => (document ? resolveContentFormat(document.path, document.frontmatter.format) : 'markdown'),
    [document],
  )
  const activeDocumentPost = useMemo(() => {
    if (!document) {
      return null
    }

    const resolvedContentType = getContentTypeFromPostLike(document)
    return postsByType[resolvedContentType].find((post) => post.path === document.path) || buildPostIndexItemFromDocument(document)
  }, [document, postsByType])
  const backlinkSourcePosts = useMemo(() => {
    const indexedPosts = [...postsByType.post, ...postsByType.diary, ...postsByType.knowledge]

    if (!document || document.contentType === 'read-later') {
      return indexedPosts
    }

    return upsertDocumentIntoIndexItems(indexedPosts, document)
  }, [document, postsByType.diary, postsByType.knowledge, postsByType.post])
  const topicNodesByKey = useMemo(() => {
    const indexedPosts = [...postsByType.post, ...postsByType.knowledge]

    if (!document || (document.contentType !== 'post' && document.contentType !== 'knowledge')) {
      return buildTopicNodeMap(indexedPosts)
    }

    return buildTopicNodeMap(upsertDocumentIntoIndexItems(indexedPosts, document))
  }, [document, postsByType.knowledge, postsByType.post])
  const topicBacklinksByKey = useMemo(() => buildTopicBacklinkMap(backlinkSourcePosts), [backlinkSourcePosts])
  const internalReferencePosts = useMemo(() => {
    const indexedPosts = [...postsByType.post, ...postsByType.diary, ...postsByType['read-later'], ...postsByType.knowledge]

    if (!document) {
      return indexedPosts
    }

    const activeDocumentPost = buildPostIndexItemFromDocument(document)
    return [activeDocumentPost, ...indexedPosts.filter((post) => post.path !== activeDocumentPost.path)]
  }, [document, postsByType.diary, postsByType.knowledge, postsByType.post, postsByType['read-later']])
  const internalReferenceCandidates = useMemo(
    () => buildInternalReferenceCandidates(internalReferencePosts),
    [internalReferencePosts],
  )
  const internalReferenceLookup = useMemo(
    () => buildInternalReferenceLookup(internalReferencePosts),
    [internalReferencePosts],
  )
  const activeTopicNodeKey =
    document?.contentType === 'post' && document.frontmatter.topic === true
      ? document.frontmatter.node_key?.trim() || ''
      : document?.contentType === 'knowledge' && document.frontmatter.knowledge_kind === 'topic'
        ? document.frontmatter.node_key?.trim() || ''
        : ''
  const activeTopicBacklinks = useMemo(() => {
    if (!activeTopicNodeKey || !document) {
      return []
    }

    return (topicBacklinksByKey.get(activeTopicNodeKey) || []).filter((item) => item.sourcePath !== document.path)
  }, [activeTopicNodeKey, document, topicBacklinksByKey])
  const previewMarkdown = useMemo(() => {
    if (!document) {
      return ''
    }

    if (document.contentType === 'post' && document.frontmatter.topic === true) {
      return stripGeneratedTopicBacklinks(document.body)
    }

    if (!activeTopicNodeKey) {
      return document.body
    }

    return appendTopicBacklinksToMarkdown(document.body, activeTopicBacklinks)
  }, [activeTopicBacklinks, activeTopicNodeKey, document])
  const recoverableDrafts = useMemo(() => {
    const knownPaths = new Set(postsByType[contentType].map((post) => post.path))

    return listLocalDraftSummaries().filter((draft) => draft.contentType === contentType && !knownPaths.has(draft.path))
  }, [contentType, postsByType, adminView, document?.path, isDirty, isSaving, session])

  const updatePostsForType = useCallback((type: ContentType, updater: (currentPosts: PostIndexItem[]) => PostIndexItem[]) => {
    setPostsByType((currentPostsByType) => ({
      ...currentPostsByType,
      [type]: updater(currentPostsByType[type]),
    }))
  }, [])

  const appendEditorNavigationEntry = useCallback((entry: EditorNavigationEntry) => {
    setEditorNavigationStack((currentStack) => {
      const lastEntry = currentStack[currentStack.length - 1]
      if (lastEntry?.post.path === entry.post.path && lastEntry.mode === entry.mode) {
        return currentStack
      }

      return [...currentStack, entry]
    })
  }, [])

  const loadTrashEntries = useCallback(async (activeSession: { token: string }) => {
    setIsTrashIndexing(true)

    try {
      await purgeExpiredTrashEntries(activeSession)
      const entries = await listTrashEntries(activeSession)
      setTrashEntries(entries)
    } finally {
      setIsTrashIndexing(false)
    }
  }, [])

  useEffect(() => {
    setReadLaterTab('commentary')
    setActiveAnnotationId(null)
    setEditingAnnotationId(null)
    setAnnotationScrollRequest(0)
  }, [document?.path, document?.contentType])

  useEffect(() => {
    if (!editingAnnotationId) {
      setAnnotationNoteDraft('')
      return
    }

    setAnnotationNoteDraft(
      readLaterAnnotations.find((annotation) => annotation.id === editingAnnotationId)?.note || '',
    )
  }, [editingAnnotationId, readLaterAnnotations])

  useEffect(() => {
    if (!session || contentType !== 'read-later' || adminView !== 'annotations') {
      return
    }

    let cancelled = false

    const loadAnnotations = async () => {
      setIsAnnotationIndexing(true)

      try {
        const annotations = await buildReadLaterAnnotationIndex(session, readLaterPosts)
        if (!cancelled) {
          setReadLaterAnnotationIndex(annotations)
        }
      } catch (caughtError) {
        if (cancelled) {
          return
        }

        if (caughtError instanceof GitHubAuthError) {
          handleAuthExpiry(caughtError.message)
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : '加载批注列表失败。')
      } finally {
        if (!cancelled) {
          setIsAnnotationIndexing(false)
        }
      }
    }

    void loadAnnotations()

    return () => {
      cancelled = true
    }
  }, [adminView, contentType, readLaterPosts, session])

  useEffect(() => {
    if (!session || adminView !== 'trash') {
      return
    }

    let cancelled = false

    const loadTrash = async () => {
      try {
        await loadTrashEntries(session)
      } catch (caughtError) {
        if (cancelled) {
          return
        }

        if (caughtError instanceof GitHubAuthError) {
          handleAuthExpiry(caughtError.message)
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : '加载回收站失败。')
      }
    }

    void loadTrash()

    return () => {
      cancelled = true
    }
  }, [adminView, loadTrashEntries, session])

  useEffect(() => {
    if (!session || adminView !== 'feeds' || hasLoadedRssSubscriptions) {
      return
    }

    let cancelled = false

    const loadSubscriptions = async () => {
      setIsRssSubscriptionsLoading(true)

      try {
        const nextState = await readFeedSubscriptions(session)
        if (cancelled) {
          return
        }

        setRssSubscriptionsState(nextState)
        setHasLoadedRssSubscriptions(true)
      } catch (caughtError) {
        if (cancelled) {
          return
        }

        if (caughtError instanceof GitHubAuthError) {
          handleAuthExpiry(caughtError.message)
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : '加载 RSS 订阅失败。')
      } finally {
        if (!cancelled) {
          setIsRssSubscriptionsLoading(false)
        }
      }
    }

    void loadSubscriptions()

    return () => {
      cancelled = true
    }
  }, [adminView, hasLoadedRssSubscriptions, session])

  useEffect(() => {
    if (rssSubscriptions.length === 0) {
      setSelectedRssFeedUrl(null)
      setRssPreviewFeed(null)
      return
    }

    if (selectedRssFeedUrl && rssSubscriptions.some((subscription) => subscription.url === selectedRssFeedUrl)) {
      return
    }

    setSelectedRssFeedUrl(rssSubscriptions[0].url)
  }, [rssSubscriptions, selectedRssFeedUrl])

  useEffect(() => {
    if (!document || document.contentType !== 'read-later' || mode !== 'preview') {
      setIsReadLaterTopBarHidden(false)
    }
  }, [document, mode])

  const revokePreviewObjectUrls = () => {
    if (typeof URL.revokeObjectURL === 'function') {
      previewObjectUrlsRef.current.forEach((objectUrl) => {
        URL.revokeObjectURL(objectUrl)
      })
    }
    previewObjectUrlsRef.current = []
  }

  const resetPreviewImageUrls = () => {
    revokePreviewObjectUrls()
    setPreviewImageUrls({})
  }

  useEffect(() => {
    return () => {
      revokePreviewObjectUrls()
    }
  }, [])

  useEffect(() => {
    if (!document) {
      return
    }

    if (!isDirty) {
      removeLocalDraft(document.path)
      return
    }

    saveLocalDraft(savedDocument, document)
  }, [document, isDirty, savedDocument])

  useEffect(() => {
    if (!session) {
      preloadAttemptedRef.current = {}
      setPostsByType(createEmptyIndexedPostsByType())
      setTrashEntries([])
      setIsIndexing(false)
      setIsOpeningPost(false)
      return
    }

    let cancelled = false
    const indexedContentType = contentType

    const loadPosts = async () => {
      setIsIndexing(true)

      try {
        const indexedPosts = await buildIndexByContentType(session, indexedContentType, {
          onFilesListed: (listedPosts) => {
            if (!cancelled) {
              updatePostsForType(indexedContentType, () => listedPosts as PostIndexItem[])
            }
          },
        })
        if (!cancelled) {
          updatePostsForType(indexedContentType, () => indexedPosts as PostIndexItem[])
        }
      } catch (caughtError) {
        if (cancelled) {
          return
        }

        if (caughtError instanceof GitHubAuthError) {
          handleAuthExpiry(caughtError.message)
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : `加载${getContentTypeLabel(indexedContentType)}列表失败。`)
      } finally {
        if (!cancelled) {
          setIsIndexing(false)
        }
      }
    }

    void loadPosts()

    return () => {
      cancelled = true
    }
  }, [contentType, session, sessionStore, updatePostsForType])

  useEffect(() => {
    if (!session) {
      return
    }

    const preloadTypes = (['post', 'diary', 'knowledge'] as const).filter(
      (type) => type !== contentType && postsByType[type].length === 0 && !preloadAttemptedRef.current[type],
    )
    if (preloadTypes.length === 0) {
      return
    }

    let cancelled = false
    preloadTypes.forEach((type) => {
      preloadAttemptedRef.current[type] = true
    })

    const cancelPreload = scheduleBackgroundTask(() => {
      void (async () => {
        for (const type of preloadTypes) {
          if (cancelled) {
            return
          }

          try {
            const indexedPosts = await buildIndexByContentType(session, type)
            if (!cancelled) {
              updatePostsForType(type, () => indexedPosts as PostIndexItem[])
            }
          } catch {
            // Keep the focused editing flow responsive even if background preload fails.
          }
        }
      })()
    })

    return () => {
      cancelled = true
      cancelPreload()
    }
  }, [contentType, postsByType.diary.length, postsByType.knowledge.length, postsByType.post.length, session, updatePostsForType])

  const openDocument = (nextPost: ParsedPost, options?: OpenDocumentOptions) => {
    resetPreviewImageUrls()
    replaceDocument(nextPost, options?.draftPost ?? undefined)
    setMode(options?.mode ?? (nextPost.contentType === 'read-later' ? 'preview' : 'markdown'))
    setActivePostPath(nextPost.path)
    setIsImmersive(false)
    setLastSavedAt(null)
    setIsPostListDrawerOpen(false)
    setIsSettingsDrawerOpen(false)
    setShouldFocusSettingsTitle(false)
    setSuccessMessage(options?.successMessage || null)
    setError(null)
  }

  const requestAppConfirm = useCallback((request: Omit<AppConfirmRequest, 'resolve'>) => (
    new Promise<boolean>((resolve) => {
      setAppConfirm({ ...request, resolve })
    })
  ), [])

  const closeAppConfirm = (confirmed: boolean) => {
    appConfirm?.resolve(confirmed)
    setAppConfirm(null)
  }

  const confirmNavigation = async () => {
    if (canNavigateAway) {
      return true
    }

    const shouldDiscard = await requestAppConfirm({
      title: '未保存修改',
      message: '当前稿件还有未保存的修改。丢弃这些修改并继续吗？',
      confirmLabel: '丢弃并继续',
      cancelLabel: '留在这里',
      isDangerous: true,
    })
    if (shouldDiscard && document) {
      removeLocalDraft(document.path)
    }

    return shouldDiscard
  }

  const handleLogin = async () => {
    setIsLoading(true)
    setSuccessMessage(null)
    setError(null)

    try {
      const nextSession = await loginWithPopup()
      sessionStore.setSession(nextSession)
      setSession(nextSession)
    } catch (caughtError) {
      const message =
        caughtError instanceof AuthError ? caughtError.message : 'GitHub 授权失败。'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const resetWorkspace = () => {
    resetPreviewImageUrls()
    setPostsByType(createEmptyIndexedPostsByType())
    setReadLaterAnnotationIndex([])
    setTrashEntries([])
    setActivePostPath(null)
    setEditorNavigationStack([])
    setIsOpeningPost(false)
    setIsQuickCollectingReadLater(false)
    setQuickReadLaterUrl('')
    setManualFeedUrl('')
    setRssSubscriptionsState({ path: FEED_SUBSCRIPTIONS_PATH, folders: [], subscriptions: [] })
    rssSubscriptionsStateRef.current = { path: FEED_SUBSCRIPTIONS_PATH, folders: [], subscriptions: [] }
    setRssFeedItemsByUrl({})
    rssAutoRefreshAttemptedRef.current = false
    rssBackgroundRefreshInFlightRef.current = false
    rssLastRefreshAtRef.current = 0
    if (rssReadSaveTimerRef.current !== null) {
      window.clearTimeout(rssReadSaveTimerRef.current)
      rssReadSaveTimerRef.current = null
    }
    pendingRssReadKeysByUrlRef.current = {}
    setHasLoadedRssSubscriptions(false)
    setSelectedRssFeedUrl(null)
    setRssPreviewFeed(null)
    setPendingFeedDraftContext(null)
    setIsFeedDirectoryVisible(false)
    setQuickReadLaterDirectory([])
    setSuccessMessage(null)
    replaceDocument(null)
    setIsImmersive(false)
    setAdminView('dashboard')
  }

  const handleAuthExpiry = (message: string) => {
    sessionStore.logout()
    setSession(null)
    resetWorkspace()
    setError(message)
  }

  type RssSubscriptionsPatch = (state: FeedSubscriptionsState) => FeedSubscriptionsState

  const applyRssSubscriptionsPatchLocally = (patcher: RssSubscriptionsPatch) => {
    const currentState = rssSubscriptionsStateRef.current
    const nextState = patcher(currentState)
    if (nextState === currentState) {
      return currentState
    }

    rssSubscriptionsStateRef.current = nextState
    setRssSubscriptionsState(nextState)
    setHasLoadedRssSubscriptions(true)
    return nextState
  }

  const saveRssSubscriptionsPatch = async (patcher: RssSubscriptionsPatch) => {
    if (!session) {
      return null
    }

    const currentState = rssSubscriptionsStateRef.current
    const nextState = patcher(currentState)
    if (nextState === currentState) {
      return currentState
    }

    rssSubscriptionsStateRef.current = nextState
    setRssSubscriptionsState(nextState)

    try {
      const savedState = await saveFeedSubscriptions(session, nextState)
      rssSubscriptionsStateRef.current = savedState
      setRssSubscriptionsState(savedState)
      setHasLoadedRssSubscriptions(true)
      return savedState
    } catch (caughtError) {
      if (!(caughtError instanceof GitHubConflictError)) {
        throw caughtError
      }

      const latestState = await readFeedSubscriptions(session)
      const mergedState = patcher(latestState)
      const savedState = await saveFeedSubscriptions(session, mergedState)
      rssSubscriptionsStateRef.current = savedState
      setRssSubscriptionsState(savedState)
      setHasLoadedRssSubscriptions(true)
      return savedState
    }
  }

  const createRemoveUnreadKeysPatch = (keysByUrl: Record<string, Set<string>>): RssSubscriptionsPatch => (state) => {
    let changed = false
    const nextSubscriptions = state.subscriptions.map((subscription) => {
      const keysToRemove = keysByUrl[subscription.url]
      if (!keysToRemove || keysToRemove.size === 0 || !subscription.unreadItemKeys?.length) {
        return subscription
      }

      const nextUnreadItemKeys = subscription.unreadItemKeys.filter((itemKey) => !keysToRemove.has(itemKey))
      if (nextUnreadItemKeys.length === subscription.unreadItemKeys.length) {
        return subscription
      }

      changed = true
      return {
        ...subscription,
        unreadItemKeys: nextUnreadItemKeys,
        updatedAt: new Date().toISOString(),
      }
    })

    return changed ? { ...state, subscriptions: nextSubscriptions } : state
  }

  const flushPendingRssReadKeys = async () => {
    const pendingKeysByUrl = pendingRssReadKeysByUrlRef.current
    pendingRssReadKeysByUrlRef.current = {}
    if (Object.keys(pendingKeysByUrl).length === 0 || !session) {
      return
    }

    const patcher = createRemoveUnreadKeysPatch(pendingKeysByUrl)
    try {
      const currentState = rssSubscriptionsStateRef.current
      const savedState = await saveFeedSubscriptions(session, currentState)
      rssSubscriptionsStateRef.current = savedState
      setRssSubscriptionsState(savedState)
    } catch (caughtError) {
      if (caughtError instanceof GitHubConflictError) {
        const latestState = await readFeedSubscriptions(session)
        const mergedState = patcher(latestState)
        const savedState = await saveFeedSubscriptions(session, mergedState)
        rssSubscriptionsStateRef.current = savedState
        setRssSubscriptionsState(savedState)
        return
      }

      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '保存 RSS 已读状态失败。')
    }
  }

  const scheduleRssReadStateSave = () => {
    if (rssReadSaveTimerRef.current !== null) {
      window.clearTimeout(rssReadSaveTimerRef.current)
    }

    rssReadSaveTimerRef.current = window.setTimeout(() => {
      rssReadSaveTimerRef.current = null
      void flushPendingRssReadKeys()
    }, RSS_READ_SAVE_DEBOUNCE_MS)
  }

  const markRssFeedItemsRead = (feedUrl: string, items: ImportedFeedItem[]) => {
    const itemKeys = items.map((item) => createFeedItemKey(item)).filter(Boolean)
    if (itemKeys.length === 0) {
      return
    }

    const patcher = createRemoveUnreadKeysPatch({ [feedUrl]: new Set(itemKeys) })
    const currentState = rssSubscriptionsStateRef.current
    const nextState = applyRssSubscriptionsPatchLocally(patcher)
    if (nextState === currentState) {
      return
    }

    const pendingKeys = pendingRssReadKeysByUrlRef.current[feedUrl] || new Set<string>()
    itemKeys.forEach((itemKey) => pendingKeys.add(itemKey))
    pendingRssReadKeysByUrlRef.current[feedUrl] = pendingKeys
    scheduleRssReadStateSave()
  }

  const markRssFeedRead = (subscription: FeedSubscription) => {
    const itemKeys = subscription.unreadItemKeys || []
    if (itemKeys.length === 0) {
      return
    }

    const pendingKeys = pendingRssReadKeysByUrlRef.current[subscription.url] || new Set<string>()
    itemKeys.forEach((itemKey) => pendingKeys.add(itemKey))
    pendingRssReadKeysByUrlRef.current[subscription.url] = pendingKeys
    applyRssSubscriptionsPatchLocally(createRemoveUnreadKeysPatch({ [subscription.url]: new Set(itemKeys) }))
    scheduleRssReadStateSave()
  }

  useEffect(() => {
    if (!session || hasLoadedRssSubscriptions) {
      return
    }

    let cancelled = false

    const preloadSubscriptions = async () => {
      try {
        const nextState = await readFeedSubscriptions(session)
        if (cancelled) {
          return
        }

        setRssSubscriptionsState(nextState)
        setHasLoadedRssSubscriptions(true)
      } catch (caughtError) {
        if (cancelled) {
          return
        }

        if (caughtError instanceof GitHubAuthError) {
          handleAuthExpiry(caughtError.message)
        }
      }
    }

    void preloadSubscriptions()

    return () => {
      cancelled = true
    }
  }, [hasLoadedRssSubscriptions, session])

  const refreshRssSubscriptionsInBackground = async () => {
    const currentDocument = typeof document === 'undefined' ? null : document
    if (
      !session
      || !hasLoadedRssSubscriptions
      || rssBackgroundRefreshInFlightRef.current
      || currentDocument?.visibilityState === 'hidden'
    ) {
      return
    }

    const currentSubscriptions = rssSubscriptionsStateRef.current.subscriptions
    if (currentSubscriptions.length === 0) {
      return
    }

    rssBackgroundRefreshInFlightRef.current = true
    setIsRssBackgroundRefreshing(true)

    type FeedRefreshResult =
      | { subscriptionUrl: string; importedFeed: ImportedFeed; timestamp: string }
      | { subscriptionUrl: string; caughtError: unknown; timestamp: string }

    try {
      const subscriptionsByRefreshPriority = selectedRssFeedUrl
        ? [
            ...currentSubscriptions.filter((subscription) => subscription.url === selectedRssFeedUrl),
            ...currentSubscriptions.filter((subscription) => subscription.url !== selectedRssFeedUrl),
          ]
        : currentSubscriptions
      const results = await mapWithConcurrency(
        subscriptionsByRefreshPriority,
        RSS_AUTO_REFRESH_CONCURRENCY,
        async (subscription): Promise<FeedRefreshResult> => {
          const timestamp = new Date().toISOString()
          try {
            const importedFeed = await importFeedFromUrl(session, subscription.url)
            setRssFeedItemsByUrl((currentItemsByUrl) => ({
              ...currentItemsByUrl,
              [subscription.url]: importedFeed.items,
            }))
            return { subscriptionUrl: subscription.url, importedFeed, timestamp }
          } catch (caughtError) {
            return { subscriptionUrl: subscription.url, caughtError, timestamp }
          }
        },
      )

      const authError = results.find(
        (result) => 'caughtError' in result && result.caughtError instanceof GitHubAuthError,
      )
      if (authError && 'caughtError' in authError && authError.caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(authError.caughtError.message)
        return
      }

      const resultsByUrl = new Map(results.map((result) => [result.subscriptionUrl, result]))
      const patcher: RssSubscriptionsPatch = (state) => {
        let changed = false
        const nextSubscriptions = state.subscriptions.map((subscription) => {
          const result = resultsByUrl.get(subscription.url)
          if (!result) {
            return subscription
          }

          const nextSubscription = 'importedFeed' in result
            ? applyFeedRefreshSuccessToSubscription(subscription, result.importedFeed, result.timestamp)
            : applyFeedRefreshErrorToSubscription(
                subscription,
                result.caughtError instanceof Error ? result.caughtError.message : 'RSS 抓取失败。',
                result.timestamp,
              )
          if (!nextSubscription) {
            return subscription
          }

          changed = true
          return nextSubscription
        })

        return changed ? { ...state, subscriptions: nextSubscriptions } : state
      }

      const nextState = patcher(rssSubscriptionsStateRef.current)
      if (nextState !== rssSubscriptionsStateRef.current) {
        await saveRssSubscriptionsPatch(patcher)
      }
      rssLastRefreshAtRef.current = Date.now()
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      if (adminView === 'feeds') {
        setError(caughtError instanceof Error ? caughtError.message : '刷新 RSS 未读失败。')
      }
    } finally {
      rssBackgroundRefreshInFlightRef.current = false
      setIsRssBackgroundRefreshing(false)
    }
  }

  useEffect(() => {
    if (
      !session
      || !hasLoadedRssSubscriptions
      || rssSubscriptions.length === 0
    ) {
      return
    }

    let cancelInitialRefresh = () => {}

    if (!rssAutoRefreshAttemptedRef.current && adminView === 'feeds') {
      rssAutoRefreshAttemptedRef.current = true
      void refreshRssSubscriptionsInBackground()
    } else if (!rssAutoRefreshAttemptedRef.current) {
      cancelInitialRefresh = scheduleBackgroundTask(() => {
        rssAutoRefreshAttemptedRef.current = true
        void refreshRssSubscriptionsInBackground()
      }, RSS_INITIAL_REFRESH_DELAY_MS)
    }

    const currentDocument = typeof document === 'undefined' ? null : document
    const intervalId = window.setInterval(() => {
      void refreshRssSubscriptionsInBackground()
    }, RSS_AUTO_REFRESH_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (
        currentDocument?.visibilityState === 'visible'
        && Date.now() - rssLastRefreshAtRef.current > RSS_VISIBLE_REFRESH_STALE_MS
      ) {
        void refreshRssSubscriptionsInBackground()
      }
    }

    currentDocument?.addEventListener?.('visibilitychange', handleVisibilityChange)
    return () => {
      cancelInitialRefresh()
      window.clearInterval(intervalId)
      currentDocument?.removeEventListener?.('visibilitychange', handleVisibilityChange)
    }
  }, [adminView, hasLoadedRssSubscriptions, rssSubscriptions.length, selectedRssFeedUrl, session])

  const handleLogout = () => {
    sessionStore.logout()
    setSession(null)
    resetWorkspace()
    setError(null)
  }

  const resolveDocumentWithLocalDraft = async (savedPost: ParsedPost) => {
    const storedDraft = readLocalDraft(savedPost.path)
    if (!storedDraft || !hasRecoverableChanges(storedDraft.draftDocument, storedDraft.savedDocument)) {
      return { savedPost, draftPost: null as ParsedPost | null, successMessage: null as string | null }
    }

    const hasMatchingBaseline =
      storedDraft.savedDocument?.path === savedPost.path &&
      storedDraft.savedDocument?.sha === savedPost.sha

    if (!hasMatchingBaseline) {
      const shouldRestore = await requestAppConfirm({
        title: '恢复本地草稿',
        message: '检测到本地未保存草稿，但远端内容可能已更新。是否恢复本地草稿继续编辑？',
        confirmLabel: '恢复草稿',
        cancelLabel: '使用远端内容',
      })
      if (!shouldRestore) {
        return { savedPost, draftPost: null as ParsedPost | null, successMessage: null as string | null }
      }
    }

    return {
      savedPost,
      draftPost: storedDraft.draftDocument,
      successMessage: '已恢复本地草稿。',
    }
  }

  const handleNewPost = async () => {
    if (!(await confirmNavigation())) {
      return
    }

    setEditorNavigationStack([])
    openDocument(
      contentType === 'read-later'
        ? createNewReadLaterItem()
        : contentType === 'diary'
          ? createNewDiaryEntry()
          : contentType === 'knowledge'
            ? createNewKnowledgeItem()
          : createNewPost(),
    )
    setAdminView('editor')
  }

  const openIndexedPost = async (post: PostIndexItem, options?: OpenIndexedPostOptions) => {
    if (!session || (!options?.skipNavigationConfirm && !(await confirmNavigation()))) {
      return false
    }

    const returnEntry =
      options?.navigationBehavior === 'push' && activeDocumentPost && activeDocumentPost.path !== post.path
        ? { post: activeDocumentPost, mode }
        : null
    const targetContentType = getContentTypeFromPostLike(post)
    const parseOpenedFile = (file: { path: string; sha: string; content: string }) =>
      targetContentType === 'read-later' ? parseReadLaterItem(file) : parsePost(file)

    setContentType(targetContentType)
    setAdminView('editor')
    setSuccessMessage(null)
    setError(null)

    const cachedFile = readCachedMarkdownFile(post.path, post.sha)
    if (cachedFile) {
      setIsOpeningPost(false)
      const resolvedDocument = await resolveDocumentWithLocalDraft(parseOpenedFile(cachedFile))
      openDocument(resolvedDocument.savedPost, {
        draftPost: resolvedDocument.draftPost,
        successMessage: resolvedDocument.successMessage,
        mode: options?.restoreMode,
      })
      if (options?.navigationBehavior === 'reset') {
        setEditorNavigationStack([])
      } else if (returnEntry) {
        appendEditorNavigationEntry(returnEntry)
      }
      return true
    }

    setIsOpeningPost(true)
    setActivePostPath(post.path)
    replaceDocument(null)

    try {
      const file = await fetchMarkdownFile(session, post.path)
      const resolvedDocument = await resolveDocumentWithLocalDraft(parseOpenedFile(file))
      openDocument(resolvedDocument.savedPost, {
        draftPost: resolvedDocument.draftPost,
        successMessage: resolvedDocument.successMessage,
        mode: options?.restoreMode,
      })
      if (options?.navigationBehavior === 'reset') {
        setEditorNavigationStack([])
      } else if (returnEntry) {
        appendEditorNavigationEntry(returnEntry)
      }
      return true
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return false
      }

      setError(caughtError instanceof Error ? caughtError.message : `打开${getContentTypeLabel(targetContentType)}失败。`)
      return false
    } finally {
      setIsOpeningPost(false)
    }
  }

  const handleOpenPost = async (post: PostIndexItem) => {
    await openIndexedPost(post, { navigationBehavior: 'reset' })
  }

  const handleOpenTopicNode = (targetKey: string) => {
    const topicPost = topicNodesByKey.get(targetKey)
    if (!topicPost) {
      setSuccessMessage(null)
      setError(`未找到主题节点 ${targetKey}。`)
      return
    }

    void openIndexedPost(topicPost, { navigationBehavior: 'push' })
  }

  const handleOpenInternalReference = (targetKey: string) => {
    const targetPost = internalReferenceLookup.get(targetKey)
    if (!targetPost) {
      setSuccessMessage(null)
      setError(`未找到内部引用 ${targetKey}。`)
      return
    }

    void openIndexedPost(targetPost, { navigationBehavior: 'push' })
  }

  const returnToDashboard = () => {
    resetPreviewImageUrls()
    setActivePostPath(null)
    setEditorNavigationStack([])
    replaceDocument(null)
    setIsImmersive(false)
    setSuccessMessage(null)
    setError(null)
    setAdminView('dashboard')
  }

  const handleBackToDashboard = async () => {
    if (!(await confirmNavigation())) {
      return
    }

    returnToDashboard()
  }

  const handleBackNavigation = async () => {
    const previousEntry = editorNavigationStack[editorNavigationStack.length - 1]
    if (!previousEntry) {
      await handleBackToDashboard()
      return
    }

    if (!(await confirmNavigation())) {
      return
    }

    const didOpen = await openIndexedPost(previousEntry.post, {
      skipNavigationConfirm: true,
      restoreMode: previousEntry.mode,
      navigationBehavior: 'preserve',
    })

    if (!didOpen) {
      returnToDashboard()
      setError('未能返回上一篇内容，已退回列表。')
      return
    }

    setEditorNavigationStack((currentStack) => currentStack.slice(0, -1))
  }

  const handleOpenAnnotations = () => {
    setSuccessMessage(null)
    setError(null)
    setAdminView('annotations')
  }

  const handleOpenTrash = () => {
    setSuccessMessage(null)
    setError(null)
    setAdminView('trash')
  }

  const handleOpenFeeds = () => {
    setSearch('')
    setSuccessMessage(null)
    setError(null)
    rssAutoRefreshAttemptedRef.current = false
    setAdminView('feeds')
  }

  const handleOpenSeries = () => {
    setSuccessMessage(null)
    setError(null)
    setAdminView('series')
  }

  const handleBackFromSeries = () => {
    setAdminView('dashboard')
  }

  const findExistingFeedSubscription = (url: string) =>
    rssSubscriptions.find((subscription) => normalizeUrlForComparison(subscription.url) === normalizeUrlForComparison(url)) || null

  const persistFeedSubscriptions = async (
    nextSubscriptions: FeedSubscription[],
    successMessageText: string,
    nextFolders = rssSubscriptionsState.folders || [],
  ) => {
    if (!session) {
      return null
    }

    const savedState = await saveFeedSubscriptions(session, {
      ...rssSubscriptionsState,
      folders: nextFolders,
      subscriptions: nextSubscriptions,
    })

    setRssSubscriptionsState(savedState)
    setHasLoadedRssSubscriptions(true)
    setSuccessMessage(successMessageText)
    return savedState
  }

  const handleCreateFeedFolder = async (name: string) => {
    if (!session || isSavingRssSubscription) {
      return
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('请先填写 folder 名称。')
      return
    }

    const currentFolders = rssSubscriptionsState.folders || []
    if (currentFolders.some((folder) => folder.name === trimmedName)) {
      setError(`Folder「${trimmedName}」已存在。`)
      return
    }

    setIsSavingRssSubscription(true)
    setError(null)
    setSuccessMessage(null)

    try {
      await persistFeedSubscriptions(
        rssSubscriptions,
        `已创建 folder「${trimmedName}」。`,
        [...currentFolders, createFeedFolderRecord(trimmedName)],
      )
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '创建 folder 失败。')
    } finally {
      setIsSavingRssSubscription(false)
    }
  }

  const handleRenameFeedFolder = async (folder: FeedFolder, nextName: string) => {
    if (!session || isSavingRssSubscription) {
      return
    }

    const trimmedName = nextName.trim()
    if (!trimmedName || trimmedName === folder.name) {
      return
    }

    setIsSavingRssSubscription(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const timestamp = new Date().toISOString()
      const currentFolders = rssSubscriptionsState.folders || []
      const existingFolder = currentFolders.find(
        (item) => item.id !== folder.id && item.name === trimmedName,
      )
      const nextFolders = existingFolder
        ? currentFolders.filter((item) => item.id !== folder.id)
        : currentFolders.map((item) =>
            item.id === folder.id
              ? {
                  ...item,
                  name: trimmedName,
                  updatedAt: timestamp,
                }
              : item,
          )
      const nextSubscriptions = rssSubscriptions.map((subscription) =>
        subscription.category === folder.name
          ? {
              ...subscription,
              category: trimmedName,
              updatedAt: timestamp,
            }
          : subscription,
      )

      await persistFeedSubscriptions(
        nextSubscriptions,
        `已重命名 folder「${folder.name}」为「${trimmedName}」。`,
        nextFolders,
      )
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '重命名 folder 失败。')
    } finally {
      setIsSavingRssSubscription(false)
    }
  }

  const handleDeleteFeedFolder = async (folder: FeedFolder) => {
    if (!session || isSavingRssSubscription) {
      return
    }

    const affectedFeedCount = rssSubscriptions.filter(
      (subscription) => subscription.category.trim() === folder.name,
    ).length
    const shouldDelete = await requestAppConfirm({
      title: '删除 Feed Folder',
      message: affectedFeedCount > 0
        ? `确定删除 folder「${folder.name}」吗？其中 ${affectedFeedCount} 个 feed 会移入 Uncategorized。`
        : `确定删除 folder「${folder.name}」吗？`,
      confirmLabel: '确认删除',
      cancelLabel: '取消',
      isDangerous: true,
    })
    if (!shouldDelete) {
      return
    }

    setIsSavingRssSubscription(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const timestamp = new Date().toISOString()
      const nextFolders = (rssSubscriptionsState.folders || []).filter((item) => item.id !== folder.id)
      const nextSubscriptions = rssSubscriptions.map((subscription) =>
        subscription.category.trim() === folder.name
          ? {
              ...subscription,
              category: '',
              updatedAt: timestamp,
            }
          : subscription,
      )

      await persistFeedSubscriptions(
        nextSubscriptions,
        affectedFeedCount > 0
          ? `已删除 folder「${folder.name}」，${affectedFeedCount} 个 feed 已移入 Uncategorized。`
          : `已删除 folder「${folder.name}」。`,
        nextFolders,
      )
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '删除 folder 失败。')
    } finally {
      setIsSavingRssSubscription(false)
    }
  }

  const handleMoveFeedSubscriptionToFolder = async (subscription: FeedSubscription, folderName: string) => {
    if (!session || isSavingRssSubscription) {
      return
    }

    const trimmedFolderName = folderName.trim()
    if (subscription.category.trim() === trimmedFolderName) {
      return
    }

    setIsSavingRssSubscription(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const timestamp = new Date().toISOString()
      const nextSubscriptions = rssSubscriptions.map((item) =>
        item.id === subscription.id
          ? {
              ...item,
              category: trimmedFolderName,
              updatedAt: timestamp,
            }
          : item,
      )

      await persistFeedSubscriptions(
        nextSubscriptions,
        trimmedFolderName
          ? `已将《${subscription.title || subscription.url}》移动到 folder「${trimmedFolderName}」。`
          : `已将《${subscription.title || subscription.url}》移出 folder。`,
      )
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '移动 feed 失败。')
    } finally {
      setIsSavingRssSubscription(false)
    }
  }

  const incrementFeedReadLaterCount = async (feedUrl: string) => {
    if (!session) {
      return null
    }

    const timestamp = new Date().toISOString()
    const nextSubscriptions = rssSubscriptions.map((subscription) =>
      subscription.url === feedUrl
        ? {
            ...subscription,
            readLaterCount: Math.max(0, subscription.readLaterCount) + 1,
            updatedAt: timestamp,
          }
        : subscription,
    )

    const savedState = await saveFeedSubscriptions(session, {
      ...rssSubscriptionsState,
      subscriptions: nextSubscriptions,
    })
    setRssSubscriptionsState(savedState)
    setHasLoadedRssSubscriptions(true)
    return savedState
  }

  const handlePreviewSubscriptionFeed = async (subscription: FeedSubscription) => {
    if (!session || quickReadLaterDirectoryPendingFeedUrl) {
      return
    }

    const requestId = rssPreviewRequestIdRef.current + 1
    rssPreviewRequestIdRef.current = requestId
    const cachedFeedItems = rssFeedItemsByUrl[subscription.url] || []
    setSelectedRssFeedUrl(subscription.url)
    setIsRssPreviewLoading(true)
    if (cachedFeedItems.length > 0) {
      setRssPreviewFeed(createCachedImportedFeed(subscription, cachedFeedItems))
    }
    setError(null)
    setSuccessMessage(null)

    try {
      const importedFeed = await importFeedFromUrl(session, subscription.url)
      const timestamp = new Date().toISOString()
      const updatedSubscription = applyFeedRefreshSuccessToSubscription(subscription, importedFeed, timestamp)

      if (requestId !== rssPreviewRequestIdRef.current) {
        return
      }

      setRssPreviewFeed(importedFeed)
      setRssFeedItemsByUrl((currentItemsByUrl) => ({
        ...currentItemsByUrl,
        [subscription.url]: importedFeed.items,
      }))
      if (updatedSubscription) {
        const savedState = await saveRssSubscriptionsPatch((state) => {
          let changed = false
          const nextSubscriptions = state.subscriptions.map((item) => {
            if (item.url !== subscription.url) {
              return item
            }

            const nextSubscription = applyFeedRefreshSuccessToSubscription(item, importedFeed, timestamp)
            if (!nextSubscription) {
              return item
            }

            changed = true
            return nextSubscription
          })

          return changed ? { ...state, subscriptions: nextSubscriptions } : state
        })
        if (requestId !== rssPreviewRequestIdRef.current) {
          return
        }
        if (savedState) {
          setRssSubscriptionsState(savedState)
          setHasLoadedRssSubscriptions(true)
        }
      }
      setSuccessMessage(`已加载《${importedFeed.title || subscription.title || '未命名 RSS'}》最近 ${importedFeed.items.length} 条内容。`)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '加载 RSS 条目失败。')
    } finally {
      if (requestId === rssPreviewRequestIdRef.current) {
        setIsRssPreviewLoading(false)
      }
    }
  }

  const handlePreviewFeedItemArticle = useCallback(async (item: ImportedFeedItem | null) => {
    if (!session || !item?.url) {
      return
    }

    const articleUrl = item.url
    if (rssPreviewArticlesByUrl[articleUrl] || rssPreviewArticleLoadingByUrl[articleUrl]) {
      return
    }

    setRssPreviewArticleLoadingByUrl((currentState) => ({
      ...currentState,
      [articleUrl]: true,
    }))
    setRssPreviewArticleErrorsByUrl((currentState) => {
      if (!currentState[articleUrl]) {
        return currentState
      }

      const nextState = { ...currentState }
      delete nextState[articleUrl]
      return nextState
    })

    try {
      const importedArticle = await importReadLaterFromUrl(session, articleUrl, { includeImages: true })
      setRssPreviewArticlesByUrl((currentState) => ({
        ...currentState,
        [articleUrl]: importedArticle,
      }))
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setRssPreviewArticleErrorsByUrl((currentState) => ({
        ...currentState,
        [articleUrl]: caughtError instanceof Error ? caughtError.message : '正文抓取失败。',
      }))
    } finally {
      setRssPreviewArticleLoadingByUrl((currentState) => {
        if (!currentState[articleUrl]) {
          return currentState
        }

        const nextState = { ...currentState }
        delete nextState[articleUrl]
        return nextState
      })
    }
  }, [handleAuthExpiry, rssPreviewArticleLoadingByUrl, rssPreviewArticlesByUrl, session])

  const handleAddManualFeedSubscription = async () => {
    if (!session || isSavingRssSubscription) {
      return
    }

    const feedUrl = manualFeedUrl.trim()
    if (!feedUrl) {
      setError('请先填写 feed URL。')
      return
    }

    if (!/^https?:\/\//i.test(feedUrl)) {
      setError('Feed URL 需以 http:// 或 https:// 开头。')
      return
    }

    const duplicatedSubscription = findExistingFeedSubscription(feedUrl)
    if (duplicatedSubscription) {
      setSelectedRssFeedUrl(duplicatedSubscription.url)
      void handlePreviewSubscriptionFeed(duplicatedSubscription)
      return
    }

    setIsSavingRssSubscription(true)
    setIsRssPreviewLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const importedFeed = await importFeedFromUrl(session, feedUrl)
      const nextSubscription = createFeedSubscriptionRecord({
        title: importedFeed.title,
        url: importedFeed.finalUrl || importedFeed.requestedUrl || feedUrl,
        description: importedFeed.description,
        sourceType: 'manual',
        articleCount: importedFeed.items.length,
      })
      const timestamp = new Date().toISOString()
      const baselinedSubscription = applyFeedRefreshSuccessToSubscription(nextSubscription, importedFeed, timestamp) || nextSubscription
      await persistFeedSubscriptions(
        [...rssSubscriptions, baselinedSubscription],
        `已订阅《${baselinedSubscription.title}》。`,
      )

      setManualFeedUrl('')
      setSelectedRssFeedUrl(baselinedSubscription.url)
      setRssPreviewFeed(importedFeed)
      setRssFeedItemsByUrl((currentItemsByUrl) => ({
        ...currentItemsByUrl,
        [baselinedSubscription.url]: importedFeed.items,
      }))
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '新增 feed 失败。')
    } finally {
      setIsSavingRssSubscription(false)
      setIsRssPreviewLoading(false)
    }
  }

  const handleOpenDirectoryFeed = async (feed: SharedFeedSource) => {
    if (!session || isSavingRssSubscription || quickReadLaterDirectoryPendingFeedUrl) {
      return
    }

    const existingSubscription = findExistingFeedSubscription(feed.url)
    if (existingSubscription) {
      void handlePreviewSubscriptionFeed(existingSubscription)
      return
    }

    setQuickReadLaterDirectoryPendingFeedUrl(feed.url)
    setIsSavingRssSubscription(true)
    setIsRssPreviewLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const importedFeed = await importFeedFromUrl(session, feed.url)
      const nextSubscription = createFeedSubscriptionRecord({
        title: importedFeed.title || feed.title,
        url: importedFeed.finalUrl || importedFeed.requestedUrl || feed.url,
        description: importedFeed.description || feed.intro,
        category: feed.category,
        sourceType: 'shared',
        articleCount: importedFeed.items.length || feed.articleCount,
      })
      const timestamp = new Date().toISOString()
      const baselinedSubscription = applyFeedRefreshSuccessToSubscription(nextSubscription, importedFeed, timestamp) || nextSubscription
      await persistFeedSubscriptions(
        [...rssSubscriptions, baselinedSubscription],
        `已订阅《${baselinedSubscription.title}》。`,
      )

      setSelectedRssFeedUrl(baselinedSubscription.url)
      setRssPreviewFeed(importedFeed)
      setRssFeedItemsByUrl((currentItemsByUrl) => ({
        ...currentItemsByUrl,
        [baselinedSubscription.url]: importedFeed.items,
      }))
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '订阅共享 feed 失败。')
    } finally {
      setQuickReadLaterDirectoryPendingFeedUrl(null)
      setIsSavingRssSubscription(false)
      setIsRssPreviewLoading(false)
    }
  }

  const handleRemoveFeedSubscription = async (subscription: FeedSubscription) => {
    if (!session || isSavingRssSubscription) {
      return
    }

    const shouldDelete = await requestAppConfirm({
      title: '删除 Feed',
      message: `确定删除 feed「${subscription.title || subscription.url}」吗？`,
      confirmLabel: '确认删除',
      cancelLabel: '取消',
      isDangerous: true,
    })
    if (!shouldDelete) {
      return
    }

    setIsSavingRssSubscription(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const nextSubscriptions = rssSubscriptions.filter((item) => item.url !== subscription.url)
      await persistFeedSubscriptions(
        nextSubscriptions,
        `已删除 feed「${subscription.title || subscription.url}」。`,
      )

      if (selectedRssFeedUrl === subscription.url) {
        setSelectedRssFeedUrl(null)
        setRssPreviewFeed(null)
      }
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '删除 feed 失败。')
    } finally {
      setIsSavingRssSubscription(false)
    }
  }

  const handleDeletePost = async (post: PostIndexItem) => {
    if (isDeletingPost || isTogglingPinned) {
      return
    }

    if (document?.path === post.path && !canNavigateAway) {
      const shouldContinue = await requestAppConfirm({
        title: '删除未保存稿件',
        message: '当前文章有未保存的修改。删除后会进入回收站，确认继续吗？',
        confirmLabel: '继续删除',
        cancelLabel: '取消',
        isDangerous: true,
      })
      if (!shouldContinue) {
        return
      }
    }

    setPostDeleteConfirm({ kind: 'delete-post', post })
  }

  const handleDeletePostConfirm = async () => {
    if (!session || !postDeleteConfirm || isDeletingPost) {
      return
    }

    const { post } = postDeleteConfirm
    setIsDeletingPost(true)
    setDeletingPostPath(post.path)
    setError(null)
    setSuccessMessage(null)

    try {
      const file = readCachedMarkdownFile(post.path, post.sha) ?? await fetchMarkdownFile(session, post.path)
      await moveMarkdownFileToTrash(session, {
        path: post.path,
        sha: post.sha,
        title: post.title,
        contentType: getContentTypeFromPostLike(post),
        content: file.content,
      })
      removeLocalDraft(post.path)
      setEditorNavigationStack((currentStack) => currentStack.filter((entry) => entry.post.path !== post.path))

      const deletedContentType = getContentTypeFromPostLike(post)
      updatePostsForType(deletedContentType, (currentPosts) =>
        currentPosts.filter((currentPost) => currentPost.path !== post.path),
      )

      if (activePostPath === post.path) {
        resetPreviewImageUrls()
        setActivePostPath(null)
        setEditorNavigationStack([])
        replaceDocument(null)
        setIsOpeningPost(false)
        setIsImmersive(false)
        setAdminView('dashboard')
      }
      setSuccessMessage(`已删除《${post.title}》，可在回收站恢复。`)
      setPostDeleteConfirm(null)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      if (caughtError instanceof GitHubConflictError) {
        setError(caughtError.message)
        return
      }
      setError(caughtError instanceof Error ? caughtError.message : `删除${getContentTypeLabel(getContentTypeFromPostLike(post))}失败。`)
    } finally {
      setIsDeletingPost(false)
      setDeletingPostPath(null)
    }
  }

  const handleDeletePostCancel = () => {
    if (!isDeletingPost) {
      setPostDeleteConfirm(null)
    }
  }

  const handleRestoreTrashEntry = (entry: TrashEntry) => {
    if (!isProcessingTrash) {
      setTrashConfirm({ kind: 'restore-trash', entry })
    }
  }

  const handleDeleteTrashEntry = (entry: TrashEntry) => {
    if (!isProcessingTrash) {
      setTrashConfirm({ kind: 'delete-trash', entry })
    }
  }

  const handleTrashConfirm = async () => {
    if (!session || !trashConfirm || isProcessingTrash) {
      return
    }

    const { entry } = trashConfirm
    setIsProcessingTrash(true)
    setProcessingTrashPath(entry.trashPath)
    setError(null)
    setSuccessMessage(null)

    try {
      if (trashConfirm.kind === 'restore-trash') {
        const restoredFile = await restoreTrashEntry(session, entry)
        const restoredIndexItem = buildIndexItemFromSavedFile(entry.contentType, restoredFile)
        updatePostsForType(entry.contentType, (currentPosts) => replacePostIndexItem(currentPosts, restoredIndexItem))
        setSuccessMessage(`已恢复《${entry.originalTitle}》。`)
      } else {
        await permanentlyDeleteTrashEntry(session, entry)
        setSuccessMessage(`已彻底删除《${entry.originalTitle}》。`)
      }

      setTrashEntries((currentEntries) => currentEntries.filter((currentEntry) => currentEntry.trashPath !== entry.trashPath))
      setTrashConfirm(null)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }
      setError(caughtError instanceof Error ? caughtError.message : '处理回收站内容失败。')
    } finally {
      setIsProcessingTrash(false)
      setProcessingTrashPath(null)
    }
  }

  const handleTrashConfirmCancel = () => {
    if (!isProcessingTrash) {
      setTrashConfirm(null)
    }
  }

  const handleTogglePinned = async (post: PostIndexItem) => {
    const targetContentType = getContentTypeFromPostLike(post)

    if (!session || isTogglingPinned) {
      return
    }

    if (document?.path === post.path && !canNavigateAway) {
      setSuccessMessage(null)
      setError(`当前${getContentTypeLabel(targetContentType)}有未保存的修改，请先保存后再置顶。`)
      return
    }

    setIsTogglingPinned(true)
    setTogglingPinnedPostPath(post.path)
    setError(null)
    setSuccessMessage(null)

    try {
      const file = readCachedMarkdownFile(post.path, post.sha) ?? await fetchMarkdownFile(session, post.path)
      const openedPost = targetContentType === 'read-later' ? parseReadLaterItem(file) : parsePost(file)
      const updatedDocument = {
        ...openedPost,
        frontmatter: {
          ...openedPost.frontmatter,
          pinned: !openedPost.frontmatter.pinned,
        },
      }
      const savedContent = targetContentType === 'read-later'
        ? serializeReadLaterItem(updatedDocument as ParsedReadLaterItem)
        : serializePost(updatedDocument)
      const savedFile = await saveMarkdownFile(session, {
        path: updatedDocument.path,
        sha: updatedDocument.sha || undefined,
        content: savedContent,
      })
      const savedDocument: ParsedPost = {
        ...updatedDocument,
        path: savedFile.path,
        sha: savedFile.sha,
      }
      const savedPostIndexItem = targetContentType === 'read-later'
        ? parseReadLaterIndexItem({
            path: savedFile.path,
            sha: savedFile.sha,
            content: savedContent,
          })
        : parsePostIndexItem({
            path: savedFile.path,
            sha: savedFile.sha,
            content: savedContent,
          })
      const syncResult = isTopicDocument(savedDocument)
        ? await syncTopicDocumentsAfterSave({
            currentPostsByType: postsByType,
            previousDocument: openedPost.contentType === 'read-later' ? null : (openedPost as ParsedPost),
            savedContent,
            savedDocument,
            savedPostIndexItem,
          })
        : {
            postsByType: buildNextPostsByType(postsByType, targetContentType, savedPostIndexItem, post.path),
            savedDocument,
            savedPostIndexItem,
          }

      setPostsByType(syncResult.postsByType)

      if (document?.path === post.path && canNavigateAway) {
        markSaved(syncResult.savedDocument)
        setActivePostPath(syncResult.savedDocument.path)
      }

      setSuccessMessage(syncResult.savedDocument.frontmatter.pinned ? `已置顶《${post.title}》。` : `已取消《${post.title}》的置顶。`)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      if (caughtError instanceof GitHubConflictError) {
        setError(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : `更新${getContentTypeLabel(targetContentType)}置顶状态失败。`)
    } finally {
      setIsTogglingPinned(false)
      setTogglingPinnedPostPath(null)
    }
  }

  const handleSave = async () => {
    if (!document || !session || isSaving) {
      return
    }

    const pendingFeedUrl =
      document.contentType === 'read-later' && pendingFeedDraftContext?.draftPath === document.path
        ? pendingFeedDraftContext.feedUrl
        : ''
    const shouldIncrementFeedReadLaterCount = document.contentType === 'read-later' && document.sha.length === 0 && Boolean(pendingFeedUrl)
    const nextErrors = validate({ isNewPost: document.sha.length === 0 })
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setIsSaving(true)
    setSuccessMessage(null)
    setError(null)

    try {
      const saveResult = await saveDocumentToRepo(document)
      const syncResult = await syncTopicDocumentsAfterSave({
        currentPostsByType: postsByType,
        previousDocument: savedDocument,
        savedContent: saveResult.savedContent,
        savedDocument: saveResult.savedDocument,
        savedPostIndexItem: saveResult.savedPostIndexItem,
      })
      if (shouldIncrementFeedReadLaterCount && pendingFeedUrl) {
        await incrementFeedReadLaterCount(pendingFeedUrl)
        setPendingFeedDraftContext(null)
      }
      markSaved(syncResult.savedDocument)
      removeLocalDraft(syncResult.savedDocument.path)
      setActivePostPath(syncResult.savedDocument.path)
      setPostsByType(syncResult.postsByType)
      setSuccessMessage(SAVE_SUCCESS_MESSAGE)
      setLastSavedAt(new Date())
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      if (caughtError instanceof GitHubConflictError) {
        setError(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : `保存${getContentTypeLabel(getContentTypeFromPostLike(document))}失败。`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleTogglePreview = () => {
    if (!document || document.contentType === 'read-later') {
      return
    }

    setMode(mode === 'preview' ? 'markdown' : 'preview')
  }

  const handleCopyCurrentPath = async () => {
    if (!document?.path) {
      return
    }

    try {
      await navigator.clipboard.writeText(document.path)
      setError(null)
      setSuccessMessage('文件路径已复制。')
    } catch {
      setSuccessMessage(null)
      setError(`文件路径：${document.path}`)
    }
  }

  const handleExportCurrent = () => {
    if (!document) {
      return
    }

    const content = document.contentType === 'read-later'
      ? serializeReadLaterItem(document as ParsedReadLaterItem)
      : serializePost(document)
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = objectUrl
    anchor.download = document.path.split('/').pop() || 'article.md'
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }

  const handleDuplicateCurrent = () => {
    if (!document || document.contentType === 'read-later') {
      return
    }

    const targetContentType = getContentTypeFromPostLike(document)
    const baseDocument = targetContentType === 'diary'
      ? createNewDiaryEntry()
      : targetContentType === 'knowledge'
        ? createNewKnowledgeItem()
        : createNewPost()
    const duplicatedDocument: ParsedPost = {
      ...baseDocument,
      body: document.body,
      frontmatter: {
        ...document.frontmatter,
        title: `${document.frontmatter.title.trim() || '未命名稿件'} 副本`,
        date: baseDocument.frontmatter.date,
        published: false,
        pinned: false,
        permalink: undefined,
      },
      hasExplicitPublished: true,
      hasExplicitPermalink: false,
      contentType: targetContentType,
    }

    replaceDocument(baseDocument, duplicatedDocument)
    setActivePostPath(duplicatedDocument.path)
    setMode('markdown')
    setLastSavedAt(null)
    setIsPostListDrawerOpen(false)
    setIsSettingsDrawerOpen(false)
    setError(null)
    setSuccessMessage('已创建文章副本草稿。')
  }

  const clearSuccessMessageOnDirty = () => {
    if (successMessage) {
      setSuccessMessage(null)
    }
  }

  const handleFrontmatterChange: typeof updateFrontmatter = (...args) => {
    clearSuccessMessageOnDirty()
    return updateFrontmatter(...args)
  }

  const handleEditorChange = (value: string) => {
    clearSuccessMessageOnDirty()
    updateBody(value)
  }

  const handleReadLaterTabChange = (value: ReadLaterTab) => {
    setReadLaterTab(value)
    if (value !== 'commentary') {
      setEditingAnnotationId(null)
    }
  }

  const handleSelectAnnotation = (annotationId: string) => {
    setReadLaterTab('commentary')
    setActiveAnnotationId(annotationId)
    setEditingAnnotationId(null)
    setAnnotationScrollRequest((current) => current + 1)
  }

  const handleOpenReadLaterAnnotation = async (annotation: ReadLaterAnnotationIndexItem) => {
    if (!session || !(await confirmNavigation())) {
      return
    }

    const openAnnotationDocument = async (file: { path: string; sha: string; content: string }) => {
      const resolvedDocument = await resolveDocumentWithLocalDraft(parseReadLaterItem(file))
      openDocument(resolvedDocument.savedPost, {
        draftPost: resolvedDocument.draftPost,
        successMessage: resolvedDocument.successMessage,
      })
      setEditorNavigationStack([])
      setReadLaterTab('commentary')
      setActiveAnnotationId(annotation.annotationId)
      setEditingAnnotationId(null)
      setAnnotationScrollRequest((current) => current + 1)
    }

    setContentType('read-later')
    setAdminView('editor')
    setSuccessMessage(null)
    setError(null)

    const sourcePost = readLaterPosts.find((post) => post.path === annotation.postPath)
    const cachedFile = readCachedMarkdownFile(annotation.postPath, sourcePost?.sha)
    if (cachedFile) {
      setIsOpeningPost(false)
      await openAnnotationDocument(cachedFile)
      return
    }

    setIsOpeningPost(true)
    setActivePostPath(annotation.postPath)
    replaceDocument(null)

    try {
      const file = await fetchMarkdownFile(session, annotation.postPath)
      await openAnnotationDocument(file)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '打开批注原文失败。')
    } finally {
      setIsOpeningPost(false)
    }
  }

  const handleClearActiveAnnotation = () => {
    setActiveAnnotationId(null)
    setEditingAnnotationId(null)
  }

  const handleNavigateOutline = useCallback((targetId: string) => {
    setActiveOutlineTargetId(targetId)
    setReaderNavigationRequest((current) => ({
      targetId,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [])

  useEffect(() => {
    if (document?.contentType === 'read-later' && mode === 'preview') {
      return
    }

    setActiveOutlineTargetId(null)
  }, [document?.contentType, document?.path, mode])

  const handleOpenAnnotationNote = (annotationId: string) => {
    setReadLaterTab('commentary')
    setActiveAnnotationId(annotationId)
    setEditingAnnotationId(annotationId)
    setAnnotationScrollRequest((current) => current + 1)
  }

  const handleDeleteAnnotation = (annotationId: string) => {
    clearSuccessMessageOnDirty()
    updateReadLaterAnnotations(readLaterAnnotations.filter((annotation) => annotation.id !== annotationId))
    setActiveAnnotationId(null)
    setEditingAnnotationId(null)
  }

  const handleSaveAnnotationNote = (annotationId: string, note: string) => {
    const nextAnnotations = readLaterAnnotations.map((annotation) =>
      annotation.id === annotationId
        ? {
            ...annotation,
            note,
            updatedAt: new Date().toISOString(),
          }
        : annotation,
    )

    clearSuccessMessageOnDirty()
    updateReadLaterAnnotations(nextAnnotations)
    setActiveAnnotationId(annotationId)
    setEditingAnnotationId(null)
  }

  const saveDocumentToRepo = async (targetDocument: ParsedPost) => {
    if (!session) {
      throw new Error('GitHub 会话已过期，请重新登录。')
    }

    const targetContentType = getContentTypeFromPostLike(targetDocument)
    const content = targetContentType === 'read-later' ? serializeReadLaterItem(targetDocument as ParsedReadLaterItem) : serializePost(targetDocument)
    const savedFile = await saveMarkdownFile(session, {
      path: targetDocument.path,
      sha: targetDocument.sha || undefined,
      content,
    })
    const savedDocument: ParsedPost = {
      ...targetDocument,
      path: savedFile.path,
      sha: savedFile.sha,
    }
    const savedPostIndexItem = targetContentType === 'read-later'
      ? parseReadLaterIndexItem({
          path: savedFile.path,
          sha: savedFile.sha,
          content,
        })
      : parsePostIndexItem({
          path: savedFile.path,
          sha: savedFile.sha,
          content,
        })

    return {
      targetContentType,
      savedContent: content,
      savedDocument,
      savedPostIndexItem,
    }
  }

  const syncTopicDocumentsAfterSave = async ({
    currentPostsByType,
    previousDocument,
    savedContent,
    savedDocument,
    savedPostIndexItem,
  }: {
    currentPostsByType: IndexedPostsByType
    previousDocument: ParsedPost | null
    savedContent: string
    savedDocument: ParsedPost
    savedPostIndexItem: PostIndexItem
  }) => {
    if (!session) {
      throw new Error('GitHub 会话已过期，请重新登录。')
    }

    const targetContentType = getContentTypeFromPostLike(savedDocument)
    let nextPostsByType = buildNextPostsByType(currentPostsByType, targetContentType, savedPostIndexItem, previousDocument?.path)
    let nextSavedDocument = savedDocument
    let nextSavedPostIndexItem = savedPostIndexItem
    let nextSavedContent = savedContent

    if (targetContentType === 'read-later') {
      return {
        postsByType: nextPostsByType,
        savedDocument: nextSavedDocument,
        savedPostIndexItem: nextSavedPostIndexItem,
      }
    }

    const topicNodesByKey = buildTopicNodeMap([...nextPostsByType.post, ...nextPostsByType.knowledge])
    const topicPosts = [...nextPostsByType.post, ...nextPostsByType.knowledge].filter((post) => isTopicNodePost(post))
    const shouldSyncAllTopicPosts = isTopicDocument(previousDocument) || isTopicDocument(savedDocument)
    const affectedTopicKeys = shouldSyncAllTopicPosts
      ? []
      : Array.from(
          new Set([
            ...collectResolvedWikiLinkTargetKeys(previousDocument?.body || '', topicNodesByKey),
            ...collectResolvedWikiLinkTargetKeys(savedDocument.body, topicNodesByKey),
          ]),
        )
    const topicPostsToSync = shouldSyncAllTopicPosts
      ? topicPosts
      : Array.from(
          new Map(
            affectedTopicKeys
              .map((targetKey) => topicNodesByKey.get(targetKey))
              .filter((post): post is PostIndexItem => Boolean(post && isTopicNodePost(post)))
              .map((post) => [post.path, post]),
          ).values(),
        )

    if (topicPostsToSync.length === 0) {
      return {
        postsByType: nextPostsByType,
        savedDocument: nextSavedDocument,
        savedPostIndexItem: nextSavedPostIndexItem,
      }
    }

    const topicBacklinksByKey = buildTopicBacklinkMap([...nextPostsByType.post, ...nextPostsByType.diary, ...nextPostsByType.knowledge])

    for (const topicPost of topicPostsToSync) {
      const currentTopicFile = topicPost.path === nextSavedDocument.path
        ? {
            path: nextSavedDocument.path,
            sha: nextSavedDocument.sha,
            content: nextSavedContent,
          }
        : readCachedMarkdownFile(topicPost.path, topicPost.sha) ?? await fetchMarkdownFile(session, topicPost.path)

      const parsedTopicDocument = parsePost(currentTopicFile)
      const topicNodeKey = parsedTopicDocument.frontmatter.node_key?.trim() || topicPost.nodeKey?.trim() || ''
      if (!topicNodeKey) {
        continue
      }

      const nextTopicDocument = {
        ...parsedTopicDocument,
        body: appendTopicBacklinksToMarkdown(
          parsedTopicDocument.body,
          (topicBacklinksByKey.get(topicNodeKey) || []).filter((backlink) => backlink.sourcePath !== topicPost.path),
        ),
      }
      const nextTopicContent = serializePost(nextTopicDocument)

      if (nextTopicContent === currentTopicFile.content) {
        continue
      }

      const savedTopicFile = await saveMarkdownFile(session, {
        path: topicPost.path,
        sha: currentTopicFile.sha || undefined,
        content: nextTopicContent,
      })
      const nextTopicSavedDocument = parsePost({
        path: savedTopicFile.path,
        sha: savedTopicFile.sha,
        content: nextTopicContent,
      })
      const nextTopicSavedPostIndexItem = parsePostIndexItem({
        path: savedTopicFile.path,
        sha: savedTopicFile.sha,
        content: nextTopicContent,
      })

      nextPostsByType = buildNextPostsByType(
        nextPostsByType,
        getContentTypeFromPostLike(nextTopicSavedDocument),
        nextTopicSavedPostIndexItem,
        topicPost.path,
      )

      if (topicPost.path === nextSavedDocument.path) {
        nextSavedDocument = nextTopicSavedDocument
        nextSavedPostIndexItem = nextTopicSavedPostIndexItem
        nextSavedContent = nextTopicContent
      }
    }

    return {
      postsByType: nextPostsByType,
      savedDocument: nextSavedDocument,
      savedPostIndexItem: nextSavedPostIndexItem,
    }
  }

  const handleCreateReadLaterAnnotation = (
    draft: ReadLaterAnnotationDraft,
    action: ReadLaterAnnotationAction,
  ) => {
    if (!document || document.contentType !== 'read-later') {
      return
    }

    const timestamp = new Date().toISOString()
    const annotation: ReadLaterAnnotation = {
      id: createReadLaterAnnotationId(),
      quote: draft.quote,
      prefix: draft.prefix,
      suffix: draft.suffix,
      sectionKey: draft.sectionKey,
      note: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    clearSuccessMessageOnDirty()
    updateReadLaterAnnotations([...readLaterAnnotations, annotation])
    setReadLaterTab('commentary')
    setActiveAnnotationId(annotation.id)
    setEditingAnnotationId(action === 'note' ? annotation.id : null)
  }

  const handleCreateKnowledgeFromSelection = (quote: string) => {
    if (!document || !session) {
      return
    }

    const targetContentType = getContentTypeFromPostLike(document)
    if (targetContentType !== 'post' && targetContentType !== 'read-later' && targetContentType !== 'diary') {
      return
    }

    const normalizedQuote = quote.trim()
    if (!normalizedQuote) {
      return
    }

    void (async () => {
      setSuccessMessage(null)
      setError(null)

      try {
        const captureDate = new Date()
        const knowledgeDocument = createKnowledgeFromSelection(document, normalizedQuote, captureDate)
        const saveResult = await saveDocumentToRepo(knowledgeDocument)
        const syncResult = await syncTopicDocumentsAfterSave({
          currentPostsByType: postsByType,
          previousDocument: null,
          savedContent: saveResult.savedContent,
          savedDocument: saveResult.savedDocument,
          savedPostIndexItem: saveResult.savedPostIndexItem,
        })

        setPostsByType(syncResult.postsByType)
        setSuccessMessage(`已从《${document.frontmatter.title.trim() || '未命名稿件'}》保存知识点。`)
      } catch (caughtError) {
        if (caughtError instanceof GitHubAuthError) {
          handleAuthExpiry(caughtError.message)
          return
        }

        if (caughtError instanceof GitHubConflictError) {
          setError(caughtError.message)
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : '生成知识点失败。')
      }
    })()
  }

  const handleUploadImage = async (file: File) => {
    if (!session) {
      throw new Error('GitHub 会话已过期，请重新登录。')
    }

    clearSuccessMessageOnDirty()
    setError(null)

    try {
      const descriptor = buildImageUploadDescriptor(file)
      await uploadImageFile(session, {
        path: descriptor.repoPath,
        file,
      })

      const objectUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null
      if (objectUrl) {
        previewObjectUrlsRef.current.push(objectUrl)
        setPreviewImageUrls((currentUrls) => ({
          ...currentUrls,
          [descriptor.publicUrl]: objectUrl,
        }))
      }

      return {
        markdown: buildImageMarkdown(descriptor.defaultAlt, descriptor.publicUrl),
        publicUrl: descriptor.publicUrl,
      }
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        throw caughtError
      }

      const message = caughtError instanceof Error ? caughtError.message : '上传图片失败。'
      setError(message)
      throw caughtError instanceof Error ? caughtError : new Error(message)
    }
  }

  const transferImportedReadLaterImages = async (imported: ImportedReadLaterArticle): Promise<ImportedReadLaterArticle> => {
    if (!session || !imported.images?.length) {
      return imported
    }

    const replacements: Array<{ from: string; to: string }> = []
    const nextPreviewImageUrls: Record<string, string> = {}

    for (let index = 0; index < imported.images.length; index += 1) {
      const image = imported.images[index]
      const file = createImportedImageFile(image, index)
      const descriptor = buildImageUploadDescriptor(file, new Date(Date.now() + index))

      await uploadImageFile(session, {
        path: descriptor.repoPath,
        file,
      })

      replacements.push({ from: image.sourceUrl, to: descriptor.publicUrl })
      replacements.push({ from: image.finalUrl, to: descriptor.publicUrl })

      if (typeof URL.createObjectURL === 'function') {
        const objectUrl = URL.createObjectURL(file)
        previewObjectUrlsRef.current.push(objectUrl)
        nextPreviewImageUrls[descriptor.publicUrl] = objectUrl
      }
    }

    if (Object.keys(nextPreviewImageUrls).length > 0) {
      setPreviewImageUrls((currentUrls) => ({
        ...currentUrls,
        ...nextPreviewImageUrls,
      }))
    }

    return {
      ...imported,
      markdown: replaceImportedImageUrls(imported.markdown, replacements),
      images: [],
    }
  }

  const handleImportFromUrl = async () => {
    if (!session || !document || contentType !== 'read-later' || isImportingFromUrl) {
      return
    }

    const externalUrl = document.frontmatter.external_url?.trim() || ''
    if (!externalUrl) {
      setError('请先填写原文链接。')
      return
    }

    const currentBody = document.body.trim()
    const defaultBody = createNewReadLaterItem(new Date(document.frontmatter.date || Date.now())).body.trim()
    const hasAnnotations = (document.annotations || []).length > 0
    const shouldConfirmOverwrite = currentBody.length > 0 && currentBody !== defaultBody
    if (shouldConfirmOverwrite) {
      const shouldOverwrite = await requestAppConfirm({
        title: '覆盖当前正文',
        message: hasAnnotations ? '当前正文和高亮批注将被导入内容覆盖，确认继续吗？' : '当前正文将被导入内容覆盖，确认继续吗？',
        confirmLabel: '覆盖并导入',
        cancelLabel: '取消',
        isDangerous: hasAnnotations,
      })
      if (!shouldOverwrite) {
        return
      }
    }

    clearSuccessMessageOnDirty()
    setError(null)
    setIsImportingFromUrl(true)

    try {
      const imported = await transferImportedReadLaterImages(
        await importReadLaterFromUrl(session, externalUrl, { includeImages: true }),
      )
      updateBody(imported.markdown)
      updateReadLaterAnnotations([])
      setReadLaterTab('info')
      setActiveAnnotationId(null)
      setEditingAnnotationId(null)

      if (!document.frontmatter.title.trim() && imported.title) {
        updateFrontmatter('title', imported.title)
      }
      if (!document.frontmatter.desc.trim() && imported.desc) {
        updateFrontmatter('desc', imported.desc)
      }
      if (!(document.frontmatter.source_name || '').trim() && imported.sourceName) {
        updateFrontmatter('source_name', imported.sourceName)
      }
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '导入正文失败。')
    } finally {
      setIsImportingFromUrl(false)
    }
  }

  const findDuplicateReadLaterByUrl = (url: string, excludePath?: string | null) => {
    const normalizedTargetUrl = normalizeUrlForComparison(url)
    if (!normalizedTargetUrl) {
      return null
    }

    return postsByType['read-later'].find((post) => {
      if (excludePath && post.path === excludePath) {
        return false
      }

      return normalizeUrlForComparison(post.externalUrl || '') === normalizedTargetUrl
    }) || null
  }

  const handleSelectedMaterialPathsChange = (type: MaterialSourceType, nextPaths: string[]) => {
    setSelectedMaterialPaths((current) => {
      const deduplicatedPaths = Array.from(new Set(nextPaths))
      const currentPaths = current[type]

      if (
        deduplicatedPaths.length === currentPaths.length &&
        deduplicatedPaths.every((path, index) => path === currentPaths[index])
      ) {
        return current
      }

      return {
        ...current,
        [type]: deduplicatedPaths,
      }
    })
  }

  const clearSelectedMaterials = () => {
    setSelectedMaterialPaths(createEmptyMaterialSelectionState())
  }

  const handleOpenMaterialOrganizer = async () => {
    setIsMaterialOrganizerOpen(true)

    if (!session || isMaterialOrganizerLoadingSources) {
      return
    }

    const missingTypes: MaterialSourceType[] = []
    if (contentType !== 'diary' && postsByType.diary.length === 0) {
      missingTypes.push('diary')
    }
    if (contentType !== 'read-later' && postsByType['read-later'].length === 0) {
      missingTypes.push('read-later')
    }

    if (missingTypes.length === 0) {
      return
    }

    setIsMaterialOrganizerLoadingSources(true)

    try {
      const results = await Promise.all(
        missingTypes.map(async (type) => ({
          type,
          posts: await buildIndexByContentType(session, type),
        })),
      )

      results.forEach(({ type, posts }) => {
        updatePostsForType(type, () => posts as PostIndexItem[])
      })
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '加载素材列表失败。')
    } finally {
      setIsMaterialOrganizerLoadingSources(false)
    }
  }

  const handleQuickReadLaterUrlChange = (value: string) => {
    setQuickReadLaterUrl(value)
  }

  const handleLoadQuickReadLaterDirectory = async () => {
    if (!session || isQuickReadLaterDirectoryLoading || quickReadLaterDirectory.length > 0) {
      return
    }

    setIsQuickReadLaterDirectoryLoading(true)
    setError(null)

    try {
      const categories = await fetchFeedDirectory(session)
      setQuickReadLaterDirectory(categories)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '加载共享 RSS 源目录失败。')
    } finally {
      setIsQuickReadLaterDirectoryLoading(false)
    }
  }

  const handleToggleFeedDirectory = () => {
    const nextVisible = !isFeedDirectoryVisible
    setIsFeedDirectoryVisible(nextVisible)

    if (nextVisible) {
      void handleLoadQuickReadLaterDirectory()
    }
  }

  const openQuickReadLaterDraft = ({
    externalUrl,
    imported,
    fallbackTitle = '',
    fallbackDesc = '',
    fallbackSourceName = '',
    sourceFeedUrl = '',
    successMessage = null,
  }: {
    externalUrl: string
    imported: Awaited<ReturnType<typeof importReadLaterFromUrl>> | null
    fallbackTitle?: string
    fallbackDesc?: string
    fallbackSourceName?: string
    sourceFeedUrl?: string
    successMessage?: string | null
  }) => {
    const savedBaseDocument = createNewReadLaterItem()
    const draftDocument: ParsedReadLaterItem = {
      ...savedBaseDocument,
      body: imported?.markdown || savedBaseDocument.body,
      frontmatter: {
        ...savedBaseDocument.frontmatter,
        title: imported?.title || fallbackTitle || savedBaseDocument.frontmatter.title,
        desc: imported?.desc || fallbackDesc || savedBaseDocument.frontmatter.desc,
        source_name: imported?.sourceName || fallbackSourceName || savedBaseDocument.frontmatter.source_name,
        external_url: imported?.finalUrl || imported?.requestedUrl || externalUrl,
      },
    }

    openDocument(savedBaseDocument, {
      draftPost: draftDocument,
      successMessage,
    })
    setPendingFeedDraftContext(sourceFeedUrl ? { draftPath: savedBaseDocument.path, feedUrl: sourceFeedUrl } : null)
    setContentType('read-later')
    setEditorNavigationStack([])
    setQuickReadLaterUrl('')
    setQuickReadLaterPendingItemUrl(null)
    setAdminView('editor')
  }

  const handleQuickCollectReadLater = async () => {
    if (!session || isQuickCollectingReadLater) {
      return
    }

    const externalUrl = quickReadLaterUrl.trim()
    if (!externalUrl) {
      setError('请先粘贴原文链接。')
      return
    }

    if (!/^https?:\/\//i.test(externalUrl)) {
      setError('原文链接需以 http:// 或 https:// 开头。')
      return
    }

    setIsQuickCollectingReadLater(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const duplicatedPost = findDuplicateReadLaterByUrl(externalUrl)
      if (
        duplicatedPost &&
        !(await requestAppConfirm({
          title: '检测到重复待读',
          message: `已存在相同原文链接的待读《${duplicatedPost.title}》。仍要继续创建新草稿吗？`,
          confirmLabel: '继续创建',
          cancelLabel: '取消',
        }))
      ) {
        return
      }

      const imported = await transferImportedReadLaterImages(
        await importReadLaterFromUrl(session, externalUrl, { allowMetadataOnly: true, includeImages: true }),
      )
      const redirectedDuplicate = findDuplicateReadLaterByUrl(imported.finalUrl || imported.requestedUrl || externalUrl)
      const successMessages = [
        redirectedDuplicate ? `检测到相同链接的待读《${redirectedDuplicate.title}》，已仍然创建新草稿。` : null,
        imported.needsManualPaste ? '未自动识别正文，已创建带元信息的待读草稿，请手动粘贴原文。' : null,
      ].filter((message): message is string => Boolean(message))

      openQuickReadLaterDraft({
        externalUrl,
        imported,
        successMessage: successMessages.length > 0 ? successMessages.join(' ') : null,
      })
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '快速收录失败。')
    } finally {
      setIsQuickCollectingReadLater(false)
    }
  }

  const handleCreateReadLaterFromFeedPreview = async (
    item: ImportedFeedItem,
    previewArticle: ImportedReadLaterArticle | null,
  ) => {
    if (!session || isQuickCollectingReadLater) {
      return
    }

    const externalUrl = (previewArticle?.finalUrl || previewArticle?.requestedUrl || item.url).trim()
    if (!externalUrl) {
      setError('缺少原文链接，无法加入待读。')
      return
    }

    setIsQuickCollectingReadLater(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const duplicatedPost = findDuplicateReadLaterByUrl(externalUrl)
      if (
        duplicatedPost &&
        !(await requestAppConfirm({
          title: '检测到重复待读',
          message: `已存在相同原文链接的待读《${duplicatedPost.title}》。仍要继续创建新草稿吗？`,
          confirmLabel: '继续创建',
          cancelLabel: '取消',
        }))
      ) {
        return
      }

      const imported = previewArticle
        ? await transferImportedReadLaterImages(previewArticle)
        : await transferImportedReadLaterImages(
          await importReadLaterFromUrl(session, externalUrl, { allowMetadataOnly: true, includeImages: true }),
        )
      const redirectedDuplicate = findDuplicateReadLaterByUrl(imported.finalUrl || imported.requestedUrl || externalUrl)
      const successMessages = [
        redirectedDuplicate ? `检测到相同链接的待读《${redirectedDuplicate.title}》，已仍然创建新草稿。` : null,
        imported.needsManualPaste ? '未自动识别正文，已创建带元信息的待读草稿，请手动粘贴原文。' : null,
      ].filter((message): message is string => Boolean(message))

      openQuickReadLaterDraft({
        externalUrl,
        imported,
        fallbackTitle: item.title,
        fallbackDesc: item.summary,
        fallbackSourceName: item.sourceName || rssPreviewFeed?.title || '',
        sourceFeedUrl: selectedRssFeedUrl || '',
        successMessage: successMessages.length > 0 ? successMessages.join(' ') : '已创建待读草稿。',
      })
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '加入待读失败。')
    } finally {
      setIsQuickCollectingReadLater(false)
    }
  }

  const handleOrganizeWritingMaterials = async () => {
    if (!session || isOrganizingMaterials) {
      return false
    }

    if (selectedDiaryPosts.length === 0 && selectedReadLaterPosts.length === 0) {
      setSuccessMessage(null)
      setError('请先勾选要整理的日记或待读。')
      return false
    }

    setIsOrganizingMaterials(true)
    setMaterialResult(null)
    setSuccessMessage(null)
    setError(null)

    try {
      const diaryEntries: DiaryAiEntry[] = await Promise.all(
        selectedDiaryPosts.map(async (post) => {
          const file = readCachedMarkdownFile(post.path, post.sha) ?? await fetchMarkdownFile(session, post.path)
          const diary = parsePost(file)

          return {
            sourceType: 'diary',
            path: diary.path,
            title: diary.frontmatter.title || post.title,
            date: diary.frontmatter.date || post.date,
            tags: diary.frontmatter.tags,
            body: diary.body,
          }
        }),
      )
      const readLaterEntries: ReadLaterAiEntry[] = await Promise.all(
        selectedReadLaterPosts.map(async (post) => {
          const file = readCachedMarkdownFile(post.path, post.sha) ?? await fetchMarkdownFile(session, post.path)
          const item = parseReadLaterItem(file)
          const sections = parseReadLaterSections(item.body)

          return {
            sourceType: 'read-later',
            path: item.path,
            title: item.frontmatter.title || post.title,
            date: item.frontmatter.date || post.date,
            tags: item.frontmatter.tags,
            sourceName: item.frontmatter.source_name || post.sourceName || '',
            externalUrl: item.frontmatter.external_url || post.externalUrl || '',
            readingStatus: item.frontmatter.reading_status || post.readingStatus || 'unread',
            summary: sections.summary,
            commentary: sections.commentary,
            annotationNotes: item.annotations
              .filter((annotation) => annotation.note.trim().length > 0)
              .map((annotation) => ({
                sectionLabel: getReadLaterAnnotationSectionLabel(annotation.sectionKey),
                quote: annotation.quote.trim(),
                note: annotation.note.trim(),
                updatedAt: annotation.updatedAt,
              })),
          }
        }),
      )

      const entries: WritingMaterialEntry[] = [...diaryEntries, ...readLaterEntries]
      const result = await organizeWritingMaterials(session, entries)
      setMaterialResult(result.materialMarkdown)
      setSuccessMessage(
        `已整理 ${formatSelectedMaterialSummary({
          diary: diaryEntries.map((entry) => entry.path),
          'read-later': readLaterEntries.map((entry) => entry.path),
        })}。`,
      )
      return true
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return false
      }

      setError(caughtError instanceof Error ? caughtError.message : '素材整理失败。')
      return false
    } finally {
      setIsOrganizingMaterials(false)
    }
  }

  const handleConfirmOrganizeMaterials = async () => {
    const didOrganize = await handleOrganizeWritingMaterials()
    if (didOrganize) {
      setIsMaterialOrganizerOpen(false)
    }
  }

  const handleOpenRecoveredDraft = async (path: string) => {
    if (!(await confirmNavigation())) {
      return
    }

    const storedDraft = readLocalDraft(path)
    if (!storedDraft || !hasRecoverableChanges(storedDraft.draftDocument, storedDraft.savedDocument)) {
      removeLocalDraft(path)
      setError('本地草稿不存在或已失效。')
      return
    }

    const nextContentType = getContentTypeFromPostLike(storedDraft.draftDocument)
    setContentType(nextContentType)
    setEditorNavigationStack([])
    openDocument(storedDraft.savedDocument || storedDraft.draftDocument, {
      draftPost: storedDraft.draftDocument,
      successMessage: '已恢复本地草稿。',
    })
    setAdminView('editor')
  }

  // ---- Taxonomy CRUD handlers ----

  const handleTaxonomyCreate = (type: TaxonomyType, name: string) => {
    if (!document) {
      return
    }

    clearSuccessMessageOnDirty()
    // Add the new taxonomy value to the current document's frontmatter
    const currentValues = document.frontmatter[type]
    if (!currentValues.includes(name)) {
      updateFrontmatter(type, [...currentValues, name])
    }
  }

  const handleTaxonomyRename = (type: TaxonomyType, oldName: string, newName: string) => {
    const affectedPaths = findPostsWithTaxonomy(posts, type, oldName)

    if (affectedPaths.length === 0) {
      // No posts use this taxonomy — just update the current document if it has it
      if (document) {
        const currentValues = document.frontmatter[type]
        if (currentValues.includes(oldName)) {
          updateFrontmatter(
            type,
            currentValues.map((v) => (v === oldName ? newName : v)),
          )
        }
      }
      return
    }

    setTaxonomyConfirm({ kind: 'rename', type, oldName, newName, affectedPaths })
  }

  const handleTaxonomyDelete = (type: TaxonomyType, name: string) => {
    const affectedPaths = findPostsWithTaxonomy(posts, type, name)

    if (affectedPaths.length === 0) {
      // No posts use this taxonomy — just remove from current document if present
      if (document) {
        const currentValues = document.frontmatter[type]
        if (currentValues.includes(name)) {
          updateFrontmatter(
            type,
            currentValues.filter((v) => v !== name),
          )
        }
      }
      return
    }

    setTaxonomyConfirm({ kind: 'delete', type, name, affectedPaths })
  }

  const handleTaxonomyConfirm = async () => {
    if (!taxonomyConfirm || !session) {
      return
    }

    setIsBatchUpdating(true)
    setBatchProgress('')
    setError(null)

    try {
      const { affectedPaths } = taxonomyConfirm
      const targetContentLabel = getContentTypeLabel(contentType)
      const targetCountUnit = getContentCountUnit(contentType)

      if (taxonomyConfirm.kind === 'rename') {
        const { type, oldName, newName } = taxonomyConfirm
        const result = await batchUpdatePostContents(
          session,
          affectedPaths,
          `Rename ${type} "${oldName}" to "${newName}"`,
          (content) => renameTaxonomyInContent(content, type, oldName, newName),
          (completed, total) => setBatchProgress(`正在更新 ${completed}/${total} ${targetCountUnit}${targetContentLabel}…`),
        )

        // Update current document's frontmatter if it contains the old name
        if (document) {
          const currentValues = document.frontmatter[type]
          if (currentValues.includes(oldName)) {
            updateFrontmatter(
              type,
              currentValues.map((v) => (v === oldName ? newName : v)),
            )
          }
        }

        if (result.failed.length > 0) {
          setError(`重命名完成，但 ${result.failed.length} ${targetCountUnit}${targetContentLabel}更新失败。`)
        } else {
          setSuccessMessage(`已将${TAXONOMY_LABELS[type]}「${oldName}」重命名为「${newName}」。`)
        }
      } else {
        const { type, name } = taxonomyConfirm
        const result = await batchUpdatePostContents(
          session,
          affectedPaths,
          `Delete ${type} "${name}"`,
          (content) => deleteTaxonomyFromContent(content, type, name),
          (completed, total) => setBatchProgress(`正在更新 ${completed}/${total} ${targetCountUnit}${targetContentLabel}…`),
        )

        // Update current document's frontmatter if it contains the deleted name
        if (document) {
          const currentValues = document.frontmatter[type]
          if (currentValues.includes(name)) {
            updateFrontmatter(
              type,
              currentValues.filter((v) => v !== name),
            )
          }
        }

        if (result.failed.length > 0) {
          setError(`删除完成，但 ${result.failed.length} ${targetCountUnit}${targetContentLabel}更新失败。`)
        } else {
          setSuccessMessage(`已从所有${targetContentLabel}中删除${TAXONOMY_LABELS[type]}「${name}」。`)
        }
      }

      // Refresh post index to reflect the changes
      try {
        const indexedPosts = await buildIndexByContentType(session, contentType)
        updatePostsForType(contentType, () => indexedPosts as PostIndexItem[])
      } catch {
        // If re-indexing fails, the UI still reflects the old data but the operation succeeded
      }
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '批量更新失败。')
    } finally {
      setIsBatchUpdating(false)
      setBatchProgress('')
      setTaxonomyConfirm(null)
    }
  }

  const handleTaxonomyCancel = () => {
    if (!isBatchUpdating) {
      setTaxonomyConfirm(null)
    }
  }

  const saveLabel = isSaving ? '保存中…' : document ? (isDirty ? '保存' : '已保存') : '保存'
  const isSaveDisabled = !document || isSaving || !isDirty || isBatchUpdating || isTogglingPinned
  const isSaveQuiet = Boolean(document) && !isDirty && !isSaving

  const indexedLabel = getContentTypeLabel(contentType)
  const indexedCountUnit = getContentCountUnit(contentType)
  const loadingLabel = `正在加载${indexedLabel}…`
  const showIndexLoading = isIndexing && posts.length === 0

  const status = adminView === 'dashboard'
    ? isOrganizingMaterials
      ? '正在整理月报素材…'
      : isIndexing
      ? posts.length > 0
        ? `正在刷新${indexedLabel}… · 共 ${posts.length} ${indexedCountUnit}${indexedLabel}`
        : loadingLabel
      : `共 ${posts.length} ${indexedCountUnit}${indexedLabel}`
    : adminView === 'feeds'
      ? isSavingRssSubscription
        ? '正在更新 feed 订阅…'
        : isRssPreviewLoading
          ? '正在加载 feed 条目…'
          : isRssBackgroundRefreshing
            ? '正在后台刷新 RSS…'
          : `共 ${rssSubscriptions.length} 个 feed`
    : adminView === 'annotations'
      ? isAnnotationIndexing
        ? `正在聚合批注… · 已识别 ${readLaterAnnotationIndex.length} 条`
        : `共 ${readLaterAnnotationIndex.length} 条批注`
    : adminView === 'series'
      ? '合集视图'
      : isOrganizingMaterials
        ? '正在整理月报素材…'
      : isSaving && document
        ? `正在保存 ${document.path}`
        : isTogglingPinned && togglingPinnedPostPath
          ? `正在更新置顶 · ${togglingPinnedPostPath}`
          : isOpeningPost && activePostPath
            ? `正在打开 ${activePostPath}`
            : document
            ? isDirty
              ? `未保存修改 · ${document.path}`
              : `编辑中 · ${document.path}`
            : isIndexing
              ? loadingLabel
              : '已就绪'

  if (!session) {
    return <LoginGate isLoading={isLoading} error={error} onLogin={handleLogin} />
  }

  const isDashboard = adminView === 'dashboard'
  const isFeedsView = adminView === 'feeds'
  const isAnnotationsView = adminView === 'annotations'
  const isTrashView = adminView === 'trash'
  const isSeriesView = adminView === 'series'
  const isPreviewing = mode === 'preview'
  const isReadLaterDocument = document?.contentType === 'read-later'
  const isReaderPreview = Boolean(document && isPreviewing && document.contentType === 'read-later')
  const hideTopBar = isReaderPreview && isReadLaterTopBarHidden
  const showImmersiveCanvas = Boolean(document) && !isReaderPreview && (isImmersive || isPreviewing)
  const isPostListHidden = showImmersiveCanvas
  const showSettingsPanel = Boolean(document) && !showImmersiveCanvas
  const showDocumentFrame = Boolean(document) && !showImmersiveCanvas && !isReaderPreview
  const canReturnToPreviousDocument = editorNavigationStack.length > 0
  const editorBackButtonLabel = canReturnToPreviousDocument ? '← 返回原文' : '← 返回列表'
  const readerBackButtonLabel = canReturnToPreviousDocument ? '← 返回原文' : '← 返回归档'

  return (
    <main className={`admin-shell${showImmersiveCanvas ? ' admin-shell--immersive' : ''}${isDark ? ' admin-shell--dark' : ''}${hideTopBar ? ' admin-shell--reader-top-bar-hidden' : ''}`}>
      <div className="admin-shell__glow admin-shell__glow--left" />
      <div className="admin-shell__glow admin-shell__glow--right" />
      {!hideTopBar ? (
        <TopBar
          search={search}
          onSearchChange={setSearch}
          onNewPost={handleNewPost}
          onOrganizeMaterials={() => { void handleOpenMaterialOrganizer() }}
          onSave={() => {
            void handleSave()
          }}
          onTogglePreview={handleTogglePreview}
          hasActiveDocument={Boolean(document)}
          isPreviewing={isPreviewing}
          isDarkMode={isDark}
          previewFontSize={previewReadingFontSize}
          previewFontWeightIndex={previewReadingFontWeightIndex}
          onPreviewFontSizeChange={setPreviewReadingFontSize}
          onPreviewFontWeightIndexChange={setPreviewReadingFontWeightIndex}
          saveLabel={saveLabel}
          isSaveDisabled={isSaveDisabled}
          isSaveQuiet={isSaveQuiet}
          status={status}
          onLogout={handleLogout}
          onToggleColorMode={toggleColorMode}
          adminView={adminView}
          onBackToDashboard={() => { void handleBackNavigation() }}
          backButtonLabel={editorBackButtonLabel}
          onOpenAnnotations={handleOpenAnnotations}
          onOpenTrash={handleOpenTrash}
          onOpenFeeds={handleOpenFeeds}
          rssUnreadCount={rssUnreadCount}
          isRssRefreshing={isRssBackgroundRefreshing}
          onContentTypeChange={(value) => {
            if (value === contentType) {
              return
            }
            void (async () => {
              if (!(await confirmNavigation())) {
                return
              }
              resetPreviewImageUrls()
              replaceDocument(null)
              setActivePostPath(null)
              setIsOpeningPost(false)
              setIsImmersive(false)
              setError(null)
              setSuccessMessage(null)
              setSearch('')
              setQuickReadLaterUrl('')
              setQuickReadLaterPendingItemUrl(null)
              setEditorNavigationStack([])
              setContentType(value)
              setAdminView('dashboard')
            })()
          }}
          contentType={contentType}
          searchInputRef={searchInputRef}
          currentActionContentType={activeDocumentPost ? getContentTypeFromPostLike(activeDocumentPost) : null}
          isCurrentPinned={Boolean(activeDocumentPost?.pinned)}
          isPinningCurrent={Boolean(activeDocumentPost && isTogglingPinned && togglingPinnedPostPath === activeDocumentPost.path)}
          isPinActionDisabled={
            !activeDocumentPost?.sha ||
            isDeletingPost ||
            isTogglingPinned ||
            (Boolean(activeDocumentPost) && activeDocumentPost.path === document?.path && !canNavigateAway)
          }
          onTogglePinnedCurrent={activeDocumentPost ? () => { void handleTogglePinned(activeDocumentPost) } : undefined}
          isDeletingCurrent={Boolean(activeDocumentPost && isDeletingPost && deletingPostPath === activeDocumentPost.path)}
          isDeleteActionDisabled={!activeDocumentPost?.sha || isDeletingPost || isTogglingPinned}
          onDeleteCurrent={activeDocumentPost ? () => handleDeletePost(activeDocumentPost) : undefined}
          isPostListOpen={isPostListDrawerOpen}
          isSettingsPanelOpen={isSettingsDrawerOpen}
          onTogglePostList={() => {
            setIsPostListDrawerOpen((current) => !current)
            setIsSettingsDrawerOpen(false)
            setShouldFocusSettingsTitle(false)
          }}
          onToggleSettingsPanel={() => {
            setIsSettingsDrawerOpen((current) => !current)
            setIsPostListDrawerOpen(false)
            setShouldFocusSettingsTitle(false)
          }}
          onCopyCurrentPath={() => { void handleCopyCurrentPath() }}
          onExportCurrent={handleExportCurrent}
          onDuplicateCurrent={handleDuplicateCurrent}
        />
      ) : null}
      {isDashboard ? (
        <section className="admin-shell__viewport">
          {successMessage ? <p className="success-message">{successMessage}</p> : null}
          {error ? <p className="error-message">{error}</p> : null}
          <PostDashboard
            posts={posts}
            search={search}
            isIndexing={showIndexLoading}
            contentType={contentType}
            recoverableDrafts={recoverableDrafts}
            quickCaptureUrl={quickReadLaterUrl}
            isQuickCapturing={isQuickCollectingReadLater}
            quickCaptureImportingItemUrl={quickReadLaterPendingItemUrl}
            isDeleting={isDeletingPost}
            deletingPostPath={deletingPostPath}
            isTogglingPinned={isTogglingPinned}
            togglingPinnedPostPath={togglingPinnedPostPath}
            selectedMaterialPaths={
              contentType === 'diary'
                ? selectedMaterialPaths.diary
                : contentType === 'read-later'
                  ? selectedMaterialPaths['read-later']
                  : []
            }
            selectedMaterialCounts={selectedMaterialCounts}
            isOrganizingMaterials={isOrganizingMaterials}
            materialResult={materialResult}
            onOpenPost={handleOpenPost}
            onOpenRecoveredDraft={handleOpenRecoveredDraft}
            onNewPost={handleNewPost}
            onQuickCaptureUrlChange={handleQuickReadLaterUrlChange}
            onQuickCapture={handleQuickCollectReadLater}
            onDeletePost={handleDeletePost}
            onTogglePinned={handleTogglePinned}
            onSelectedMaterialPathsChange={(nextPaths) => {
              if (contentType === 'diary' || contentType === 'read-later') {
                handleSelectedMaterialPathsChange(contentType, nextPaths)
              }
            }}
            onClearSelectedMaterials={clearSelectedMaterials}
            onOrganizeMaterials={() => { void handleOpenMaterialOrganizer() }}
            onSearchFocus={() => searchInputRef.current?.focus()}
            onOpenSeriesCollection={contentType === 'post' ? handleOpenSeries : undefined}
          />
        </section>
      ) : isFeedsView ? (
        <section className="admin-shell__viewport">
          {successMessage ? (
            <div className="admin-shell__toast admin-shell__toast--success" role="status" aria-live="polite">
              {successMessage}
            </div>
          ) : null}
          {error ? (
            <div className="admin-shell__toast admin-shell__toast--error" role="alert">
              {error}
            </div>
          ) : null}
          <FeedDashboard
            search={search}
            manualFeedUrl={manualFeedUrl}
            isLoading={isRssSubscriptionsLoading}
            isSavingFeed={isSavingRssSubscription}
            folders={rssSubscriptionsState.folders || []}
            subscriptions={rssSubscriptions}
            selectedSubscriptionUrl={selectedRssFeedUrl}
            previewFeed={rssPreviewFeed}
            feedItemsByUrl={rssFeedItemsByUrl}
            previewArticlesByUrl={rssPreviewArticlesByUrl}
            previewArticleLoadingByUrl={rssPreviewArticleLoadingByUrl}
            previewArticleErrorsByUrl={rssPreviewArticleErrorsByUrl}
            viewedFeedItemsByUrl={viewedFeedItemsByUrl}
            isPreviewLoading={isRssPreviewLoading}
            isBackgroundRefreshing={isRssBackgroundRefreshing}
            onManualFeedUrlChange={setManualFeedUrl}
            onAddManualFeed={() => { void handleAddManualFeedSubscription() }}
            onPreviewItemChange={(item) => { void handlePreviewFeedItemArticle(item) }}
            onSelectSubscription={(subscription) => { void handlePreviewSubscriptionFeed(subscription) }}
            onRemoveSubscription={(subscription) => { void handleRemoveFeedSubscription(subscription) }}
            onCreateFolder={(name) => { void handleCreateFeedFolder(name) }}
            onRenameFolder={(folder, name) => { void handleRenameFeedFolder(folder, name) }}
            onDeleteFolder={(folder) => { void handleDeleteFeedFolder(folder) }}
            onMoveSubscriptionToFolder={(subscription, folderName) => { void handleMoveFeedSubscriptionToFolder(subscription, folderName) }}
            onViewedFeedItemsChange={setViewedFeedItemsByUrl}
            onMarkFeedItemRead={(feedUrl, item) => markRssFeedItemsRead(feedUrl, [item])}
            onMarkFeedItemsRead={markRssFeedItemsRead}
            onMarkFeedRead={markRssFeedRead}
            onCreateReadLaterFromPreview={(item, article) => { void handleCreateReadLaterFromFeedPreview(item, article) }}
            isCreatingReadLaterFromPreview={isQuickCollectingReadLater}
          />
        </section>
      ) : isAnnotationsView ? (
        <section className="admin-shell__viewport">
          {successMessage ? <p className="success-message">{successMessage}</p> : null}
          {error ? <p className="error-message">{error}</p> : null}
          <ReadLaterAnnotationsView
            annotations={readLaterAnnotationIndex}
            isLoading={isAnnotationIndexing}
            search={search}
            onSearchChange={setSearch}
            onOpenAnnotation={(annotation) => { void handleOpenReadLaterAnnotation(annotation) }}
          />
        </section>
      ) : isTrashView ? (
        <section className="admin-shell__viewport">
          {successMessage ? <p className="success-message">{successMessage}</p> : null}
          {error ? <p className="error-message">{error}</p> : null}
          <TrashView
            entries={trashEntries}
            search={search}
            isLoading={isTrashIndexing}
            isProcessing={isProcessingTrash}
            processingTrashPath={processingTrashPath}
            onRestore={handleRestoreTrashEntry}
            onDelete={handleDeleteTrashEntry}
          />
        </section>
      ) : isSeriesView ? (
        <section className="admin-shell__viewport">
          {successMessage ? <p className="success-message">{successMessage}</p> : null}
          {error ? <p className="error-message">{error}</p> : null}
          <SeriesCollection
            posts={postsByType.post || []}
            contentType={contentType}
            onOpenPost={handleOpenPost}
            onBack={handleBackFromSeries}
          />
        </section>
      ) : (
        <div className={`admin-layout${isReaderPreview ? ' admin-layout--reader' : ''}${!isReadLaterDocument ? ' admin-layout--drawers' : ''}`}>
          <PostListPane
            posts={filteredPosts}
            hidden={isPostListHidden || (!isReadLaterDocument && !isPostListDrawerOpen)}
            contentType={contentType}
            activePostPath={activePostPath}
            document={document}
            documentContentFormat={documentContentFormat}
            isPreviewing={isPreviewing}
            activeOutlineTargetId={activeOutlineTargetId}
            isDeleting={isDeletingPost}
            deletingPostPath={deletingPostPath}
            isTogglingPinned={isTogglingPinned}
            togglingPinnedPostPath={togglingPinnedPostPath}
            disabledPinnedPostPath={document?.path && !canNavigateAway ? document.path : null}
            onOpenPost={(post) => { void handleOpenPost(post) }}
            onDeletePost={handleDeletePost}
            onTogglePinned={handleTogglePinned}
            onBackToList={() => { void handleBackNavigation() }}
            backToListLabel={readerBackButtonLabel}
            onNavigateOutline={handleNavigateOutline}
            isTopBarHidden={hideTopBar}
            onToggleTopBar={() => setIsReadLaterTopBarHidden((current) => !current)}
            isDrawer={!isReadLaterDocument}
            onClose={() => setIsPostListDrawerOpen(false)}
          />
          {!isReadLaterDocument && (isPostListDrawerOpen || isSettingsDrawerOpen) ? <button type="button" className="editor-drawer-backdrop" aria-label="关闭抽屉" onClick={() => { setIsPostListDrawerOpen(false); setIsSettingsDrawerOpen(false); setShouldFocusSettingsTitle(false) }} /> : null}
          <section className={`editor-layout${showSettingsPanel ? '' : ' editor-layout--single'}${isReaderPreview ? ' editor-layout--reader' : ''}${!isReadLaterDocument ? ' editor-layout--drawers' : ''}`}>
            <div className={`editor-stack${isReaderPreview ? ' editor-stack--reader' : ''}`}>
              {document ? (
                <>
                  {showDocumentFrame ? (
                    <section className="editor-frame">
                      <div className="editor-frame__header">
                        <div>
                          <p className={`editor-frame__eyebrow${!document.frontmatter.title?.trim() ? ' editor-frame__eyebrow--untitled' : ''}`}>{document.frontmatter.published ? '已发布' : '草稿'} · {lastSavedAt ? `已保存于 ${lastSavedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : isDirty ? '有未保存修改' : '已保存'}</p>
                          <div className="editor-frame__title-row"><h1 className={!document.frontmatter.title?.trim() ? 'editor-frame__title--untitled' : ''}>{document.frontmatter.title?.trim() || '未命名草稿'}</h1><button type="button" className="editor-frame__title-edit" aria-label="编辑标题" onClick={() => { setIsSettingsDrawerOpen(true); setIsPostListDrawerOpen(false); setShouldFocusSettingsTitle(true) }}>编辑</button></div>
                        </div>
                      </div>
                      <div className="editor-frame__meta">
                        <span>{document.path}</span>
                        <span>{mode === 'preview' ? (isReadLaterDocument ? '阅读视图' : '预览模式') : '编辑模式'}</span>
                      </div>
                    </section>
                  ) : null}
                  {successMessage && !isDirty ? <p className="success-message">{successMessage}</p> : null}
                  {error ? <p className="error-message">{error}</p> : null}
                  {mode === 'preview' ? (
                    <PreviewPane
                      title={document.frontmatter.title}
                      date={document.frontmatter.date}
                      markdown={previewMarkdown}
                      contentFormat={documentContentFormat}
                      desc={document.frontmatter.desc}
                      cover={document.frontmatter.cover}
                      sourceName={document.frontmatter.source_name}
                      externalUrl={document.frontmatter.external_url}
                      readingStatus={document.frontmatter.reading_status}
                      sourceType={document.frontmatter.source_type}
                      sourceTitle={document.frontmatter.source_title}
                      sourcePath={document.frontmatter.source_path}
                      sourceUrl={document.frontmatter.source_url}
                      contentType={document.contentType}
                      previewImageUrls={previewImageUrls}
                      annotations={readLaterAnnotations}
                      activeAnnotationId={activeAnnotationId}
                      editingAnnotationId={editingAnnotationId}
                      annotationNoteDraft={annotationNoteDraft}
                      annotationScrollRequest={annotationScrollRequest}
                      navigationRequest={readerNavigationRequest}
                      onActiveOutlineTargetChange={setActiveOutlineTargetId}
                      onCreateAnnotation={handleCreateReadLaterAnnotation}
                      onCreateKnowledge={handleCreateKnowledgeFromSelection}
                      onSelectAnnotation={handleSelectAnnotation}
                      onClearActiveAnnotation={handleClearActiveAnnotation}
                      onAnnotationNoteDraftChange={setAnnotationNoteDraft}
                      onEditAnnotation={handleOpenAnnotationNote}
                      onSaveAnnotationNote={handleSaveAnnotationNote}
                      onCancelAnnotationEdit={() => setEditingAnnotationId(null)}
                      onDeleteAnnotation={handleDeleteAnnotation}
                      resolveWikiLinkTitle={(targetKey) => topicNodesByKey.get(targetKey)?.title || null}
                      onOpenWikiLink={handleOpenTopicNode}
                      resolveInternalReferenceTitle={(targetKey) => internalReferenceLookup.get(targetKey)?.title || null}
                      onOpenInternalReference={handleOpenInternalReference}
                      topicBacklinks={activeTopicBacklinks}
                      showTopicBacklinksDrawer={document.contentType === 'post' && document.frontmatter.topic === true}
                      showInlineOutline={!isReaderPreview}
                      readingFontSize={previewReadingFontSize}
                      readingFontWeight={previewReadingFontWeight}
                    />
                  ) : (
                    <MarkdownEditor
                      value={document.body}
                      onChange={handleEditorChange}
                      onToggleImmersive={() => setIsImmersive((current) => getNextImmersiveMode(current))}
                      isImmersive={isImmersive}
                      onUploadImage={handleUploadImage}
                      internalReferenceCandidates={internalReferenceCandidates}
                    />
                  )}
                </>
              ) : isOpeningPost ? (
                <section className="hero-card">
                  <div className="hero-card__grid" />
                  <p>{loadingLabel}</p>
                </section>
              ) : (
                <EmptyState error={error} />
              )}
            </div>
            {showSettingsPanel ? (
              <SettingsPanel
                document={document}
                validationErrors={validationErrors}
                contentType={contentType}
                availableCategories={availableCategories}
                availableTags={availableTags}
                availableSeries={availableSeries}
                onFieldChange={handleFrontmatterChange}
                onBodyChange={handleEditorChange}
                onTaxonomyCreate={handleTaxonomyCreate}
                onTaxonomyRename={handleTaxonomyRename}
                onTaxonomyDelete={handleTaxonomyDelete}
                onUploadImage={handleUploadImage}
                onImportFromUrl={() => { void handleImportFromUrl() }}
                isImportingFromUrl={isImportingFromUrl}
                isReaderPreview={isReaderPreview}
                previewImageUrls={previewImageUrls}
                readLaterTab={readLaterTab}
                onReadLaterTabChange={handleReadLaterTabChange}
                annotations={readLaterAnnotations}
                activeAnnotationId={activeAnnotationId}
                editingAnnotationId={editingAnnotationId}
                annotationNoteDraft={annotationNoteDraft}
                onSelectAnnotation={handleSelectAnnotation}
                onAnnotationNoteDraftChange={setAnnotationNoteDraft}
                onEditAnnotation={handleOpenAnnotationNote}
                onSaveAnnotationNote={handleSaveAnnotationNote}
                onCancelAnnotationEdit={() => setEditingAnnotationId(null)}
                topicBacklinks={activeTopicBacklinks}
                onOpenLinkedPost={(post) => { void openIndexedPost(post, { navigationBehavior: 'push' }) }}
                isDrawer={!isReadLaterDocument}
                isOpen={isSettingsDrawerOpen}
                onClose={() => { setIsSettingsDrawerOpen(false); setShouldFocusSettingsTitle(false) }}
                focusTitle={shouldFocusSettingsTitle}
              />
            ) : null}
          </section>
        </div>
      )}
      {isMaterialOrganizerOpen ? (
        <MaterialOrganizerDialog
          diaryPosts={postsByType.diary}
          readLaterPosts={postsByType['read-later']}
          selectedMaterialPaths={selectedMaterialPaths}
          isLoadingReadLater={isMaterialOrganizerLoadingSources && contentType !== 'read-later'}
          isProcessing={isOrganizingMaterials}
          onSelectedMaterialPathsChange={handleSelectedMaterialPathsChange}
          onClearSelectedMaterials={clearSelectedMaterials}
          onConfirm={() => { void handleConfirmOrganizeMaterials() }}
          onCancel={() => setIsMaterialOrganizerOpen(false)}
        />
      ) : null}
      {taxonomyConfirm ? (
        <ConfirmDialog
          title={
            taxonomyConfirm.kind === 'rename'
              ? `重命名${TAXONOMY_LABELS[taxonomyConfirm.type]}`
              : `删除${TAXONOMY_LABELS[taxonomyConfirm.type]}`
          }
          message={
            taxonomyConfirm.kind === 'rename'
              ? `确定将${TAXONOMY_LABELS[taxonomyConfirm.type]}「${taxonomyConfirm.oldName}」重命名为「${taxonomyConfirm.newName}」吗？这将修改 ${taxonomyConfirm.affectedPaths.length} ${indexedCountUnit}${indexedLabel}。`
              : `确定删除${TAXONOMY_LABELS[taxonomyConfirm.type]}「${taxonomyConfirm.name}」吗？这将从 ${taxonomyConfirm.affectedPaths.length} ${indexedCountUnit}${indexedLabel}中移除该${TAXONOMY_LABELS[taxonomyConfirm.type]}。`
          }
          confirmLabel={taxonomyConfirm.kind === 'rename' ? '确认重命名' : '确认删除'}
          isDangerous={taxonomyConfirm.kind === 'delete'}
          isProcessing={isBatchUpdating}
          processingMessage={batchProgress}
          onConfirm={() => { void handleTaxonomyConfirm() }}
          onCancel={handleTaxonomyCancel}
        />
      ) : null}
      {postDeleteConfirm ? (
        <ConfirmDialog
          title={`删除${getDeleteContentTypeLabel(getContentTypeFromPostLike(postDeleteConfirm.post))}`}
          message={`确定删除《${postDeleteConfirm.post.title}》吗？删除后会进入回收站，30 天内可恢复。`}
          confirmLabel="确认删除"
          isDangerous
          isProcessing={isDeletingPost}
          processingMessage={deletingPostPath ? `正在删除 ${deletingPostPath}` : undefined}
          onConfirm={() => { void handleDeletePostConfirm() }}
          onCancel={handleDeletePostCancel}
        />
      ) : null}
      {trashConfirm ? (
        <ConfirmDialog
          title={trashConfirm.kind === 'restore-trash' ? '恢复内容' : '彻底删除'}
          message={trashConfirm.kind === 'restore-trash'
            ? `确定将《${trashConfirm.entry.originalTitle}》恢复到 ${trashConfirm.entry.originalPath} 吗？`
            : `确定彻底删除《${trashConfirm.entry.originalTitle}》吗？此操作不可恢复。`}
          confirmLabel={trashConfirm.kind === 'restore-trash' ? '恢复' : '彻底删除'}
          isDangerous={trashConfirm.kind === 'delete-trash'}
          isProcessing={isProcessingTrash}
          processingMessage={processingTrashPath ? `正在处理 ${processingTrashPath}` : undefined}
          onConfirm={() => { void handleTrashConfirm() }}
          onCancel={handleTrashConfirmCancel}
        />
      ) : null}
      {appConfirm ? (
        <ConfirmDialog
          title={appConfirm.title}
          message={appConfirm.message}
          confirmLabel={appConfirm.confirmLabel}
          cancelLabel={appConfirm.cancelLabel}
          isDangerous={appConfirm.isDangerous}
          onConfirm={() => closeAppConfirm(true)}
          onCancel={() => closeAppConfirm(false)}
        />
      ) : null}
    </main>
  )
}
