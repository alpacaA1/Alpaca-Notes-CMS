import { useEffect, useMemo, useState } from 'react'
import MarkdownEditor from '../editor/markdown-editor'
import type { InternalReferenceCandidate } from '../internal-links'
import FilterSelect from '../layout/filter-select'
import TaxonomyMultiSelect from '../layout/taxonomy-multi-select'
import MovieDatePicker from '../movies/movie-date-picker'
import type { PersonEntry, PersonMoment } from './people-types'

type Props = {
  people: PersonEntry[]
  search: string
  isLoading: boolean
  isSaving: boolean
  mentionCounts: Record<string, number>
  selectedPersonId?: string | null
  internalReferenceCandidates?: InternalReferenceCandidate[]
  onAdd: () => PersonEntry
  onSave: (person: PersonEntry) => void
  onDelete: (person: PersonEntry) => void
}

function Portrait({ person }: { person: PersonEntry }) {
  const initial = person.name.trim().slice(0, 1) || '人'
  return <span className="people-book__portrait" aria-hidden="true">{initial}</span>
}

function PersonIcon({ type }: { type: 'profile' | 'tag' | 'birthday' | 'note' | 'mention' | 'sparkles' | 'compass' }) {
  const common = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true }
  if (type === 'profile') return <svg {...common}><circle cx="8" cy="5.25" r="2.45" stroke="currentColor" strokeWidth="1.25"/><path d="M3.2 13.1c.35-2.35 2.22-3.68 4.8-3.68s4.45 1.33 4.8 3.68" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>
  if (type === 'tag') return <svg {...common}><path d="M2.4 7.55V3h4.55l6.65 6.65-4.45 4.45L2.4 7.55Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><circle cx="5.3" cy="5.28" r=".85" fill="currentColor"/></svg>
  if (type === 'birthday') return <svg {...common}><rect x="2.55" y="3.35" width="10.9" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><path d="M5 2v2.5M11 2v2.5M2.65 6.25h10.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
  if (type === 'mention') return <svg {...common}><path d="M13.4 8A5.4 5.4 0 1 1 8 2.6c2.98 0 5.4 2.15 5.4 5.12 0 1.65-.76 2.67-1.85 2.67-.78 0-1.25-.44-1.35-.98-.5.65-1.25 1.02-2.16 1.02-1.63 0-2.72-1.2-2.72-2.87 0-1.68 1.13-2.9 2.7-2.9.9 0 1.62.35 2.08.97V4.9h1.22v4.7c0 .47.2.68.55.68.52 0 .91-.7.91-1.97C12.78 5.68 10.83 3.8 8 3.8A4.2 4.2 0 1 0 12.2 8" stroke="currentColor" strokeWidth="1.08" strokeLinecap="round" strokeLinejoin="round"/></svg>
  if (type === 'sparkles') return <svg {...common}><path d="m8 2 1.4 3.7L13 7.1l-3.6 1.4L8 12.2l-1.4-3.7L3 7.1l3.6-1.4L8 2Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
  if (type === 'compass') return <svg {...common}><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/><polygon points="8,4.5 9.7,7.2 11.5,8 8.8,8.8 8,11.5 7.2,8.8 4.5,8 7.2,7.2" fill="currentColor"/></svg>
  return <svg {...common}><path d="M3.1 2.7h9.8v10.6H3.1z" stroke="currentColor" strokeWidth="1.2"/><path d="M5.2 6h5.6M5.2 8.4h5.6M5.2 10.8h3.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
}

function ExpandIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.05 2.5H2.5v3.55M9.95 2.5h3.55v3.55M6.05 13.5H2.5V9.95M9.95 13.5h3.55V9.95" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

const RELATIONSHIP_OPTIONS = ['朋友', '同事', '同学', '家人', '伴侣', '合作伙伴', '认识的人']

