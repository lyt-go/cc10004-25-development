/**
 * 生命周期领域模型。
 *
 * 规则全部写成纯函数，不依赖浏览器 / localStorage：
 * 页面、持久化层和本地迁移脚本可以共用同一份判定，单元测试也能直接跑。
 */

export type LifecycleStage = '获客' | '培育' | '活跃' | '流失' | '回归'

export const LIFECYCLE_STAGES: LifecycleStage[] = ['获客', '培育', '活跃', '流失', '回归']

export const STAGE_ORDER: Record<LifecycleStage, number> = {
  获客: 0,
  培育: 1,
  活跃: 2,
  流失: 3,
  回归: 4,
}

export type StageDefinition = {
  stage: LifecycleStage
  event: string
  dwellDays: number
  description: string
}

export type StageHistoryEntry = {
  version: number
  stage: LifecycleStage
  fromStage: LifecycleStage | null
  enteredAt: string
  reason: string
}

export type LifecycleModelRuntime = {
  modelId: string
  name: string
  /** 模型当前所处的生命周期阶段，也是实验分层依据。 */
  currentStage: LifecycleStage
  /** 阶段版本：每次进入新阶段 +1，实验结果会记录该版本。 */
  stageVersion: number
  stageEnteredAt: string
  stageDefinitions: StageDefinition[]
  churnCycleDays: number
  /** 流失后多少天内回访可以进入回归阶段。 */
  regressionWindowDays: number
  /** 回归阶段可停留多少天，超期不能再回到活跃层。 */
  regressionGraceDays: number
  history: StageHistoryEntry[]
  updatedAt: string
}

export type LifecycleUser = {
  userId: string
  modelId: string
  stage: LifecycleStage
  /** 用户阶段版本：每次推进 +1，用于并发推进的乐观锁。 */
  stageRevision: number
  stageEnteredAt: string
  lastActiveAt: string
  /** 回归后再次入组时间；回到活跃层后仍然保留。 */
  reentryAt: string | null
  note?: string
}

export type StageTransitionRecord = {
  id: string
  modelId: string
  userId: string
  fromStage: LifecycleStage
  toStage: LifecycleStage
  at: string
  revision: number
  operator: string
  reason: string
}

export type LifecycleRuntime = {
  schemaVersion: number
  models: LifecycleModelRuntime[]
  users: LifecycleUser[]
  transitions: StageTransitionRecord[]
}

export type PlanSplitConfig = {
  planId: string
  planName: string
  splitType: string
  /** 各阶段命中实验组 A 的比例（0-100）。 */
  ratios: Partial<Record<LifecycleStage, number>>
  groupLabels: [string, string]
  groupCodes: [string, string]
  page: string
  mutex: string
}

export type PlanConfigStore = {
  schemaVersion: number
  plans: PlanSplitConfig[]
}

export type WhitelistMember = {
  userId: string
  stage: LifecycleStage
  stageRevision: number
  groupCode: string
  groupLabel: string
  bucket: number
  ratio: number
  stageEnteredAt: string
  reentryAt: string | null
  lastActiveAt: string
}

export type ExcludedUser = {
  userId: string
  stage: LifecycleStage
  reason: string
}

export type StagePopulation = {
  stage: LifecycleStage
  total: number
  eligible: number
  selected: number
}

export type ExperimentResult = {
  id: string
  planId: string
  planName: string
  modelId: string
  /** 目标生命周期阶段。 */
  stage: LifecycleStage
  /** 生成名单时生命周期模型所处的阶段版本。 */
  stageVersion: number
  stageVersionLabel: string
  generatedAt: string
  splitType: string
  /** 配置的目标比例。 */
  ratio: number
  /** 实际入选实验组 A 的比例。 */
  actualRatio: number
  groupLabels: [string, string]
  groupCodes: [string, string]
  page: string
  mutex: string
  whitelist: WhitelistMember[]
  excluded: ExcludedUser[]
  population: StagePopulation[]
  fingerprint: string
  operator: string
}

export type ExperimentStore = {
  schemaVersion: number
  results: ExperimentResult[]
}

