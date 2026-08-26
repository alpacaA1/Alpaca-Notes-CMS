export type SelfObservationKind = 'emotion' | 'behavior'

export interface EmotionCheckinData {
  emotions: string[] // 1~3 items
  intensity?: number // 1~10, optional
  event?: string // 发生了什么
  intention?: string // 我想
}

export interface BehaviorRecordData {
  behaviors: string[] // 1~3 items
  actualEvent?: string // 实际发生了什么
}

export interface SelfObservationRecord {
  id: string
  kind: SelfObservationKind
  createdAt: string // ISO string
  data: EmotionCheckinData | BehaviorRecordData
}

export interface SelfObservationOutboxItem {
  id: string
  record: SelfObservationRecord
  createdAt: string
  status: 'pending' | 'syncing' | 'failed'
  error?: string
}

export const DEFAULT_PRIMARY_EMOTIONS = [
  '烦',
  '紧张',
  '尴尬',
  '失望',
  '开心',
  '放松',
  '说不清',
  '其他',
] as const

export const DEFAULT_DRAWER_EMOTIONS = {
  negative: ['委屈', '内疚', '焦虑', '无力', '疲倦', '被忽视', '挫败', '自责', '难堪', '压抑'],
  positive: ['平静', '踏实', '满足', '感激', '期待', '释怀', '好奇', '充满希望'],
} as const

export const DEFAULT_INTENTIONS = [
  '表达',
  '停一下',
  '离开',
  '确认',
  '暂不处理',
] as const

export const DEFAULT_BEHAVIORS = [
  '表达需求',
  '承认不知道',
  '分享自己',
  '先确认再建议',
  '没有立即解释',
  '及时停止',
] as const
