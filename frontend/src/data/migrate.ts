import {
  EXPERIMENT_STORE_SEED,
  LIFECYCLE_RUNTIME_SEED,
  PLAN_CONFIG_SEED,
} from './lifecycle-seed'
import type { ExperimentStore, LifecycleRuntime, PlanConfigStore } from '../domain/lifecycle'
import type { EntryRow } from './types'

/**
 * 本地数据迁移。
 *
 * 纯前端项目的「数据库」就是浏览器 localStorage：
 * - `data-product-ops:entries` 存各业务模块清单；
 * - `data-product-ops:lifecycle-*` 存生命周期运行时、分流方案与实验结果。
 *
 * 升级后首次打开时按版本号迁移。迁移只补字段 / 替换仍是旧占位符的示例行，
 * 用户已经改过的数据保持不动，可重复执行。
 */

export const ENTRIES_SCHEMA_VERSION = 3
export const LIFECYCLE_SCHEMA_VERSION = 2

export const ENTRIES_SCHEMA_KEY = 'data-product-ops:entries-schema'
export const LIFECYCLE_SCHEMA_KEY = 'data-product-ops:lifecycle-schema'

export type MigrationReport = {
  entriesFrom: number
  entriesTo: number
  lifecycleFrom: number
  lifecycleTo: number
  notes: string[]
}

const ABGROUP_FIELDS = ['阶段版本', '名单生成时间']

function isOldPlaceholder(value: unknown, markers: string[]): boolean {
  return typeof value === 'string' && markers.some((marker) => value.includes(marker))
}

function patchAbgroupRow(row: EntryRow): { row: EntryRow; changed: boolean } {
  const next: EntryRow = { ...row }
  let changed = false
  for (const field of ABGROUP_FIELDS) {
    if (next[field] === undefined) {
      next[field] = '—'
      changed = true
    }
  }
  if (String(row['方案编号']) === 'ABGR-0002' && isOldPlaceholder(row['白名单用户'], ['分流配置样例'])) {
    Object.assign(next, {
      方案名称: '生命周期分层实验',
      分流类型: '生命周期分层分流',
      分流比例: '回归 配置 40% · 实际 33.3%',
      分组标识: 'A=实验组A / B=对照组B',
      互斥规则: '同一用户同一阶段仅进入一个实验',
      生效页面: '数据看板首页',
      白名单用户:
        '回归分层 3 人：U-2004(A，再入组 2026-11-12)、U-2005(B，再入组 2026-11-11)、U-2006(B，再入组 2026-11-13)',
      阶段版本: 'LIFE-0002@回归/V5',
      名单生成时间: '2026-11-13T09:00:00+08:00',
    })
    changed = true
  }
  return { row: next, changed }
}

function patchLifecycleRow(row: EntryRow): { row: EntryRow; changed: boolean } {
  const next: EntryRow = { ...row }
  let changed = false
  if (next['阶段版本'] === undefined) {
    next['阶段版本'] = '—'
    changed = true
  }
  if (String(row['方案编号']) === 'LIFE-0002' || String(row['模型编号']) === 'LIFE-0002') {
    if (isOldPlaceholder(row['生命周期阶段'], ['生命周期样例'])) {
      Object.assign(next, {
        模型名称: '用户生命周期主模型',
        生命周期阶段: '回归',
        阶段版本: 'V5',
        阶段定义事件: '回访会话（return_session）',
        阶段停留阈值: '1 天',
        流转条件: '流失后 15 天内回访',
        流失周期天: '30',
        回归条件: '流失后 15 天内回访且近 30 天有活跃，回归宽限期 7 天',
      })
      changed = true
    }
  }
  return { row: next, changed }
}

export function migrateEntries(
  rows: Record<string, EntryRow[]>,
  fromVersion: number,
): { rows: Record<string, EntryRow[]>; toVersion: number; notes: string[] } {
  if (fromVersion >= ENTRIES_SCHEMA_VERSION) {
    return { rows, toVersion: fromVersion, notes: [] }
  }
  const notes: string[] = []
  const next: Record<string, EntryRow[]> = { ...rows }
  if (Array.isArray(next.abgroup)) {
    let changed = false
    next.abgroup = next.abgroup.map((row) => {
      const patched = patchAbgroupRow(row)
      changed = changed || patched.changed
      return patched.row
    })
    if (changed) {
      notes.push('分流配置：补「阶段版本 / 名单生成时间」，并把 ABGR-0002 示例改为回归分层白名单')
    }
  }
  if (Array.isArray(next.lifecycle)) {
    let changed = false
    next.lifecycle = next.lifecycle.map((row) => {
      const patched = patchLifecycleRow(row)
      changed = changed || patched.changed
      return patched.row
    })
    if (changed) {
      notes.push('生命周期：补「阶段版本」，并把 LIFE-0002 示例改为回归阶段定义')
    }
  }
  return { rows: next, toVersion: ENTRIES_SCHEMA_VERSION, notes }
}

export function migrateLifecycleRuntime(runtime: LifecycleRuntime): {
  runtime: LifecycleRuntime
  notes: string[]
} {
  if (runtime.schemaVersion >= LIFECYCLE_SCHEMA_VERSION) {
    return { runtime, notes: [] }
  }
  const seedModel = LIFECYCLE_RUNTIME_SEED.models[0]
  const notes: string[] = []
  const next: LifecycleRuntime = {
    ...runtime,
    schemaVersion: LIFECYCLE_SCHEMA_VERSION,
    models: runtime.models.map((model) => {
      const merged = {
        ...seedModel,
        ...model,
        stageDefinitions: model.stageDefinitions?.length ? model.stageDefinitions : seedModel.stageDefinitions,
        history: model.history?.length ? model.history : seedModel.history,
        regressionWindowDays: model.regressionWindowDays ?? seedModel.regressionWindowDays,
        regressionGraceDays: model.regressionGraceDays ?? seedModel.regressionGraceDays,
      }
      return merged
    }),
    users: runtime.users.map((user) => ({
      ...user,
      reentryAt: user.reentryAt ?? null,
      stageRevision: user.stageRevision ?? 1,
    })),
    transitions: runtime.transitions ?? [],
  }
  notes.push('生命周期运行时：补齐阶段定义、回归窗口与再次入组时间字段')
  return { runtime: next, notes }
}

export function seedPlanConfig(): PlanConfigStore {
  return JSON.parse(JSON.stringify(PLAN_CONFIG_SEED)) as PlanConfigStore
}

export function seedExperiments(): ExperimentStore {
  return JSON.parse(JSON.stringify(EXPERIMENT_STORE_SEED)) as ExperimentStore
}

export function emptyReport(): MigrationReport {
  return {
    entriesFrom: ENTRIES_SCHEMA_VERSION,
    entriesTo: ENTRIES_SCHEMA_VERSION,
    lifecycleFrom: LIFECYCLE_SCHEMA_VERSION,
    lifecycleTo: LIFECYCLE_SCHEMA_VERSION,
    notes: [],
  }
}
