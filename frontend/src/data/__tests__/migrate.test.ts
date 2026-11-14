import { describe, expect, it } from 'vitest'

import { bootstrapLocalData } from '@/data/bootstrap'
import { migrateEntries, migrateLifecycleRuntime } from '@/data/migrate'
import type { EntryRow } from '@/data/types'

const ENTRIES_KEY = 'data-product-ops:entries'

function legacyEntries(): Record<string, EntryRow[]> {
  return {
    abgroup: [
      {
        id: 2,
        status: '方案评审中',
        pending: true,
        abnormal: true,
        方案编号: 'ABGR-0002',
        方案名称: '分流配置样例2',
        分流类型: '分流配置样例2',
        分流比例: '分流配置样例2',
        分组标识: '分流配置样例2',
        互斥规则: '分流配置样例2',
        生效页面: '分流配置样例2',
        白名单用户: '分流配置样例2',
      },
    ],
    lifecycle: [
      {
        id: 2,
        status: '模型评审中',
        pending: true,
        abnormal: true,
        模型编号: 'LIFE-0002',
        模型名称: '生命周期样例2',
        生命周期阶段: '生命周期样例2',
        阶段定义事件: '生命周期样例2',
        阶段停留阈值: '生命周期样例2',
        流转条件: '生命周期样例2',
        流失周期天: '生命周期样例2',
        回归条件: '生命周期样例2',
      },
    ],
  }
}

describe('本地数据迁移', () => {
  it('补齐阶段版本字段并把旧占位示例替换为回归分层', () => {
    const migrated = migrateEntries(legacyEntries(), 0)
    expect(migrated.toVersion).toBe(3)
    expect(migrated.rows.abgroup[0]['阶段版本']).toBe('LIFE-0002@回归/V5')
    expect(migrated.rows.abgroup[0]['白名单用户']).toMatch(/回归分层 3 人/)
    expect(migrated.rows.lifecycle[0]['生命周期阶段']).toBe('回归')
    expect(migrated.rows.lifecycle[0]['阶段版本']).toBe('V5')
  })

  it('已经改过的数据保持不动', () => {
    const entries = legacyEntries()
    entries.abgroup[0]['白名单用户'] = 'U-9001(A)'
    entries.abgroup[0]['阶段版本'] = 'LIFE-0002@活跃/V3'
    const migrated = migrateEntries(entries, 0)
    expect(migrated.rows.abgroup[0]['白名单用户']).toBe('U-9001(A)')
    expect(migrated.rows.abgroup[0]['阶段版本']).toBe('LIFE-0002@活跃/V3')
  })

  it('补齐生命周期运行时的新字段，保持用户已有阶段', () => {
    const legacy = {
      schemaVersion: 1,
      models: [{ modelId: 'LIFE-0002', name: '旧模型', currentStage: '活跃', stageVersion: 3 }],
      users: [
        {
          userId: 'U-1',
          modelId: 'LIFE-0002',
          stage: '活跃',
          stageRevision: 2,
          stageEnteredAt: '2026-11-01T00:00:00+08:00',
          lastActiveAt: '2026-11-02T00:00:00+08:00',
        },
      ],
      transitions: [],
    }
    const migrated = migrateLifecycleRuntime(legacy as never)
    expect(migrated.runtime.schemaVersion).toBe(2)
    expect(migrated.runtime.models[0].stageDefinitions.length).toBeGreaterThan(0)
    expect(migrated.runtime.models[0].regressionGraceDays).toBeGreaterThan(0)
    expect(migrated.runtime.models[0].currentStage).toBe('活跃')
    expect(migrated.runtime.users[0].reentryAt).toBeNull()
    expect(migrated.runtime.users[0].stage).toBe('活跃')
  })

  it('bootstrap 在旧 localStorage 上只迁移一次', () => {
    window.localStorage.clear()
    window.localStorage.setItem(ENTRIES_KEY, JSON.stringify(legacyEntries()))
    const first = bootstrapLocalData()
    expect(first.entriesUpgraded).toBe(true)
    const migrated = JSON.parse(window.localStorage.getItem(ENTRIES_KEY) ?? '{}')
    expect(migrated.abgroup[0]['阶段版本']).toBe('LIFE-0002@回归/V5')
    const second = bootstrapLocalData()
    expect(second.entriesUpgraded).toBe(false)
  })
})
