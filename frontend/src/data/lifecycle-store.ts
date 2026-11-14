import { allRows, saveRows } from '@/data/local-store'
import {
  EXPERIMENT_STORE_SEED,
  LIFECYCLE_RUNTIME_SEED,
  PLAN_CONFIG_SEED,
} from '@/data/lifecycle-seed'
import { clone } from '@/domain/lifecycle'
import type { ExperimentStore, LifecycleRuntime, PlanConfigStore } from '@/domain/lifecycle'
import type { EntryRow } from '@/data/types'

/**
 * 生命周期运行时的本地持久化。
 *
 * 三个集合分开存放，但提供一次性快照 / 恢复 / 批量写入，供「阶段推进 + 白名单写入」
 * 的原子提交使用：任一写入失败就恢复到写入前的快照。
 */

const RUNTIME_KEY = 'data-product-ops:lifecycle-runtime'
const PLAN_KEY = 'data-product-ops:lifecycle-plans'
const EXPERIMENT_KEY = 'data-product-ops:lifecycle-experiments'

type Memory = {
  runtime: LifecycleRuntime
  plans: PlanConfigStore
  experiments: ExperimentStore
}

type WriteBundle = {
  runtime: LifecycleRuntime
  experiments: ExperimentStore
  /** 需要同步改写的分流配置行（只写 abgroup 这一个模块）。 */
  abgroupRows?: EntryRow[]
  /** 需要同步改写的生命周期模型清单行（阶段 / 版本 / 规则展示）。 */
  lifecycleRows?: EntryRow[]
}

let cache: Memory | null = null

function hasStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function readJson<T>(key: string, fallback: T): T {
  if (!hasStorage()) {
    return clone(fallback)
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    window.localStorage.setItem(key, JSON.stringify(clone(fallback)))
    return clone(fallback)
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.setItem(key, JSON.stringify(clone(fallback)))
    return clone(fallback)
  }
}

function load(): Memory {
  if (cache === null) {
    cache = {
      runtime: readJson(RUNTIME_KEY, LIFECYCLE_RUNTIME_SEED),
      plans: readJson(PLAN_KEY, PLAN_CONFIG_SEED),
      experiments: readJson(EXPERIMENT_KEY, EXPERIMENT_STORE_SEED),
    }
  }
  return cache
}

export function lifecycleRuntime(): LifecycleRuntime {
  return load().runtime
}

export function planConfig(): PlanConfigStore {
  return load().plans
}

export function experimentStore(): ExperimentStore {
  return load().experiments
}

export function snapshotMemory(): Memory {
  return clone(load())
}

function writeAll(next: Memory): void {
  cache = next
  if (hasStorage()) {
    window.localStorage.setItem(RUNTIME_KEY, JSON.stringify(next.runtime))
    window.localStorage.setItem(PLAN_KEY, JSON.stringify(next.plans))
    window.localStorage.setItem(EXPERIMENT_KEY, JSON.stringify(next.experiments))
  }
}

export function restoreMemory(snapshot: Memory): void {
  writeAll(clone(snapshot))
}

export function saveLifecycleRuntime(runtime: LifecycleRuntime): void {
  writeAll({ ...load(), runtime: clone(runtime) })
}

export function saveExperimentStore(experiments: ExperimentStore): void {
  writeAll({ ...load(), experiments: clone(experiments) })
}

/**
 * 原子写入：生命周期运行时的阶段推进、实验分流结果、分流配置展示字段一次性写入。
 * 显式写入 localStorage 便于捕获配额等异常；任一步抛错就恢复三份数据的快照，
 * 原实验结果保持不变。
 */
export function commitLifecycleWrite(
  bundle: WriteBundle,
  options: { simulateFailure?: boolean } = {},
): { ok: true } | { ok: false; message: string } {
  const backupRuntime = snapshotMemory()
  const backupAbgroup = clone(allRows()['abgroup'] ?? [])
  const backupLifecycle = clone(allRows()['lifecycle'] ?? [])
  try {
    if (options.simulateFailure) {
      throw new Error('模拟写入失败（验收用）')
    }
    if (hasStorage()) {
      window.localStorage.setItem(RUNTIME_KEY, JSON.stringify(bundle.runtime))
      window.localStorage.setItem(EXPERIMENT_KEY, JSON.stringify(bundle.experiments))
    }
    if (bundle.abgroupRows) {
      saveRows('abgroup', bundle.abgroupRows)
    }
    if (bundle.lifecycleRows) {
      saveRows('lifecycle', bundle.lifecycleRows)
    }
    cache = {
      runtime: clone(bundle.runtime),
      plans: clone(load().plans),
      experiments: clone(bundle.experiments),
    }
    return { ok: true }
  } catch (error) {
    restoreMemory(backupRuntime)
    saveRows('abgroup', backupAbgroup)
    saveRows('lifecycle', backupLifecycle)
    return {
      ok: false,
      message: error instanceof Error ? error.message : '写入失败，已回滚到写入前的实验结果',
    }
  }
}

export function resetLifecycleMemory(): void {
  cache = null
  if (hasStorage()) {
    window.localStorage.removeItem(RUNTIME_KEY)
    window.localStorage.removeItem(PLAN_KEY)
    window.localStorage.removeItem(EXPERIMENT_KEY)
  }
  load()
}
