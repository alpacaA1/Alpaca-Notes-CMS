import { useEffect, useMemo, useRef, useState } from 'react'
import type { PersonEntry } from './people-types'

type Props = {
  people: PersonEntry[]
  search: string
  isLoading: boolean
  isSaving: boolean
  mentionCounts: Record<string, number>
  selectedPersonId?: string | null
  onAdd: () => PersonEntry
  onSave: (person: PersonEntry) => void
  onDelete: (person: PersonEntry) => void
}

function Portrait({ person }: { person: PersonEntry }) {
  const initial = person.name.trim().slice(0, 1) || '人'
  return <span className="people-book__portrait" aria-hidden="true">{initial}</span>
}

function PersonIcon({ type }: { type: 'profile' | 'tag' | 'birthday' | 'note' | 'mention' }) {
  const common = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true }
  if (type === 'profile') return <svg {...common}><circle cx="8" cy="5.25" r="2.45" stroke="currentColor" strokeWidth="1.25"/><path d="M3.2 13.1c.35-2.35 2.22-3.68 4.8-3.68s4.45 1.33 4.8 3.68" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>
  if (type === 'tag') return <svg {...common}><path d="M2.4 7.55V3h4.55l6.65 6.65-4.45 4.45L2.4 7.55Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><circle cx="5.3" cy="5.28" r=".85" fill="currentColor"/></svg>
  if (type === 'birthday') return <svg {...common}><rect x="2.55" y="3.35" width="10.9" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><path d="M5 2v2.5M11 2v2.5M2.65 6.25h10.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
  if (type === 'mention') return <svg {...common}><path d="M13.4 8A5.4 5.4 0 1 1 8 2.6c2.98 0 5.4 2.15 5.4 5.12 0 1.65-.76 2.67-1.85 2.67-.78 0-1.25-.44-1.35-.98-.5.65-1.25 1.02-2.16 1.02-1.63 0-2.72-1.2-2.72-2.87 0-1.68 1.13-2.9 2.7-2.9.9 0 1.62.35 2.08.97V4.9h1.22v4.7c0 .47.2.68.55.68.52 0 .91-.7.91-1.97C12.78 5.68 10.83 3.8 8 3.8A4.2 4.2 0 1 0 12.2 8" stroke="currentColor" strokeWidth="1.08" strokeLinecap="round" strokeLinejoin="round"/></svg>
  return <svg {...common}><path d="M3.1 2.7h9.8v10.6H3.1z" stroke="currentColor" strokeWidth="1.2"/><path d="M5.2 6h5.6M5.2 8.4h5.6M5.2 10.8h3.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
}

function ExpandIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.05 2.5H2.5v3.55M9.95 2.5h3.55v3.55M6.05 13.5H2.5V9.95M9.95 13.5h3.55V9.95" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export default function PeopleBookView({ people, search, isLoading, isSaving, mentionCounts, selectedPersonId, onAdd, onSave, onDelete }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PersonEntry | null>(null)
  const [moment, setMoment] = useState('')
  const [momentDate, setMomentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [isNotesExpanded, setIsNotesExpanded] = useState(false)
  const notesCanvasRef = useRef<HTMLElement | null>(null)
  const expandedNotesRef = useRef<HTMLTextAreaElement | null>(null)
  const selected = people.find((person) => person.id === selectedId) || null

  useEffect(() => { setDraft(selected); setMoment(''); setIsNotesExpanded(false) }, [selected])
  useEffect(() => {
    if (selectedPersonId && people.some((person) => person.id === selectedPersonId)) {
      setSelectedId(selectedPersonId)
    }
  }, [people, selectedPersonId])
  const growExpandedNotes = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`

    const canvas = notesCanvasRef.current
    if (!canvas) return
    const textareaBottom = textarea.offsetTop + textarea.offsetHeight + 24
    if (textareaBottom > canvas.scrollTop + canvas.clientHeight) {
      canvas.scrollTop = textareaBottom - canvas.clientHeight
    }
  }
  useEffect(() => {
    if (isNotesExpanded && expandedNotesRef.current) {
      growExpandedNotes(expandedNotesRef.current)
    }
  }, [draft?.notes, isNotesExpanded])
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return people
    return people.filter((person) => [person.name, person.aliases.join(' '), person.relationship, person.tags.join(' '), person.notes].join(' ').toLocaleLowerCase().includes(query))
  }, [people, search])
  const update = <K extends keyof PersonEntry>(key: K, value: PersonEntry[K]) => setDraft((current) => current ? { ...current, [key]: value } : current)
  const add = () => {
    const person = onAdd()
    setSelectedId(person.id)
    setDraft(person)
  }
  const appendMoment = () => {
    if (!moment.trim()) return
    const now = new Date().toISOString()
    setDraft((current) => current ? {
      ...current,
      moments: [{ id: `moment-${Date.now().toString(36)}`, date: momentDate, content: moment.trim(), createdAt: now }, ...current.moments],
    } : current)
    setMoment('')
  }
  const removeMoment = (id: string) => setDraft((current) => current ? { ...current, moments: current.moments.filter((item) => item.id !== id) } : current)
  const save = () => {
    if (!draft?.name.trim()) return
    onSave({ ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() })
  }

  if (isLoading) return <section className="people-book__loading">正在打开人物簿…</section>
  if (isNotesExpanded && draft) return <section className="people-book people-book--notes-writing" aria-label="人物近况沉浸输入">
    <aside className="people-book__rail"><p>PRIVATE INDEX</p><h1>人物簿</h1><span>把相处的片段留在这里。</span></aside>
    <section ref={notesCanvasRef} className="people-book__notes-canvas">
      <header><div><p>关于他 / 她</p><h2>{draft.name || '未命名人物'}</h2></div><button type="button" onClick={() => setIsNotesExpanded(false)}>← 返回人物卡</button></header>
      <textarea ref={expandedNotesRef} value={draft.notes} onChange={(event) => { update('notes', event.target.value); growExpandedNotes(event.currentTarget) }} placeholder="想记住的习惯、近况、共同经历……" autoFocus />
      <footer><span>{draft.notes.trim().length} 字</span><button type="button" className="people-book__save" disabled={isSaving || !draft.name.trim()} onClick={save}>{isSaving ? '保存中…' : '保存人物卡'}</button></footer>
    </section>
  </section>
  return <section className="people-book" aria-label="人物簿">
    <aside className="people-book__rail">
      <p>PRIVATE INDEX</p><h1>人物簿</h1><span>把相处的片段留在这里。</span>
      <button type="button" className="people-book__new" onClick={add}>+ 新建人物卡</button>
      <small>{people.length} 位人物</small>
    </aside>
    <section className="people-book__list">
      {filtered.length === 0 ? <div className="people-book__empty"><strong>还没有人物卡</strong><span>从一个名字和一段近况开始。</span></div> : filtered.map((person) => <button key={person.id} type="button" className={`people-book__card${selectedId === person.id ? ' is-selected' : ''}`} onClick={() => setSelectedId(person.id)}><Portrait person={person}/><span><strong>{person.name || '未命名人物'}</strong><small>{person.relationship || person.aliases[0] || '等待写下第一段记忆'}</small></span><em>{mentionCounts[person.id] || 0}</em></button>)}
    </section>
    <section className="people-book__detail">
      {!draft ? <div className="people-book__detail-empty"><Portrait person={{ name: '人' } as PersonEntry}/><h2>选择一个人</h2><p>记录关系、近况与被文章提起的时刻。</p></div> : <div className="people-book__form">
        <header><p>人物卡</p><button type="button" onClick={() => onDelete(draft)}>删除</button></header>
        <div className="people-book__heading"><Portrait person={draft}/><input value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="名字或称呼" /></div>
        <label className="people-book__birthday-field"><span><PersonIcon type="birthday"/>生日</span><input type="date" value={draft.birthday} onChange={(event) => update('birthday', event.target.value)} /></label>
        <div className="people-book__meta-grid">
          <label><span><PersonIcon type="profile"/>关系</span><input value={draft.relationship} onChange={(event) => update('relationship', event.target.value)} placeholder="朋友、同事、家人…" /></label>
          <label><span><PersonIcon type="tag"/>别名</span><input value={draft.aliases.join('、')} onChange={(event) => update('aliases', event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean))} placeholder="昵称、外号" /></label>
          <label><span><PersonIcon type="tag"/>标签</span><input value={draft.tags.join('、')} onChange={(event) => update('tags', event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean))} placeholder="旅行、大学、摄影" /></label>
        </div>
        <section className="people-book__notes"><div className="people-book__notes-head"><span><PersonIcon type="note"/>关于他 / 她</span><button type="button" onClick={() => setIsNotesExpanded(true)} aria-label="展开输入" title="展开输入"><ExpandIcon/></button></div><textarea value={draft.notes} onChange={(event) => update('notes', event.target.value)} placeholder="想记住的习惯、近况、共同经历……" /></section>
        <section className="people-book__moments"><div className="people-book__section-head"><span>日常片段</span><small><PersonIcon type="mention"/>{mentionCounts[draft.id] || 0} 次文章提及</small></div><div className="people-book__moment-composer"><input type="date" value={momentDate} onChange={(event) => setMomentDate(event.target.value)} /><textarea value={moment} onChange={(event) => setMoment(event.target.value)} placeholder="今天发生了什么？" /><button type="button" onClick={appendMoment} disabled={!moment.trim()}>记下</button></div>{draft.moments.length ? <div className="people-book__moment-list">{draft.moments.map((item) => <article key={item.id}><time>{item.date}</time><p>{item.content}</p><button type="button" onClick={() => removeMoment(item.id)} aria-label="删除这条日常记录">×</button></article>)}</div> : <p className="people-book__moment-empty">日常会慢慢长成你们的时间线。</p>}</section>
        <button type="button" className="people-book__save" disabled={isSaving || !draft.name.trim()} onClick={save}>{isSaving ? '保存中…' : '保存人物卡'}</button>
      </div>}
    </section>
  </section>
}