export type PreviewRequest = {
  modelId: string
  targetStage: LifecycleStage
  planId: string
  /** 名单生成时间 / 阶段推进生效时间。 */
  at: string
  operator: string
}

export type StageWhitelistPreview = {
  request: PreviewRequest
  modelId: string
  modelName: string
  planId: string
  planName: string
  targetStage: LifecycleStage
  fromStage: LifecycleStage
  /** 提交后生效的阶段版本。 */
  nextStageVersion: number
  baseStageVersion: number
  baseModelUpdatedAt: string
  stageVersionLabel: string
  advanceRequired: boolean
  splitType: string
  ratio: number
  actualRatio: number
  groupLabels: [string, string]
  groupCodes: [string, string]
  page: string
  mutex: string
  whitelist: WhitelistMember[]
  excluded: ExcludedUser[]
  population: StagePopulation[]
  fingerprint: string
}

export type PreviewOutcome =
  | { ok: true; preview: StageWhitelistPreview }
  | { ok: false; message: string }

export type CommitOutcome =
  | {
      ok: true
      runtime: LifecycleRuntime
      experiments: ExperimentStore
      result: ExperimentResult
    }
  | { ok: false; message: string }

export type StageAdvanceDecision = { ok: true } | { ok: false; reason: string }

export type UserAdvanceOutcome =
  | { ok: true; runtime: LifecycleRuntime; user: LifecycleUser; message: string }
  | { ok: false; message: string; conflict: boolean }

/** 合法的阶段迁移路径：只接受这些方向，避免用户阶段来回抖动。 */
const ALLOWED_TRANSITIONS: Record<LifecycleStage, LifecycleStage[]> = {
  获客: ['培育', '流失'],
  培育: ['活跃', '流失'],
  活跃: ['流失'],
  流失: ['回归'],
  回归: ['活跃', '流失'],
}

