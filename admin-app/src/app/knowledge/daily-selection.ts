import type { PostIndexItem } from '../posts/post-types'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function hashValue(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function pickDailyKnowledgeItems(
  items: PostIndexItem[],
  limit = 15,
  date = new Date(),
) {
  const effectiveLimit = Math.max(0, Math.floor(limit))
  const seed = getDateKey(date)

  return [...items]
    .sort((left, right) => {
      const leftScore = hashValue(`${seed}:${left.path}`)
      const rightScore = hashValue(`${seed}:${right.path}`)

      if (leftScore !== rightScore) {
        return leftScore - rightScore
      }

      return left.path.localeCompare(right.path, 'zh-CN')
    })
    .slice(0, effectiveLimit)
}
