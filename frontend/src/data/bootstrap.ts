import type { EntryRow } from '@/data/types'
import {
  ENTRIES_SCHEMA_KEY,
  ENTRIES_SCHEMA_VERSION,
  LIFECYCLE_SCHEMA_KEY,
  LIFECYCLE_SCHEMA_VERSION,
  migrateEntries,
  migrateLifecycleRuntime,
  seedExperiments,
} from '@/data/migrate'
import { SEED_ROWS } from '@/data/seed'
import type { LifecycleRuntime } from '@/domain/lifecycle'

/**
 * 升级迁移：在数据层播种之前先跑一遍，保证旧 localStorage 数据补齐新字段。
 * 版本号跟着迁移脚本一起升级，重复打开不会重复迁移；迁移失败不影响启动。
 */

export type BootstrapReport = {
  entriesUpgraded: boolean
  lifecycleUpgraded: boolean
  notes: string[]
}

const ENTRIES_KEY = 'data-product-ops:entries'
const RUNTIME_KEY = 'data-product-ops:lifecycle-runtime'
const EXPERIMENT_KEY = 'data-product-ops:lifecycle-experiments'

function storage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  return window.localStorage
}

function readVersion(store: Storage, key: string): number {
  const raw = store.getItem(key)
  const parsed = raw === null ? 0 : Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * 旧的 entries 数据没有 schema 标记：已经有 entries 但版本号是 0，
 * 说明是升级前写入的，需要迁移；全新用户直接把版本号写成当前值。
 */
export function bootstrapLocalData(): BootstrapReport {
  const store = storage()
  const report: BootstrapReport = { entriesUpgraded: false, lifecycleUpgraded: false, notes: [] }
  if (!store) {
    return report
  }

  const hasEntries = store.getItem(ENTRIES_KEY) !== null
  const entriesFrom = readVersion(store, ENTRIES_SCHEMA_KEY)
  if (hasEntries && entriesFrom < ENTRIES_SCHEMA_VERSION) {
    try {
      const raw = store.getItem(ENTRIES_KEY)
      const rows = raw
        ? (JSON.parse(raw) as Record<string, EntryRow[]>)
        : (SEED_ROWS as Record<string, EntryRow[]>)
      const migrated = migrateEntries(rows, entriesFrom)
      store.setItem(ENTRIES_KEY, JSON.stringify(migrated.rows))
      store.setItem(ENTRIES_SCHEMA_KEY, String(migrated.toVersion))
      report.entriesUpgraded = true
      report.notes.push(...migrated.notes)
    } catch {
      // 迁移失败不影响启动：local-store 会退回示例数据。
    }
  } else if (!hasEntries) {
    store.setItem(ENTRIES_SCHEMA_KEY, String(ENTRIES_SCHEMA_VERSION))
  }

  const hasRuntime = store.getItem(RUNTIME_KEY) !== null
  const runtimeFrom = readVersion(store, LIFECYCLE_SCHEMA_KEY)
  if (hasRuntime && runtimeFrom < LIFECYCLE_SCHEMA_VERSION) {
    try {
      const raw = store.getItem(RUNTIME_KEY)
      if (raw) {
        const migrated = migrateLifecycleRuntime(JSON.parse(raw) as LifecycleRuntime)
        store.setItem(RUNTIME_KEY, JSON.stringify(migrated.runtime))
        report.notes.push(...migrated.notes)
      }
      if (store.getItem(EXPERIMENT_KEY) === null) {
        store.setItem(EXPERIMENT_KEY, JSON.stringify(seedExperiments()))
      }
      store.setItem(LIFECYCLE_SCHEMA_KEY, String(LIFECYCLE_SCHEMA_VERSION))
      report.lifecycleUpgraded = true
    } catch {
      // 同上：保留旧数据，由运行时兜底。
    }
  } else if (!hasRuntime) {
    store.setItem(LIFECYCLE_SCHEMA_KEY, String(LIFECYCLE_SCHEMA_VERSION))
  }

  return report
}
