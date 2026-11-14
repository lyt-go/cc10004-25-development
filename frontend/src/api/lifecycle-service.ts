import { listRows } from '@/data/local-store'
import {
  commitLifecycleWrite,
  experimentStore,
  lifecycleRuntime,
  planConfig,
} from '@/data/lifecycle-store'
import {
  advanceUserStage,
  applyStageWhitelistCommit,
  buildStageWhitelistPreview,
} from '@/domain/lifecycle'
import type {
  CommitOutcome,
  ExperimentResult,
  ExperimentStore,
  LifecycleModelRuntime,
  LifecycleRuntime,
  LifecycleStage,
  PlanSplitConfig,
  PreviewOutcome,
  PreviewRequest,
  StageWhitelistPreview,
  UserAdvanceOutcome,
} from '@/domain/lifecycle'
import type { EntryRow } from '@/data/types'

/**
 * 把实验名单转换成「分流配置」ABGR-0002 行的展示字段。
 * 这里只计算，不写数据，由 commitLifecycleWrite 统一写入。
 */
export function buildAbgroupRows(result: ExperimentResult): EntryRow[] {
  const rows = listRows('abgroup')
  const index = rows.findIndex((row) => String(row['方案编号']) === result.planId)
  if (index < 0) {
    return rows
  }
  const memberText =
    result.whitelist.length === 0
      ? `${result.stage}分层 0 人（无符合资格用户）`
      : `${result.stage}分层 ${result.whitelist.length} 人：` +
        result.whitelist
          .map((member) => {
            const reentry = member.reentryAt ? `，再入组 ${member.reentryAt.slice(0, 10)}` : ''
            return `${member.userId}(${member.groupCode}${reentry})`
          })
          .join('、')
  const next = [...rows]
  next[index] = {
    ...rows[index],
    '分流类型': result.splitType,
    '分流比例': `${result.stage} 配置 ${result.ratio}% · 实际 ${result.actualRatio}%`,
    '分组标识': `${result.groupCodes[0]}=${result.groupLabels[0]} / ${result.groupCodes[1]}=${result.groupLabels[1]}`,
    '生效页面': result.page,
    '白名单用户': memberText,
    '阶段版本': result.stageVersionLabel,
    '名单生成时间': result.generatedAt,
  }
  return next
}

/** 把模型阶段推进结果同步到「生命周期」模块对应模型的展示字段。 */
export function buildLifecycleRows(
  model: LifecycleModelRuntime,
  result: ExperimentResult,
): EntryRow[] {
  const rows = listRows('lifecycle')
  const index = rows.findIndex((row) => String(row['模型编号']) === model.modelId)
  if (index < 0) {
    return rows
  }
  const next = [...rows]
  next[index] = {
    ...rows[index],
    '生命周期阶段': model.currentStage,
    '阶段版本': `V${model.stageVersion}`,
    '阶段定义事件': model.stageDefinitions.find((item) => item.stage === model.currentStage)?.event ?? rows[index]['阶段定义事件'],
    '阶段停留阈值': `${model.stageDefinitions.find((item) => item.stage === model.currentStage)?.dwellDays ?? 0} 天`,
    '流转条件': result.stage === model.currentStage ? result.stageVersionLabel : rows[index]['流转条件'],
    '流失周期天': String(model.churnCycleDays),
    '回归条件': `流失后 ${model.regressionWindowDays} 天内回访且近 ${model.churnCycleDays} 天有活跃，回归宽限期 ${model.regressionGraceDays} 天`,
  }
  return next
}

export function previewStageWhitelist(request: PreviewRequest): PreviewOutcome {
  return buildStageWhitelistPreview(lifecycleRuntime(), planConfig(), request)
}

/**
 * 确认写入：生命周期模型阶段推进、实验分流结果、ABGR 展示字段必须同时成功。
 * 任一写入失败会恢复三份数据的快照，原实验结果保持不变。
 */
export function commitStageWhitelist(
  preview: StageWhitelistPreview,
  options: { simulateFailure?: boolean } = {},
): CommitOutcome {
  const outcome = applyStageWhitelistCommit(
    lifecycleRuntime(),
    planConfig(),
    experimentStore(),
    preview,
  )
  if (!outcome.ok) {
    return outcome
  }
  const written = commitLifecycleWrite(
    {
      runtime: outcome.runtime,
      experiments: outcome.experiments,
      abgroupRows: buildAbgroupRows(outcome.result),
      lifecycleRows: buildLifecycleRows(
        outcome.runtime.models.find((item) => item.modelId === outcome.result.modelId)!,
        outcome.result,
      ),
    },
    { simulateFailure: options.simulateFailure },
  )
  if (!written.ok) {
    return { ok: false, message: `阶段推进与白名单写入失败，已保留原实验结果：${written.message}` }
  }
  return outcome
}

export function advanceStage(input: {
  modelId: string
  userId: string
  toStage: LifecycleStage
  at: string
  expectedRevision: number
  operator: string
  reason?: string
}): UserAdvanceOutcome {
  const outcome = advanceUserStage(lifecycleRuntime(), input)
  if (!outcome.ok) {
    return outcome
  }
  const written = commitLifecycleWrite({
    runtime: outcome.runtime,
    experiments: experimentStore(),
  })
  if (!written.ok) {
    return { ok: false, message: written.message, conflict: false }
  }
  return outcome
}

export function latestExperimentFor(modelId: string, planId?: string): ExperimentResult | undefined {
  return experimentStore().results.find(
    (item) => item.modelId === modelId && (planId === undefined || item.planId === planId),
  )
}

export function experimentsFor(modelId: string): ExperimentResult[] {
  return experimentStore().results.filter((item) => item.modelId === modelId)
}

export function plans(): PlanSplitConfig[] {
  return planConfig().plans
}

export function runtime(): LifecycleRuntime {
  return lifecycleRuntime()
}

export function experimentResults(): ExperimentStore {
  return experimentStore()
}

/** 读取「分流配置」模块里某个方案的清单行，供生命周期页展示 ABGR-0002 的配置与白名单。 */
export function abgroupRow(planId: string): EntryRow | undefined {
  return listRows('abgroup').find((row) => String(row['方案编号']) === planId)
}
