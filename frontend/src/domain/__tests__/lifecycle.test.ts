import { describe, expect, it } from 'vitest'

import { LIFECYCLE_RUNTIME_SEED, PLAN_CONFIG_SEED } from '@/data/lifecycle-seed'
import {
  advanceUserStage,
  applyStageWhitelistCommit,
  buildStageWhitelistPreview,
  clone,
  evaluateEligibility,
  groupOf,
} from '@/domain/lifecycle'
import type { ExperimentStore, LifecycleRuntime, PlanConfigStore } from '@/domain/lifecycle'

const AT = '2026-11-14T09:00:00+08:00'

function runtimeCopy(): LifecycleRuntime {
  return clone(LIFECYCLE_RUNTIME_SEED)
}
function plansCopy(): PlanConfigStore {
  return clone(PLAN_CONFIG_SEED)
}
function emptyExperiments(): ExperimentStore {
  return { schemaVersion: 2, results: [] }
}
function previewOf(runtime: LifecycleRuntime, plans: PlanConfigStore, stage: '获客' | '培育' | '活跃' | '流失' | '回归') {
  const outcome = buildStageWhitelistPreview(runtime, plans, {
    modelId: 'LIFE-0002',
    targetStage: stage,
    planId: 'ABGR-0002',
    at: AT,
    operator: '验收',
  })
  if (!outcome.ok) {
    throw new Error(outcome.message)
  }
  return outcome.preview
}

describe('按生命周期阶段生成白名单', () => {
  it('预览只计算不写数据，回归阶段名单带再次入组时间与分组标识', () => {
    const runtime = runtimeCopy()
    const plans = plansCopy()
    const snapshot = JSON.stringify({ runtime, plans })
    const preview = previewOf(runtime, plans, '回归')

    expect(preview.stageVersionLabel).toBe('LIFE-0002@回归/V5')
    expect(preview.advanceRequired).toBe(false)
    expect(preview.whitelist.map((member) => member.userId)).toEqual(['U-2004', 'U-2005', 'U-2006'])
    expect(preview.whitelist.find((member) => member.userId === 'U-2004')?.groupCode).toBe('A')
    expect(preview.whitelist.find((member) => member.userId === 'U-2004')?.groupLabel).toBe('实验组A')
    expect(preview.whitelist.every((member) => Boolean(member.reentryAt))).toBe(true)
    expect(preview.actualRatio).toBeCloseTo(33.3, 1)
    expect(JSON.stringify({ runtime, plans })).toBe(snapshot)
  })

  it('流失层与未到活跃层的用户不进入新白名单', () => {
    const preview = previewOf(runtimeCopy(), plansCopy(), '回归')
    const excluded = new Map(preview.excluded.map((item) => [item.userId, item.reason]))
    expect(excluded.get('U-2007')).toMatch(/流失层用户不进入新白名单/)
    expect(excluded.get('U-2008')).toMatch(/流失层用户不进入新白名单/)
    expect(excluded.get('U-2009')).toMatch(/培育/)
    expect(excluded.get('U-2010')).toMatch(/获客/)
    expect(preview.whitelist.some((member) => member.stage === '流失')).toBe(false)
  })

  it('选择流失阶段时使用流失阶段规则，名单为空而不是沿用旧名单', () => {
    const preview = previewOf(runtimeCopy(), plansCopy(), '流失')
    expect(preview.whitelist).toHaveLength(0)
    expect(preview.excluded.some((item) => item.userId === 'U-2007')).toBe(true)
    expect(preview.stageVersionLabel).toBe('LIFE-0002@流失/V6')
  })

  it('回归用户回到活跃层后仍保留再次入组时间', () => {
    const preview = previewOf(runtimeCopy(), plansCopy(), '活跃')
    const member = preview.whitelist.find((item) => item.userId === 'U-2002')
    expect(member?.reentryAt).toBe('2026-11-10T09:00:00+08:00')
    expect(preview.stageVersionLabel).toBe('LIFE-0002@活跃/V6')
  })

  it('长期无活跃的用户即使处于活跃层也不入组', () => {
    const runtime = runtimeCopy()
    const user = runtime.users.find((item) => item.userId === 'U-2003')
    expect(user).toBeDefined()
    if (!user) return
    user.lastActiveAt = '2026-09-01T00:00:00+08:00'
    const decision = evaluateEligibility(runtime.models[0], user, AT)
    expect(decision.eligible).toBe(false)
    expect(decision.reason).toMatch(/流失周期/)
  })

  it('分桶在预览与写入之间可复现', () => {
    const previewA = previewOf(runtimeCopy(), plansCopy(), '回归')
    const previewB = previewOf(runtimeCopy(), plansCopy(), '回归')
    expect(previewA.whitelist).toEqual(previewB.whitelist)
    expect(groupOf(0, 40, ['实验组A', '对照组B'], ['A', 'B']).groupCode).toBe('A')
    expect(groupOf(9999, 40, ['实验组A', '对照组B'], ['A', 'B']).groupCode).toBe('B')
  })

  it('写入结果记录阶段版本，并同步推进生命周期模型阶段', () => {
    const runtime = runtimeCopy()
    const plans = plansCopy()
    const preview = previewOf(runtime, plans, '活跃')
    const outcome = applyStageWhitelistCommit(runtime, plans, emptyExperiments(), preview)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.runtime.models[0].currentStage).toBe('活跃')
    expect(outcome.runtime.models[0].stageVersion).toBe(6)
    expect(outcome.runtime.models[0].stageEnteredAt).toBe(AT)
    expect(outcome.result.stageVersion).toBe(6)
    expect(outcome.result.stageVersionLabel).toBe('LIFE-0002@活跃/V6')
    expect(outcome.result.whitelist.map((item) => item.userId).sort()).toEqual([
      'U-2001',
      'U-2002',
      'U-2003',
    ])
    // 原运行时不被就地修改
    expect(runtime.models[0].currentStage).toBe('回归')
  })

  it('确认时人群已变化会拒绝写入，并保留原实验结果', () => {
    const runtime = runtimeCopy()
    const plans = plansCopy()
    const preview = previewOf(runtime, plans, '回归')
    const changed = clone(runtime)
    const user = changed.users.find((item) => item.userId === 'U-2006')
    expect(user).toBeDefined()
    if (!user) return
    user.lastActiveAt = '2026-09-01T00:00:00+08:00'
    const outcome = applyStageWhitelistCommit(changed, plans, emptyExperiments(), preview)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.message).toMatch(/重新预览/)
  })
})