export function canTransition(from: LifecycleStage, to: LifecycleStage): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export function nextStagesOf(stage: LifecycleStage): LifecycleStage[] {
  return ALLOWED_TRANSITIONS[stage] ?? []
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function modelOf(runtime: LifecycleRuntime, modelId: string): LifecycleModelRuntime | undefined {
  return runtime.models.find((item) => item.modelId === modelId)
}

export function planOf(plans: PlanConfigStore, planId: string): PlanSplitConfig | undefined {
  return plans.plans.find((item) => item.planId === planId)
}

export function usersOf(runtime: LifecycleRuntime, modelId: string): LifecycleUser[] {
  return runtime.users.filter((item) => item.modelId === modelId)
}

export function stageDefinitionOf(
  model: LifecycleModelRuntime,
  stage: LifecycleStage,
): StageDefinition | undefined {
  return model.stageDefinitions.find((item) => item.stage === stage)
}

/** 阶段停留天数：进入阶段后至少停留这么久才允许再次推进。 */
export function dwellDaysOf(model: LifecycleModelRuntime, stage: LifecycleStage): number {
  return stageDefinitionOf(model, stage)?.dwellDays ?? 0
}

export function parseTime(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function daysBetween(from: string, to: string): number {
  return Math.floor((parseTime(to) - parseTime(from)) / 86_400_000)
}

export function hoursBetween(from: string, to: string): number {
  return Math.floor((parseTime(to) - parseTime(from)) / 3_600_000)
}

export function stageVersionLabel(modelId: string, stage: LifecycleStage, version: number): string {
  return `${modelId}@${stage}/V${version}`
}

export function fingerprintOf(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 2_166_136_261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** FNV-1a 分桶：预览与写入共用，保证同一用户同一阶段分组可复现。 */
export function bucketOf(
  planId: string,
  stage: LifecycleStage,
  versionLabel: string,
  userId: string,
): number {
  const input = `${planId}|${stage}|${versionLabel}|${userId}`
  let hash = 2_166_136_261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0) % 10_000
}

export function groupOf(
  bucket: number,
  ratio: number,
  labels: [string, string],
  codes: [string, string],
): { groupCode: string; groupLabel: string } {
  const inExperiment = bucket < Math.max(0, Math.min(100, ratio)) * 100
  const index = inExperiment ? 0 : 1
  return { groupCode: codes[index], groupLabel: labels[index] }
}

/** 模型阶段推进校验：路径合法、停留阈值满足、回归窗口/宽限期未超。 */
export function evaluateModelTransition(
  model: LifecycleModelRuntime,
  toStage: LifecycleStage,
  at: string,
): StageAdvanceDecision {
  if (model.currentStage === toStage) {
    return { ok: true }
  }
  if (!canTransition(model.currentStage, toStage)) {
    return { ok: false, reason: `不允许从「${model.currentStage}」直接进入「${toStage}」` }
  }
  const dwell = dwellDaysOf(model, model.currentStage)
  const stayed = daysBetween(model.stageEnteredAt, at)
  if (stayed < dwell) {
    return {
      ok: false,
      reason: `「${model.currentStage}」阶段需停留满 ${dwell} 天才能推进，当前仅 ${Math.max(stayed, 0)} 天`,
    }
  }
  if (model.currentStage === '流失' && toStage === '回归') {
    if (stayed > model.regressionWindowDays) {
      return {
        ok: false,
        reason: `已超过回归条件窗口：流失后 ${model.regressionWindowDays} 天内回访才可进入回归阶段`,
      }
    }
  }
  if (model.currentStage === '回归' && toStage === '活跃') {
    if (stayed > model.regressionGraceDays) {
      return { ok: false, reason: `已超过回归宽限期 ${model.regressionGraceDays} 天` }
    }
  }
  return { ok: true }
}

/**
 * 用户阶段推进校验：路径合法、当前阶段停留满阈值；
 * 流失 → 回归须在回归窗口内，回归 → 活跃须在宽限期内。
 */
export function evaluateUserTransition(
  model: LifecycleModelRuntime,
  user: LifecycleUser,
  toStage: LifecycleStage,
  at: string,
): StageAdvanceDecision {
  if (user.stage === toStage) {
    return { ok: false, reason: `用户当前已在「${toStage}」阶段` }
  }
  if (!canTransition(user.stage, toStage)) {
    return { ok: false, reason: `不允许从「${user.stage}」直接推进到「${toStage}」` }
  }
  const dwell = dwellDaysOf(model, user.stage)
  const stayed = daysBetween(user.stageEnteredAt, at)
  if (stayed < dwell) {
    return {
      ok: false,
      reason: `「${user.stage}」阶段需停留满 ${dwell} 天，当前仅 ${Math.max(stayed, 0)} 天`,
    }
  }
  if (user.stage === '流失' && toStage === '回归' && stayed > model.regressionWindowDays) {
    return { ok: false, reason: `超过回归条件窗口（流失后 ${model.regressionWindowDays} 天内回访）` }
  }
  if (user.stage === '回归' && toStage === '活跃' && stayed > model.regressionGraceDays) {
    return { ok: false, reason: `已超过回归宽限期 ${model.regressionGraceDays} 天` }
  }
  return { ok: true }
}

export type EligibilityDecision = { eligible: boolean; reason: string }

/**
 * 名单资格规则：
 * - 活跃层：已进入活跃阶段，且最近活跃距今不超过流失周期天；
 * - 回归层：处于回归宽限期内，保留再次入组时间，最近活跃不超过流失周期天；
 * - 流失层及更早阶段：不进入实验白名单。
 */
export function evaluateEligibility(
  model: LifecycleModelRuntime,
  user: LifecycleUser,
  at: string,
): EligibilityDecision {
  if (user.stage === '流失') {
    return { eligible: false, reason: '流失层用户不进入新白名单' }
  }
  if (user.stage === '获客' || user.stage === '培育') {
    return { eligible: false, reason: `仍处于${user.stage}阶段，尚未进入活跃或回归层` }
  }
  if (parseTime(user.stageEnteredAt) > parseTime(at)) {
    return { eligible: false, reason: '进入当前阶段晚于名单生成时间' }
  }
  const inactiveDays = daysBetween(user.lastActiveAt, at)
  if (inactiveDays > model.churnCycleDays) {
    return {
      eligible: false,
      reason: `连续 ${Math.max(inactiveDays, 0)} 天无活跃，超过流失周期 ${model.churnCycleDays} 天`,
    }
  }
  if (user.stage === '回归') {
    if (!user.reentryAt) {
      return { eligible: false, reason: '回归用户缺少再次入组时间' }
    }
    if (parseTime(user.reentryAt) > parseTime(at)) {
      return { eligible: false, reason: '再次入组时间晚于名单生成时间' }
    }
    const graceDays = daysBetween(user.stageEnteredAt, at)
    if (graceDays > model.regressionGraceDays) {
      return { eligible: false, reason: `回归宽限期已过（${model.regressionGraceDays} 天）` }
    }
  }
  return { eligible: true, reason: '可入组' }
}

/**
 * 生成分层白名单预览。
 * 只做计算，不写任何数据；确认时再把同一份结果落到实验分流结果里。
 */
export function buildStageWhitelistPreview(
  runtime: LifecycleRuntime,
  plans: PlanConfigStore,
  request: PreviewRequest,
): PreviewOutcome {
  const model = modelOf(runtime, request.modelId)
  if (!model) {
    return { ok: false, message: `没有找到生命周期模型 ${request.modelId}` }
  }
  const plan = planOf(plans, request.planId)
  if (!plan) {
    return { ok: false, message: `没有找到分流方案 ${request.planId}` }
  }
  if (!LIFECYCLE_STAGES.includes(request.targetStage)) {
    return { ok: false, message: `未知的生命周期阶段「${request.targetStage}」` }
  }
  if (parseTime(request.at) === 0) {
    return { ok: false, message: `名单生成时间「${request.at}」不是合法时间` }
  }
  const advanceDecision = evaluateModelTransition(model, request.targetStage, request.at)
  if (!advanceDecision.ok) {
    return { ok: false, message: advanceDecision.reason }
  }
  if (plan.ratios[request.targetStage] === undefined) {
    return { ok: false, message: `分流方案 ${plan.planId} 未配置「${request.targetStage}」阶段的分流比例` }
  }

  const nextVersion =
    request.targetStage === model.currentStage ? model.stageVersion : model.stageVersion + 1
  const versionLabel = stageVersionLabel(model.modelId, request.targetStage, nextVersion)
  const ratio = plan.ratios[request.targetStage] ?? 0
  const modelUsers = usersOf(runtime, model.modelId)

  const population: StagePopulation[] = LIFECYCLE_STAGES.map((stage) => {
    const rows = modelUsers.filter((user) => user.stage === stage)
    const eligible = rows.filter((user) => evaluateEligibility(model, user, request.at).eligible).length
    return {
      stage,
      total: rows.length,
      eligible,
      selected: stage === request.targetStage ? eligible : 0,
    }
  })

  const whitelist: WhitelistMember[] = []
  const excluded: ExcludedUser[] = []
  for (const user of modelUsers) {
    const decision = evaluateEligibility(model, user, request.at)
    if (user.stage !== request.targetStage) {
      excluded.push({
        userId: user.userId,
        stage: user.stage,
        reason: decision.eligible
          ? `当前处于${user.stage}层，不属于目标${request.targetStage}层`
          : decision.reason,
      })
      continue
    }
    if (!decision.eligible) {
      excluded.push({ userId: user.userId, stage: user.stage, reason: decision.reason })
      continue
    }
    const bucket = bucketOf(plan.planId, request.targetStage, versionLabel, user.userId)
    const group = groupOf(bucket, ratio, plan.groupLabels, plan.groupCodes)
    whitelist.push({
      userId: user.userId,
      stage: user.stage,
      stageRevision: user.stageRevision,
      groupCode: group.groupCode,
      groupLabel: group.groupLabel,
      bucket,
      ratio,
      stageEnteredAt: user.stageEnteredAt,
      reentryAt: user.reentryAt,
      lastActiveAt: user.lastActiveAt,
    })
  }
  whitelist.sort((left, right) => (left.bucket === right.bucket ? left.userId.localeCompare(right.userId) : left.bucket - right.bucket))
  excluded.sort((left, right) => (left.stage === right.stage ? left.userId.localeCompare(right.userId) : STAGE_ORDER[left.stage] - STAGE_ORDER[right.stage]))

  const experimentCount = whitelist.filter((member) => member.groupCode === plan.groupCodes[0]).length
  const actualRatio = whitelist.length === 0 ? 0 : Math.round((experimentCount / whitelist.length) * 1000) / 10

  const fingerprint = fingerprintOf({
    modelId: model.modelId,
    baseStage: model.currentStage,
    baseStageVersion: model.stageVersion,
    baseUpdatedAt: model.updatedAt,
    targetStage: request.targetStage,
    nextVersion,
    planId: plan.planId,
    ratio,
    groupLabels: plan.groupLabels,
    at: request.at,
    whitelist: whitelist.map((member) => [member.userId, member.stageRevision, member.stage, member.groupCode, member.bucket]),
  })

  return {
    ok: true,
    preview: {
      request,
      modelId: model.modelId,
      modelName: model.name,
      planId: plan.planId,
      planName: plan.planName,
      targetStage: request.targetStage,
      fromStage: model.currentStage,
      nextStageVersion: nextVersion,
      baseStageVersion: model.stageVersion,
      baseModelUpdatedAt: model.updatedAt,
      stageVersionLabel: versionLabel,
      advanceRequired: request.targetStage !== model.currentStage,
      splitType: plan.splitType,
      ratio,
      actualRatio,
      groupLabels: plan.groupLabels,
      groupCodes: plan.groupCodes,
      page: plan.page,
      mutex: plan.mutex,
      whitelist,
      excluded,
      population,
      fingerprint,
    },
  }
}

/**
 * 把预览结果转成正式实验分流结果，并同时推进生命周期模型阶段。
 * 纯函数：返回新的运行时与实验结果，由持久化层负责一次性写入与失败回滚。
 */
export function applyStageWhitelistCommit(
  runtime: LifecycleRuntime,
  plans: PlanConfigStore,
  experiments: ExperimentStore,
  preview: StageWhitelistPreview,
): CommitOutcome {
  const model = modelOf(runtime, preview.modelId)
  if (!model) {
    return { ok: false, message: `没有找到生命周期模型 ${preview.modelId}` }
  }
  if (
    model.currentStage !== preview.fromStage ||
    model.stageVersion !== preview.baseStageVersion ||
    model.updatedAt !== preview.baseModelUpdatedAt
  ) {
    return { ok: false, message: '生命周期阶段已变化，请重新预览后再确认' }
  }
  const fresh = buildStageWhitelistPreview(runtime, plans, preview.request)
  if (!fresh.ok) {
    return { ok: false, message: fresh.message }
  }
  if (fresh.preview.fingerprint !== preview.fingerprint) {
    return { ok: false, message: '分层人群或分流配置已变化，请重新预览后再确认' }
  }
  if (!planOf(plans, preview.planId)) {
    return { ok: false, message: `没有找到分流方案 ${preview.planId}` }
  }

  const nextRuntime = clone(runtime)
  const nextModel = nextRuntime.models.find((item) => item.modelId === preview.modelId)
  if (!nextModel) {
    return { ok: false, message: `运行时缺少生命周期模型 ${preview.modelId}` }
  }
  if (preview.advanceRequired) {
    nextModel.currentStage = preview.targetStage
    nextModel.stageVersion = preview.nextStageVersion
    nextModel.stageEnteredAt = preview.request.at
    nextModel.history.push({
      version: preview.nextStageVersion,
      stage: preview.targetStage,
      fromStage: preview.fromStage,
      enteredAt: preview.request.at,
      reason: `生成 ${preview.planId} ${preview.targetStage}分层白名单`,
    })
  }
  nextModel.updatedAt = preview.request.at

  const result: ExperimentResult = {
    id: `${preview.planId}:${preview.modelId}:V${preview.nextStageVersion}`,
    planId: preview.planId,
    planName: preview.planName,
    modelId: preview.modelId,
    stage: preview.targetStage,
    stageVersion: preview.nextStageVersion,
    stageVersionLabel: preview.stageVersionLabel,
    generatedAt: preview.request.at,
    splitType: preview.splitType,
    ratio: preview.ratio,
    actualRatio: preview.actualRatio,
    groupLabels: preview.groupLabels,
    groupCodes: preview.groupCodes,
    page: preview.page,
    mutex: preview.mutex,
    whitelist: clone(preview.whitelist),
    excluded: clone(preview.excluded),
    population: clone(preview.population),
    fingerprint: preview.fingerprint,
    operator: preview.request.operator,
  }

  const nextExperiments: ExperimentStore = {
    ...clone(experiments),
    results: [result, ...experiments.results.filter((item) => item.id !== result.id)].slice(0, 50),
  }

  return {
    ok: true,
    runtime: nextRuntime,
    experiments: nextExperiments,
    result,
  }
}

/**
 * 推进单个用户的生命周期阶段。
 * 使用 stageRevision 做乐观锁：两处同时推进同一用户时，只有先写入的版本被接受，
 * 后到的调用会收到冲突提示，不会覆盖已生效的阶段。
 */
export function advanceUserStage(
  runtime: LifecycleRuntime,
  input: {
    modelId: string
    userId: string
    toStage: LifecycleStage
    at: string
    expectedRevision: number
    operator: string
    reason?: string
  },
): UserAdvanceOutcome {
  const model = modelOf(runtime, input.modelId)
  if (!model) {
    return { ok: false, message: `没有找到生命周期模型 ${input.modelId}`, conflict: false }
  }
  const user = runtime.users.find(
    (item) => item.modelId === input.modelId && item.userId === input.userId,
  )
  if (!user) {
    return { ok: false, message: `没有找到用户 ${input.userId}`, conflict: false }
  }
  if (user.stageRevision !== input.expectedRevision) {
    return {
      ok: false,
      message: `${input.userId} 的阶段已被另一处推进到「${user.stage}」（版本 ${user.stageRevision}），本次操作未生效`,
      conflict: true,
    }
  }
  const decision = evaluateUserTransition(model, user, input.toStage, input.at)
  if (!decision.ok) {
    return { ok: false, message: decision.reason, conflict: false }
  }
  const sameMoment = runtime.transitions.find(
    (item) =>
      item.modelId === input.modelId &&
      item.userId === input.userId &&
      parseTime(item.at) === parseTime(input.at) &&
      item.revision >= user.stageRevision,
  )
  if (sameMoment) {
    return {
      ok: false,
      message: `${input.userId} 在同一时间点已接受「${sameMoment.toStage}」阶段，本次推进被拒绝`,
      conflict: true,
    }
  }

  const nextRuntime = clone(runtime)
  const nextUser = nextRuntime.users.find(
    (item) => item.modelId === input.modelId && item.userId === input.userId,
  )
  if (!nextUser) {
    return { ok: false, message: `没有找到用户 ${input.userId}`, conflict: false }
  }
  const fromStage = nextUser.stage
  nextUser.stage = input.toStage
  nextUser.stageRevision = nextUser.stageRevision + 1
  nextUser.stageEnteredAt = input.at
  if (input.toStage === '回归') {
    nextUser.reentryAt = nextUser.reentryAt ?? input.at
  } else if (input.toStage === '活跃' && fromStage === '回归') {
    // 回到活跃层后仍保留回归时的再次入组时间，供实验名单展示。
    nextUser.reentryAt = nextUser.reentryAt ?? input.at
  }
  nextRuntime.transitions.unshift({
    id: `TR-${input.userId}-${nextUser.stageRevision}-${parseTime(input.at)}`,
    modelId: input.modelId,
    userId: input.userId,
    fromStage,
    toStage: input.toStage,
    at: input.at,
    revision: nextUser.stageRevision,
    operator: input.operator,
    reason: input.reason ?? '手工推进阶段',
  })
  nextRuntime.transitions = nextRuntime.transitions.slice(0, 100)

  return {
    ok: true,
    runtime: nextRuntime,
    user: nextUser,
    message: `${input.userId} 已从「${fromStage}」推进到「${input.toStage}」，阶段版本 ${nextUser.stageRevision}`,
  }
}
