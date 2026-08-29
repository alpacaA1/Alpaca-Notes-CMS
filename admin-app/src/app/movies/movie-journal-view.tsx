import { useEffect, useMemo, useState } from 'react'
import FilterSelect from '../layout/filter-select'
import MovieDatePicker from './movie-date-picker'
import type { MovieEntry, MovieStatus } from './movie-types'
import type { TmdbMovieResult } from './tmdb-client'

type Props = {
  movies: MovieEntry[]
  search: string
  isLoading: boolean
  isSaving: boolean
  onAdd: () => MovieEntry
  onTmdbSearch: (query: string) => Promise<TmdbMovieResult[]>
  onSave: (movie: MovieEntry) => void
  onDelete: (movie: MovieEntry) => void
}

const statusLabel: Record<MovieStatus, string> = { watched: '已看', wish: '想看' }

function Cover({ movie }: { movie: MovieEntry }) {
  const [broken, setBroken] = useState(false)
  if (movie.coverUrl && !broken) return <img src={movie.coverUrl} alt={`《${movie.title}》海报`} onError={() => setBroken(true)} />
  return <div className="movie-journal__cover-fallback"><span>{movie.title.slice(0, 1) || '影'}</span></div>
}

function MetaIcon({ type }: { type: 'status' | 'date' | 'rating' | 'year' | 'director' | 'tags' }) {
  const common = { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true }
  if (type === 'status') return <svg {...common}><path d="M2.1 8s2.1-3.5 5.9-3.5S13.9 8 13.9 8 11.8 11.5 8 11.5 2.1 8 2.1 8Z" stroke="currentColor" strokeWidth="1.35"/><circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.35"/></svg>
  if (type === 'date') return <svg {...common}><rect x="2.4" y="3.1" width="11.2" height="10.2" rx="1.4" stroke="currentColor" strokeWidth="1.3"/><path d="M5 2v2.4M11 2v2.4M2.5 6.2h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
  if (type === 'rating') return <svg {...common}><path d="m8 2.25 1.62 3.29 3.63.53-2.63 2.56.62 3.62L8 10.55l-3.24 1.7.62-3.62-2.63-2.56 3.63-.53L8 2.25Z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round"/></svg>
  if (type === 'year') return <svg {...common}><circle cx="8" cy="8" r="5.55" stroke="currentColor" strokeWidth="1.3"/><path d="M8 4.8v3.45l2.25 1.35" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
  if (type === 'director') return <svg {...common}><rect x="2.2" y="3.1" width="11.6" height="9.8" rx="1.2" stroke="currentColor" strokeWidth="1.25"/><path d="M5.2 3.1v9.8M10.8 3.1v9.8M2.2 6.4h3M10.8 6.4h3M2.2 9.6h3M10.8 9.6h3" stroke="currentColor" strokeWidth="1.1"/></svg>
  return <svg {...common}><path d="M2.3 7.7V3.2h4.5l6.9 6.9-4.5 4.5-6.9-6.9Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/><circle cx="5.35" cy="5.35" r=".85" fill="currentColor"/></svg>
}

function ExpandIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.1 2.5H2.5v3.6M9.9 2.5h3.6v3.6M6.1 13.5H2.5V9.9M9.9 13.5h3.6V9.9" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export default function MovieJournalView({ movies, search, isLoading, isSaving, onAdd, onTmdbSearch, onSave, onDelete }: Props) {
  const [statusFilter, setStatusFilter] = useState<'all' | MovieStatus>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = movies.find((movie) => movie.id === selectedId) || null
  const [draft, setDraft] = useState<MovieEntry | null>(null)
  const [tmdbResults, setTmdbResults] = useState<TmdbMovieResult[]>([])
  const [isTmdbSearching, setIsTmdbSearching] = useState(false)
  const [tmdbError, setTmdbError] = useState('')
  const [isWriting, setIsWriting] = useState(false)

  useEffect(() => { setDraft(selected); setIsWriting(false) }, [selected])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return movies.filter((movie) => (statusFilter === 'all' || movie.status === statusFilter) && (!query || [movie.title, movie.originalTitle, movie.director, movie.tags.join(' ')].join(' ').toLowerCase().includes(query)))
  }, [movies, search, statusFilter])

  const update = <K extends keyof MovieEntry>(key: K, value: MovieEntry[K]) => setDraft((current) => current ? { ...current, [key]: value } : current)
  const save = () => { if (draft?.title.trim()) onSave({ ...draft, title: draft.title.trim(), updatedAt: new Date().toISOString() }) }
  const add = () => {
    const movie = onAdd()
    setSelectedId(movie.id)
    setDraft(movie)
  }
  const searchTmdb = async () => {
    if (!draft?.title.trim()) return
    setIsTmdbSearching(true); setTmdbError('')
    try { setTmdbResults(await onTmdbSearch(draft.title)) } catch (error) { setTmdbError(error instanceof Error ? error.message : 'TMDB 搜索失败。') } finally { setIsTmdbSearching(false) }
  }
  const applyTmdb = (result: TmdbMovieResult) => {
    setDraft((current) => current ? { ...current, title: result.title || current.title, originalTitle: result.originalTitle, year: result.year, director: result.director, coverUrl: result.coverUrl, tags: result.genres.length ? result.genres : current.tags } : current)
    setTmdbResults([])
  }

  if (isLoading) return <section className="movie-journal__loading">正在整理光影记录…</section>
  if (isWriting && draft) return <section className="movie-journal movie-journal--writing" aria-label="观后感沉浸写作">
    <aside className="movie-journal__rail movie-journal__rail--writing">
      <p className="movie-journal__eyebrow">FILM JOURNAL</p><h1>光影</h1><p>把看过的故事，写成自己的记忆。</p>
      <div className="movie-journal__filters">
        {(['all', 'wish', 'watched'] as const).map((item) => <button key={item} type="button" className={statusFilter === item ? 'is-active' : ''} onClick={() => { setStatusFilter(item); setIsWriting(false) }}>{item === 'all' ? `全部 · ${movies.length}` : `${statusLabel[item]} · ${movies.filter((movie) => movie.status === item).length}`}</button>)}
      </div>
    </aside>
    <section className="movie-journal__writing-canvas">
      <header className="movie-journal__writing-header">
        <div className="movie-journal__writing-film"><div className="movie-journal__writing-poster"><Cover movie={draft} /></div><div><p>观后感</p><h2>{draft.title || '未命名影片'}</h2><span>{[draft.year, draft.director].filter(Boolean).join(' · ') || '光影记录'}</span></div></div>
        <button type="button" className="movie-journal__writing-back" onClick={() => setIsWriting(false)}>← 返回影片</button>
      </header>
      <textarea className="movie-journal__writing-editor" value={draft.reflection} onChange={(event) => update('reflection', event.target.value)} placeholder="从一个镜头、一句台词，或一段当下的感受开始写……" autoFocus />
      <footer className="movie-journal__writing-footer"><span>{draft.reflection.trim().length} 字</span><button type="button" className="movie-journal__save" disabled={isSaving || !draft.title.trim()} onClick={save}>{isSaving ? '保存中…' : '保存观后感'}</button></footer>
    </section>
  </section>
  return <section className="movie-journal" aria-label="光影观影笔记">
    <aside className="movie-journal__rail">
      <p className="movie-journal__eyebrow">FILM JOURNAL</p><h1>光影</h1><p>把看过的故事，写成自己的记忆。</p><button type="button" className="movie-journal__new" onClick={add}>+ 留下观影笔记</button>
      <div className="movie-journal__filters">
        {(['all', 'wish', 'watched'] as const).map((item) => <button key={item} type="button" className={statusFilter === item ? 'is-active' : ''} onClick={() => setStatusFilter(item)}>{item === 'all' ? `全部 · ${movies.length}` : `${statusLabel[item]} · ${movies.filter((movie) => movie.status === item).length}`}</button>)}
      </div>
    </aside>
    <div className="movie-journal__gallery">
      {filtered.length === 0 ? <div className="movie-journal__empty"><span>✦</span><h2>留下一部电影</h2><p>从片名和一段观后感开始就好。</p></div> : filtered.map((movie) => <button type="button" key={movie.id} className={`movie-journal__card${selectedId === movie.id ? ' is-selected' : ''}`} onClick={() => setSelectedId(movie.id)}><div className="movie-journal__cover"><Cover movie={movie} /><span>{statusLabel[movie.status]}</span></div><strong>{movie.title}</strong><small>{movie.year || '未标年份'} {movie.rating ? `· ${'★'.repeat(movie.rating)}` : ''}</small></button>)}
    </div>
    <section className="movie-journal__detail">
      {!draft ? <div className="movie-journal__detail-empty"><span>◌</span><h2>选择一部电影</h2><p>让感想成为这张卡片的主角。</p></div> : <div className="movie-journal__form">
        <div className="movie-journal__form-head"><p>观影笔记</p><button type="button" onClick={() => onDelete(draft)}>删除</button></div>
        <div className="movie-journal__title-input"><div className="movie-journal__title-search"><input value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="影片名称" /><button type="button" disabled={!draft.title.trim() || isTmdbSearching} onClick={() => { void searchTmdb() }}>{isTmdbSearching ? '检索中…' : 'TMDB 补全'}</button></div><input value={draft.originalTitle} onChange={(event) => update('originalTitle', event.target.value)} placeholder="原名（可选）" />{tmdbError ? <p className="movie-journal__tmdb-error">{tmdbError}</p> : null}{tmdbResults.length ? <div className="movie-journal__tmdb-results">{tmdbResults.map((result) => <button key={result.id} type="button" onClick={() => applyTmdb(result)}>{result.coverUrl ? <img src={result.coverUrl} alt="" /> : <span>影</span>}<span><strong>{result.title}</strong><small>{[result.year, result.director].filter(Boolean).join(' · ') || '暂无资料'}</small></span></button>)}</div> : null}</div>
        <div className="movie-journal__meta-grid"><label><span className="movie-journal__meta-label"><MetaIcon type="status" />状态</span><FilterSelect label="观影状态" value={draft.status} options={[{ value: 'watched', label: '已看' }, { value: 'wish', label: '想看' }]} onChange={(value) => update('status', value as MovieStatus)} searchable={false} triggerAriaLabel="选择观影状态" /></label><label><span className="movie-journal__meta-label"><MetaIcon type="date" />观影日期</span><MovieDatePicker value={draft.watchedAt} onChange={(value) => update('watchedAt', value)} ariaLabel="选择观影日期" /></label><label><span className="movie-journal__meta-label"><MetaIcon type="rating" />个人评分</span><FilterSelect label="个人评分" value={draft.rating?.toString() || ''} options={[{ value: '', label: '未评分' }, ...[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: '★'.repeat(value) }))]} onChange={(value) => update('rating', value ? Number(value) : null)} searchable={false} triggerAriaLabel="选择个人评分" /></label><label><span className="movie-journal__meta-label"><MetaIcon type="year" />年份</span><input value={draft.year} onChange={(event) => update('year', event.target.value)} placeholder="2026" /></label><label><span className="movie-journal__meta-label"><MetaIcon type="director" />导演</span><input value={draft.director} onChange={(event) => update('director', event.target.value)} placeholder="导演" /></label><label><span className="movie-journal__meta-label"><MetaIcon type="tags" />标签</span><input value={draft.tags.join('、')} onChange={(event) => update('tags', event.target.value.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean))} placeholder="孤独、家庭" /></label></div>
        {draft.coverUrl ? <a className="movie-journal__tmdb-source" href={draft.coverUrl} target="_blank" rel="noreferrer">资料来自 TMDB ↗</a> : null}
        <section className="movie-journal__reflection"><div className="movie-journal__reflection-header"><span>观后感</span><button type="button" onClick={() => setIsWriting(true)} aria-label="沉浸写作" title="沉浸写作"><ExpandIcon /></button></div><textarea value={draft.reflection} onChange={(event) => update('reflection', event.target.value)} placeholder="有些电影值得立刻写下。此刻的感受、记住的镜头、后来才明白的事……" /></section>
        <button type="button" className="movie-journal__save" disabled={isSaving || !draft.title.trim()} onClick={save}>{isSaving ? '保存中…' : '保存观影笔记'}</button>
      </div>}
    </section>
  </section>
}