describe('用户阶段推进的并发控制', () => {
  it('两处同时推进同一用户只接受一个当前阶段', () => {
    const runtime = runtimeCopy()
    const first = advanceUserStage(runtime, {
      modelId: 'LIFE-0002',
      userId: 'U-2004',
      toStage: '活跃',
      at: '2026-11-14T09:00:00+08:00',
      expectedRevision: 4,
      operator: '验收',
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.user.stage).toBe('活跃')
    expect(first.user.stageRevision).toBe(5)

    const second = advanceUserStage(first.runtime, {
      modelId: 'LIFE-0002',
      userId: 'U-2004',
      toStage: '活跃',
      at: '2026-11-14T09:00:00+08:00',
      expectedRevision: 4,
      operator: '验收',
    })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.conflict).toBe(true)
    const current = first.runtime.users.find((item) => item.userId === 'U-2004')
    expect(current?.stage).toBe('活跃')
    expect(current?.stageRevision).toBe(5)
  })

  it('同一时间点的重复推进也只接受一次', () => {
    const runtime = runtimeCopy()
    const at = '2026-11-14T09:00:00+08:00'
    const first = advanceUserStage(runtime, {
      modelId: 'LIFE-0002',
      userId: 'U-2004',
      toStage: '活跃',
      at,
      expectedRevision: 4,
      operator: 'A',
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const sneaky = advanceUserStage(first.runtime, {
      modelId: 'LIFE-0002',
      userId: 'U-2004',
      toStage: '活跃',
      at,
      expectedRevision: 5,
      operator: 'B',
    })
    expect(sneaky.ok).toBe(false)
  })

  it('阶段停留阈值与回归宽限期参与校验', () => {
    const runtime = runtimeCopy()
    const tooEarly = advanceUserStage(runtime, {
      modelId: 'LIFE-0002',
      userId: 'U-2004',
      toStage: '活跃',
      at: '2026-11-12T10:00:00+08:00',
      expectedRevision: 4,
      operator: '验收',
    })
    expect(tooEarly.ok).toBe(false)
    if (!tooEarly.ok) expect(tooEarly.message).toMatch(/停留满/)

    const tooLate = advanceUserStage(runtime, {
      modelId: 'LIFE-0002',
      userId: 'U-2004',
      toStage: '活跃',
      at: '2026-11-25T10:00:00+08:00',
      expectedRevision: 4,
      operator: '验收',
    })
    expect(tooLate.ok).toBe(false)
    if (!tooLate.ok) expect(tooLate.message).toMatch(/宽限期/)
  })
})
