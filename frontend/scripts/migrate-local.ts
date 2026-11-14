/**
 * 本地开发环境数据迁移。
 *
 * 纯前端项目的「数据库」是浏览器 localStorage；本地开发环境另外保留一份可复现的
 * 示例数据快照，供 docker compose 的迁移任务 / 本地脚本统一升级：
 *
 *   .local/dev-db.json   { entries, lifecycle: { runtime, plans, experiments } }
 *
 * 迁移复用 src/data/migrate.ts 里的同一套函数，保证本地快照与浏览器里的迁移结果一致。
 * 脚本可重复执行：已经是当前版本时不改写文件，只打印报告。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
  ENTRIES_SCHEMA_VERSION,
  LIFECYCLE_SCHEMA_VERSION,
  migrateEntries,
  migrateLifecycleRuntime,
} from '../src/data/migrate.ts'
import {
  EXPERIMENT_STORE_SEED,
  LIFECYCLE_RUNTIME_SEED,
  PLAN_CONFIG_SEED,
} from '../src/data/lifecycle-seed.ts'
import { SEED_ROWS } from '../src/data/seed.ts'
import type { EntryRow } from '../src/data/types.ts'
import type { ExperimentStore, LifecycleRuntime, PlanConfigStore } from '../src/domain/lifecycle.ts'

type LocalDb = {
  schemaVersion: number
  entries: Record<string, EntryRow[]>
  lifecycle: {
    schemaVersion: number
    runtime: LifecycleRuntime
    plans: PlanConfigStore
    experiments: ExperimentStore
  }
}

const target = resolve(
  process.argv[2] ?? new URL('../.local/dev-db.json', import.meta.url).pathname,
)

function freshDb(): LocalDb {
  return {
    schemaVersion: ENTRIES_SCHEMA_VERSION,
    entries: JSON.parse(JSON.stringify(SEED_ROWS)) as Record<string, EntryRow[]>,
    lifecycle: {
      schemaVersion: LIFECYCLE_SCHEMA_VERSION,
      runtime: JSON.parse(JSON.stringify(LIFECYCLE_RUNTIME_SEED)) as LifecycleRuntime,
      plans: JSON.parse(JSON.stringify(PLAN_CONFIG_SEED)) as PlanConfigStore,
      experiments: JSON.parse(JSON.stringify(EXPERIMENT_STORE_SEED)) as ExperimentStore,
    },
  }
}

function main(): void {
  const existed = existsSync(target)
  const db: LocalDb = existed
    ? (JSON.parse(readFileSync(target, 'utf8')) as LocalDb)
    : freshDb()

  const entriesFrom = db.schemaVersion ?? 0
  const lifecycleFrom = db.lifecycle?.schemaVersion ?? 0

  const migratedEntries =
    entriesFrom < ENTRIES_SCHEMA_VERSION
      ? migrateEntries(db.entries ?? {}, entriesFrom)
      : { rows: db.entries, toVersion: entriesFrom, notes: [] as string[] }

  let migratedLifecycle = {
    runtime: db.lifecycle?.runtime ?? JSON.parse(JSON.stringify(LIFECYCLE_RUNTIME_SEED)),
    notes: [] as string[],
  }
  if (lifecycleFrom < LIFECYCLE_SCHEMA_VERSION && migratedLifecycle.runtime) {
    migratedLifecycle = migrateLifecycleRuntime(migratedLifecycle.runtime)
  }

  const next: LocalDb = {
    schemaVersion: ENTRIES_SCHEMA_VERSION,
    entries: migratedEntries.rows,
    lifecycle: {
      schemaVersion: LIFECYCLE_SCHEMA_VERSION,
      runtime: migratedLifecycle.runtime,
      plans: db.lifecycle?.plans ?? JSON.parse(JSON.stringify(PLAN_CONFIG_SEED)),
      experiments: db.lifecycle?.experiments ?? JSON.parse(JSON.stringify(EXPERIMENT_STORE_SEED)),
    },
  }

  const changed =
    !existed ||
    entriesFrom !== ENTRIES_SCHEMA_VERSION ||
    lifecycleFrom !== LIFECYCLE_SCHEMA_VERSION

  if (changed) {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  }

  console.log(`[migrate:local] 目标文件：${target}`)
  console.log(`[migrate:local] 业务清单：${entriesFrom} → ${ENTRIES_SCHEMA_VERSION}`)
  console.log(`[migrate:local] 生命周期：${lifecycleFrom} → ${LIFECYCLE_SCHEMA_VERSION}`)
  for (const note of [...migratedEntries.notes, ...migratedLifecycle.notes]) {
    console.log(`[migrate:local] - ${note}`)
  }
  console.log(
    changed
      ? `[migrate:local] 已写入迁移后的本地数据（${Object.keys(next.entries).length} 个模块）`
      : '[migrate:local] 已是当前版本，无需改写',
  )
}

try {
  main()
} catch (error) {
  console.error('[migrate:local] 迁移失败：', error instanceof Error ? error.message : error)
  process.exit(1)
}