export default function PeopleBookView({ people, search, isLoading, isSaving, mentionCounts, selectedPersonId, internalReferenceCandidates = [], onAdd, onSave, onDelete }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PersonEntry | null>(null)

  // 瞬间结构化输入状态
  const [momentHappened, setMomentHappened] = useState('')
  const [momentFeeling, setMomentFeeling] = useState('')
  const [momentUncertain, setMomentUncertain] = useState('')
  const [momentDate, setMomentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [isFastInput, setIsFastInput] = useState(false)
  const [fastInputText, setFastInputText] = useState('')

  // 认识状态
  const [isEditingUnderstanding, setIsEditingUnderstanding] = useState(false)
  const [isNotesExpanded, setIsNotesExpanded] = useState(false)

  // 纳入当前认识的微确认弹层状态
  const [incorporatingMomentId, setIncorporatingMomentId] = useState<string | null>(null)
  const [incorporatingSummary, setIncorporatingSummary] = useState('')

  const selected = people.find((person) => person.id === selectedId) || null

  useEffect(() => {
    setDraft(selected)
    setMomentHappened('')
    setMomentFeeling('')
    setMomentUncertain('')
    setFastInputText('')
    setIsFastInput(false)
    setIsEditingUnderstanding(false)
    setIsNotesExpanded(false)
    setIncorporatingMomentId(null)
  }, [selected])

  useEffect(() => {
    if (selectedPersonId && people.some((person) => person.id === selectedPersonId)) {
      setSelectedId(selectedPersonId)
    }
  }, [people, selectedPersonId])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return people
    return people.filter((person) => [person.name, person.aliases.join(' '), person.relationship, person.tags.join(' '), person.notes].join(' ').toLocaleLowerCase().includes(query))
  }, [people, search])

  const relationshipOptions = useMemo(() => Array.from(new Set([
    ...RELATIONSHIP_OPTIONS,
    draft?.relationship.trim() || '',
  ].filter(Boolean))).map((value) => ({ value, label: value })), [draft?.relationship])

  const availableTags = useMemo(() => Array.from(new Set(people.flatMap((person) => person.tags))).sort((left, right) => left.localeCompare(right, 'zh-CN')), [people])

  const update = <K extends keyof PersonEntry>(key: K, value: PersonEntry[K]) => setDraft((current) => current ? { ...current, [key]: value } : current)

  const add = () => {
    const person = onAdd()
    setSelectedId(person.id)
    setDraft(person)
  }

  const appendMoment = () => {
    const happened = isFastInput ? fastInputText.trim() : momentHappened.trim()
    if (!happened) return
    const now = new Date().toISOString()
    const newMoment: PersonMoment = {
      id: `moment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      date: momentDate,
      happened,
      feeling: isFastInput ? undefined : (momentFeeling.trim() || undefined),
      uncertain: isFastInput ? undefined : (momentUncertain.trim() || undefined),
      createdAt: now,
    }
    setDraft((current) => current ? {
      ...current,
      moments: [newMoment, ...current.moments],
    } : current)
    setMomentHappened('')
    setMomentFeeling('')
    setMomentUncertain('')
    setFastInputText('')
  }

  const removeMoment = (id: string) => {
    setDraft((current) => current ? { ...current, moments: current.moments.filter((item) => item.id !== id) } : current)
    if (incorporatingMomentId === id) setIncorporatingMomentId(null)
  }

  const handleStartIncorporate = (item: PersonMoment) => {
    const happenedText = item.happened || item.content || ''
    // 默认提炼建议格式
    const initialSummary = `- ${happenedText}`
    setIncorporatingMomentId(item.id)
    setIncorporatingSummary(initialSummary)
  }

  const handleConfirmIncorporate = (id: string) => {
    if (!draft || !incorporatingSummary.trim()) return
    const now = new Date().toISOString()
    const bullet = incorporatingSummary.trim()
    const updatedNotes = draft.notes.trim() ? `${draft.notes.trim()}\n${bullet}` : bullet

    const updatedMoments = draft.moments.map((m) => m.id === id ? { ...m, incorporatedAt: now } : m)

    setDraft({
      ...draft,
      notes: updatedNotes,
      moments: updatedMoments,
    })
    setIncorporatingMomentId(null)
  }

  const save = () => {
    if (!draft?.name.trim()) return
    onSave({ ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() })
  }

  if (isLoading) return <section className="people-book__loading">正在打开人物簿…</section>

  if (isNotesExpanded && draft) return (
    <section className="people-book people-book--notes-writing" aria-label="人物近况沉浸输入">
      <aside className="people-book__rail">
        <p>PRIVATE INDEX</p>
        <h1>人物簿</h1>
        <span>把相处的片段留在这里。</span>
      </aside>
      <section className="people-book__notes-canvas">
        <header>
          <div>
            <p>我目前认识到的他 / 她</p>
            <h2>{draft.name || '未命名人物'}</h2>
          </div>
          <button type="button" onClick={() => setIsNotesExpanded(false)}>← 返回人物卡</button>
        </header>
        <MarkdownEditor value={draft.notes} onChange={(value) => update('notes', value)} internalReferenceCandidates={internalReferenceCandidates} />
        <footer>
          <span>{draft.notes.trim().length} 字</span>
          <button type="button" className="people-book__save" disabled={isSaving || !draft.name.trim()} onClick={save}>
            {isSaving ? '保存中…' : '保存人物卡'}
          </button>
        </footer>
      </section>
    </section>
  )

  return (
    <section className="people-book" aria-label="人物簿">
      <aside className="people-book__rail">
        <p>PRIVATE INDEX</p>
        <h1>人物簿</h1>
        <span>把相处的片段留在这里。</span>
        <button type="button" className="people-book__new" onClick={add}>+ 新建人物卡</button>
        <small>{people.length} 位人物</small>
      </aside>

      <section className="people-book__list">
        {filtered.length === 0 ? (
          <div className="people-book__empty">
            <strong>还没有人物卡</strong>
            <span>从一个名字和一段近况开始。</span>
          </div>
        ) : (
          filtered.map((person) => (
            <button
              key={person.id}
              type="button"
              className={`people-book__card${selectedId === person.id ? ' is-selected' : ''}`}
              onClick={() => setSelectedId(person.id)}
            >
              <Portrait person={person} />
              <span>
                <strong>{person.name || '未命名人物'}</strong>
                <small>{person.relationship || person.aliases[0] || '等待写下第一段记忆'}</small>
              </span>
              <em>{mentionCounts[person.id] || 0}</em>
            </button>
          ))
        )}
      </section>

      <section className="people-book__detail">
        {!draft ? (
          <div className="people-book__detail-empty">
            <Portrait person={{ name: '人' } as PersonEntry} />
            <h2>选择一个人</h2>
            <p>记录关系、近况与被文章提起的时刻。</p>
          </div>
        ) : (
          <div className="people-book__form">
            <header>
              <p>人物卡</p>
              <button type="button" onClick={() => onDelete(draft)}>删除</button>
            </header>

            <div className="people-book__heading">
              <Portrait person={draft} />
              <input value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="名字或称呼" />
            </div>

            <div className="people-book__birthday-field">
              <span><PersonIcon type="birthday" />生日</span>
              <MovieDatePicker
                value={draft.birthday}
                onChange={(value) => update('birthday', value)}
                ariaLabel="选择生日"
                dialogLabel="选择生日"
              />
            </div>

            <div className="people-book__meta-grid">
              <label>
                <span><PersonIcon type="profile" />关系</span>
                <FilterSelect
                  label="关系"
                  value={draft.relationship}
                  options={relationshipOptions}
                  onChange={(value) => update('relationship', value)}
                  placeholder="选择关系"
                  triggerAriaLabel="选择关系"
                />
              </label>
              <label>
                <span><PersonIcon type="tag" />别名</span>
                <input
                  value={draft.aliases.join('、')}
                  onChange={(event) => update('aliases', event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean))}
                  placeholder="昵称、外号"
                />
              </label>
              <label>
                <span><PersonIcon type="tag" />标签</span>
                <TaxonomyMultiSelect
                  label="标签"
                  value={draft.tags}
                  availableOptions={availableTags}
                  onChange={(value) => update('tags', value)}
                  onCreateOption={(name) => update('tags', Array.from(new Set([...draft.tags, name])))}
                />
              </label>
            </div>

            {/* 核心层一：我目前认识到的他 / 她（稳定认知层） */}
            <section className="people-book__understanding" aria-label="我目前认识到的他 / 她">
              <div className="people-book__understanding-head">
                <span className="people-book__understanding-title">
                  <PersonIcon type="compass" />
                  我目前认识到的他 / 她
                </span>
                <div className="people-book__understanding-actions">
                  <button
                    type="button"
                    onClick={() => setIsEditingUnderstanding((prev) => !prev)}
                    className="people-book__text-btn"
                  >
                    {isEditingUnderstanding ? '完成' : '编辑'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNotesExpanded(true)}
                    aria-label="展开输入"
                    title="展开输入"
                    className="people-book__expand-btn"
                  >
                    <ExpandIcon />
                  </button>
                </div>
              </div>

              {isEditingUnderstanding ? (
                <div className="people-book__notes">
                  <textarea
                    value={draft.notes}
                    onChange={(event) => update('notes', event.target.value)}
                    placeholder="想记住的相对稳定特质、相处边界、当前认识……（支持 Markdown 列表）"
                    rows={4}
                  />
                </div>
              ) : draft.notes.trim() ? (
                <div className="people-book__understanding-body">
                  {draft.notes}
                </div>
              ) : (
                <p className="people-book__understanding-empty">
                  暂无沉淀认知。记录多个瞬间后，可将反复印证的模式「纳入当前认识」，或点击上方编辑写下第一笔印象。
                </p>
              )}
            </section>

            {/* 输入层：＋ 记录一个新的瞬间 */}
            <section className="people-book__moment-composer-card">
              <div className="people-book__moment-composer-head">
                <span className="people-book__moment-composer-title">
                  <strong>＋</strong> 记录一个新的瞬间
                </span>
                <div className="people-book__moment-composer-switch">
                  <button
                    type="button"
                    onClick={() => setIsFastInput((prev) => !prev)}
                    className="people-book__text-btn"
                  >
                    {isFastInput ? '切换为三段输入' : '切换为速记模式'}
                  </button>
                </div>
              </div>

              {isFastInput ? (
                <div className="people-book__moment-field">
                  <label htmlFor="people-fast-input">随手记下发生的瞬间</label>
                  <textarea
                    id="people-fast-input"
                    value={fastInputText}
                    onChange={(event) => setFastInputText(event.target.value)}
                    placeholder="不加修饰地写下今天注意到的一个具体反应或对话……"
                    rows={3}
                  />
                </div>
              ) : (
                <div className="people-book__moment-structured-fields">
                  <div className="people-book__moment-field">
                    <label htmlFor="people-moment-happened">发生了什么（客观事实）</label>
                    <textarea
                      id="people-moment-happened"
                      value={momentHappened}
                      onChange={(event) => setMomentHappened(event.target.value)}
                      placeholder="写下具体的互动或反应，如：工作时回复简短，下班后明显活跃分享生活……"
                      rows={2}
                    />
                  </div>

                  <div className="people-book__moment-grid">
                    <div className="people-book__moment-field">
                      <label htmlFor="people-moment-feeling">我的感受（与我的关系）</label>
                      <input
                        id="people-moment-feeling"
                        value={momentFeeling}
                        onChange={(event) => setMomentFeeling(event.target.value)}
                        placeholder="如：开始慢慢理解她在不同状态下的节奏……"
                      />
                    </div>
                    <div className="people-book__moment-field people-book__moment-field--uncertain">
                      <label htmlFor="people-moment-uncertain">我还不确定的（暂时猜测）</label>
                      <input
                        id="people-moment-uncertain"
                        value={momentUncertain}
                        onChange={(event) => setMomentUncertain(event.target.value)}
                        placeholder="如：是否因为工作专注度高，不喜欢公私状态频繁切换……"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="people-book__moment-composer-bottom">
                <div className="people-book__moment-date-picker">
                  <MovieDatePicker
                    value={momentDate}
                    onChange={(val) => setMomentDate(val)}
                    ariaLabel="日常片段日期"
                    dialogLabel="选择日常片段日期"
                  />
                </div>
                <button
                  type="button"
                  className="people-book__moment-submit-btn"
                  onClick={appendMoment}
                  disabled={isFastInput ? !fastInputText.trim() : !momentHappened.trim()}
                >
                  记下瞬间
                </button>
              </div>
            </section>

            {/* 核心层二：瞬间时间线 */}
            <section className="people-book__moments">
              <div className="people-book__section-head">
                <span>瞬间时间线</span>
                <small><PersonIcon type="mention" />{mentionCounts[draft.id] || 0} 次文章提及</small>
              </div>

              {draft.moments.length ? (
                <div className="people-book__moment-cards">
                  {draft.moments.map((item) => {
                    const happenedText = item.happened || item.content || ''
                    const isIncorporateActive = incorporatingMomentId === item.id

                    return (
                      <article key={item.id} className="people-book__moment-card">
                        <div className="people-book__moment-card-top">
                          <time className="people-book__moment-date">{item.date}</time>
                          <button
                            type="button"
                            onClick={() => removeMoment(item.id)}
                            aria-label="删除这条瞬间"
                            className="people-book__moment-del-btn"
                          >
                            ×
                          </button>
                        </div>

                        <div className="people-book__moment-details">
                          <div className="people-book__moment-row">
                            <span className="people-book__moment-tag">发生了什么</span>
                            <span className="people-book__moment-val">{happenedText}</span>
                          </div>

                          {item.feeling ? (
                            <div className="people-book__moment-row">
                              <span className="people-book__moment-tag">我的感受</span>
                              <span className="people-book__moment-val people-book__moment-val--feeling">{item.feeling}</span>
                            </div>
                          ) : null}

                          {item.uncertain ? (
                            <div className="people-book__moment-row">
                              <span className="people-book__moment-tag people-book__moment-tag--uncertain">暂时不确定</span>
                              <span className="people-book__moment-val people-book__moment-val--uncertain">{item.uncertain}</span>
                            </div>
                          ) : null}
                        </div>

                        {/* 纳入当前认识的确认区 */}
                        {isIncorporateActive ? (
                          <div className="people-book__incorporate-box">
                            <label htmlFor={`inc-input-${item.id}`}>提炼并追加至「我目前认识到的他 / 她」：</label>
                            <input
                              id={`inc-input-${item.id}`}
                              value={incorporatingSummary}
                              onChange={(event) => setIncorporatingSummary(event.target.value)}
                              placeholder="- 提炼出的阶段性认知"
                            />
                            <div className="people-book__incorporate-actions">
                              <button
                                type="button"
                                className="people-book__incorporate-confirm"
                                onClick={() => handleConfirmIncorporate(item.id)}
                              >
                                确认纳入
                              </button>
                              <button
                                type="button"
                                className="people-book__incorporate-cancel"
                                onClick={() => setIncorporatingMomentId(null)}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="people-book__moment-footer">
                            {item.incorporatedAt ? (
                              <span className="people-book__incorporated-badge">
                                已于 {item.incorporatedAt.slice(0, 10)} 纳入当前认识 ✓
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="people-book__incorporate-btn"
                                onClick={() => handleStartIncorporate(item)}
                              >
                                <span>纳入当前认识</span>
                                <span>↗</span>
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              ) : (
                <p className="people-book__moment-empty">瞬间会慢慢汇集成真实的时间线。</p>
              )}
            </section>

            <button
              type="button"
              className="people-book__save"
              disabled={isSaving || !draft.name.trim()}
              onClick={save}
            >
              {isSaving ? '保存中…' : '保存人物卡'}
            </button>
          </div>
        )}
      </section>
    </section>
  )
}
