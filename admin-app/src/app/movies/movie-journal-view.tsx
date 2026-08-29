import { useEffect, useMemo, useState } from 'react'
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

export default function MovieJournalView({ movies, search, isLoading, isSaving, onAdd, onTmdbSearch, onSave, onDelete }: Props) {
  const [statusFilter, setStatusFilter] = useState<'all' | MovieStatus>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = movies.find((movie) => movie.id === selectedId) || null
  const [draft, setDraft] = useState<MovieEntry | null>(null)
  const [tmdbResults, setTmdbResults] = useState<TmdbMovieResult[]>([])
  const [isTmdbSearching, setIsTmdbSearching] = useState(false)
  const [tmdbError, setTmdbError] = useState('')

  useEffect(() => { setDraft(selected) }, [selected])
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
        <div className="movie-journal__meta-grid"><label>状态<select value={draft.status} onChange={(event) => update('status', event.target.value as MovieStatus)}><option value="watched">已看</option><option value="wish">想看</option></select></label><label>观影日期<input type="date" value={draft.watchedAt} onChange={(event) => update('watchedAt', event.target.value)} /></label><label>个人评分<select value={draft.rating ?? ''} onChange={(event) => update('rating', event.target.value ? Number(event.target.value) : null)}><option value="">未评分</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{'★'.repeat(value)}</option>)}</select></label><label>年份<input value={draft.year} onChange={(event) => update('year', event.target.value)} placeholder="2026" /></label><label>导演<input value={draft.director} onChange={(event) => update('director', event.target.value)} placeholder="导演" /></label><label>标签<input value={draft.tags.join('、')} onChange={(event) => update('tags', event.target.value.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean))} placeholder="孤独、家庭" /></label></div>
        <label className="movie-journal__cover-url">海报链接<input value={draft.coverUrl} onChange={(event) => update('coverUrl', event.target.value)} placeholder="可稍后通过 TMDB 自动补全" /></label>
        <label className="movie-journal__reflection"><span>观后感</span><textarea value={draft.reflection} onChange={(event) => update('reflection', event.target.value)} placeholder="有些电影值得立刻写下。此刻的感受、记住的镜头、后来才明白的事……" /></label>
        <button type="button" className="movie-journal__save" disabled={isSaving || !draft.title.trim()} onClick={save}>{isSaving ? '保存中…' : '保存观影笔记'}</button>
      </div>}
    </section>
  </section>
}
