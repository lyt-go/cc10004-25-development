import { describe, expect, it } from 'vitest'

import {
  commitStageWhitelist,
  latestExperimentFor,
  previewStageWhitelist,
  runtime,
} from '@/api/lifecycle-service'
import { listRows } from '@/data/local-store'
import { LIFECYCLE_RUNTIME_SEED, PLAN_CONFIG_SEED } from '@/data/lifecycle-seed'
import { buildStageWhitelistPreview, clone } from '@/domain/lifecycle'

const AT = '2026-11-14T09:00:00+08:00'

function preview(stage: '获客' | '培育' | '活跃' | '流失' | '回归') {
  const outcome = previewStageWhitelist({
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

describe('生命周期服务：原子提交与分流配置同步', () => {
  it('确认后阶段推进、实验结果与 ABGR 展示字段一起更新', () => {
    const outcome = commitStageWhitelist(preview('活跃'))
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(runtime().models[0].currentStage).toBe('活跃')
    expect(runtime().models[0].stageVersion).toBe(6)

    const latest = latestExperimentFor('LIFE-0002', 'ABGR-0002')
    expect(latest?.stageVersionLabel).toBe('LIFE-0002@活跃/V6')
    expect(latest?.whitelist.every((member) => member.stage === '活跃')).toBe(true)

    const abgroup = listRows('abgroup').find((row) => row['方案编号'] === 'ABGR-0002')
    expect(abgroup?.['阶段版本']).toBe('LIFE-0002@活跃/V6')
    expect(String(abgroup?.['白名单用户'])).toMatch(/活跃分层 3 人/)
    expect(String(abgroup?.['分流类型'])).toBe('生命周期分层分流')
    expect(String(abgroup?.['生效页面'])).toBe('数据看板首页')

    const lifecycleRow = listRows('lifecycle').find((row) => row['模型编号'] === 'LIFE-0002')
    expect(lifecycleRow?.['生命周期阶段']).toBe('活跃')
    expect(lifecycleRow?.['阶段版本']).toBe('V6')
    expect(String(lifecycleRow?.['阶段定义事件'])).toMatch(/weekly_active_session/)
    expect(String(lifecycleRow?.['流失周期天'])).toBe('30')
    expect(String(lifecycleRow?.['回归条件'])).toMatch(/回归宽限期 7 天/)
  })

  it('写入失败时保留原实验结果与阶段版本', () => {
    const runtimeBefore = JSON.stringify(runtime())
    const experimentsBefore = JSON.stringify(latestExperimentFor('LIFE-0002', 'ABGR-0002'))
    const abgroupBefore = JSON.stringify(
      listRows('abgroup').find((row) => row['方案编号'] === 'ABGR-0002'),
    )

    const failed = commitStageWhitelist(preview('活跃'), { simulateFailure: true })
    expect(failed.ok).toBe(false)
    if (failed.ok) return
    expect(failed.message).toMatch(/保留原实验结果/)

    expect(JSON.stringify(runtime())).toBe(runtimeBefore)
    expect(latestExperimentFor('LIFE-0002', 'ABGR-0002')?.stageVersion).toBe(5)
    expect(JSON.stringify(latestExperimentFor('LIFE-0002', 'ABGR-0002'))).toBe(experimentsBefore)
    expect(
      JSON.stringify(listRows('abgroup').find((row) => row['方案编号'] === 'ABGR-0002')),
    ).toBe(abgroupBefore)
  })

  it('分流方案未配置目标阶段比例时拒绝生成预览', () => {
    const custom = clone(PLAN_CONFIG_SEED)
    custom.plans[0].ratios = { 活跃: 50 }
    const blocked = buildStageWhitelistPreview(clone(LIFECYCLE_RUNTIME_SEED), custom, {
      modelId: 'LIFE-0002',
      targetStage: '回归',
      planId: 'ABGR-0002',
      at: AT,
      operator: '验收',
    })
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.message).toMatch(/未配置「回归」阶段的分流比例/)
  })
})
