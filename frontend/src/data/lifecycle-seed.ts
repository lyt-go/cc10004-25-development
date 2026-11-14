import type {
  ExperimentStore,
  LifecycleRuntime,
  LifecycleStage,
  PlanConfigStore,
  StageDefinition,
  StageHistoryEntry,
} from '../domain/lifecycle'

/**
 * 生命周期 / 分流实验的示例数据。
 *
 * 场景：LIFE-0002 于 2026-11-08 由培育进入活跃，11-10 生成 ABGR-0002 活跃层名单；
 * 之后用户陆续流失并回归，模型当前处于「回归」阶段（V5），名单改为回归分层，
 * 仍在流失层的用户不进入新白名单。
 */

const stageDefinitions: StageDefinition[] = [
  {
    stage: '获客',
    event: '注册完成（signup_completed）',
    dwellDays: 1,
    description: '完成注册、尚未产生关键行为',
  },
  {
    stage: '培育',
    event: '关键功能激活（activation_completed）',
    dwellDays: 2,
    description: '注册后完成首次关键功能，进入培育期',
  },
  {
    stage: '活跃',
    event: '周活跃会话（weekly_active_session）',
    dwellDays: 3,
    description: '近 7 天至少 3 次有效会话，视为活跃',
  },
  {
    stage: '流失',
    event: '连续 30 天无活跃（churn_timeout）',
    dwellDays: 1,
    description: '超过流失周期未回访，进入流失层',
  },
  {
    stage: '回归',
    event: '回访会话（return_session）',
    dwellDays: 1,
    description: '流失后窗口期内再次回访，进入回归期',
  },
]

const history: StageHistoryEntry[] = [
  {
    version: 1,
    stage: '获客',
    fromStage: null,
    enteredAt: '2026-09-25T09:00:00+08:00',
    reason: '模型启用',
  },
  {
    version: 2,
    stage: '培育',
    fromStage: '获客',
    enteredAt: '2026-10-01T09:00:00+08:00',
    reason: '注册转化达标，进入培育阶段',
  },
  {
    version: 3,
    stage: '活跃',
    fromStage: '培育',
    enteredAt: '2026-11-08T09:00:00+08:00',
    reason: '培育阶段停留达标，进入活跃阶段',
  },
  {
    version: 4,
    stage: '流失',
    fromStage: '活跃',
    enteredAt: '2026-11-11T09:00:00+08:00',
    reason: '活跃阶段留存活跃度跌破阈值，进入流失阶段',
  },
  {
    version: 5,
    stage: '回归',
    fromStage: '流失',
    enteredAt: '2026-11-12T09:00:00+08:00',
    reason: '流失后 15 天内回访，进入回归阶段',
  },
]

export const LIFECYCLE_RUNTIME_SEED: LifecycleRuntime = {
  schemaVersion: 2,
  models: [
    {
      modelId: 'LIFE-0002',
      name: '用户生命周期主模型',
      currentStage: '回归',
      stageVersion: 5,
      stageEnteredAt: '2026-11-12T09:00:00+08:00',
      stageDefinitions,
      churnCycleDays: 30,
      regressionWindowDays: 15,
      regressionGraceDays: 7,
      history,
      updatedAt: '2026-11-12T09:00:00+08:00',
    },
  ],
  users: [
    {
      userId: 'U-2001',
      modelId: 'LIFE-0002',
      stage: '活跃',
      stageRevision: 3,
      stageEnteredAt: '2026-11-09T09:00:00+08:00',
      lastActiveAt: '2026-11-13T20:00:00+08:00',
      reentryAt: null,
      note: '自然进入活跃层',
    },
    {
      userId: 'U-2002',
      modelId: 'LIFE-0002',
      stage: '活跃',
      stageRevision: 5,
      stageEnteredAt: '2026-11-10T09:00:00+08:00',
      lastActiveAt: '2026-11-13T18:00:00+08:00',
      reentryAt: '2026-11-10T09:00:00+08:00',
      note: '回归后回到活跃层，保留再次入组时间',
    },
    {
      userId: 'U-2003',
      modelId: 'LIFE-0002',
      stage: '活跃',
      stageRevision: 3,
      stageEnteredAt: '2026-11-08T09:30:00+08:00',
      lastActiveAt: '2026-11-12T10:00:00+08:00',
      reentryAt: null,
      note: '活跃层稳定用户',
    },
    {
      userId: 'U-2004',
      modelId: 'LIFE-0002',
      stage: '回归',
      stageRevision: 4,
      stageEnteredAt: '2026-11-12T10:00:00+08:00',
      lastActiveAt: '2026-11-13T19:00:00+08:00',
      reentryAt: '2026-11-12T08:00:00+08:00',
      note: '流失后 2 天回访，处于回归宽限期',
    },
    {
      userId: 'U-2005',
      modelId: 'LIFE-0002',
      stage: '回归',
      stageRevision: 4,
      stageEnteredAt: '2026-11-12T11:00:00+08:00',
      lastActiveAt: '2026-11-12T21:00:00+08:00',
      reentryAt: '2026-11-11T20:00:00+08:00',
      note: '渠道活动召回，进入回归阶段',
    },
    {
      userId: 'U-2006',
      modelId: 'LIFE-0002',
      stage: '回归',
      stageRevision: 4,
      stageEnteredAt: '2026-11-13T08:00:00+08:00',
      lastActiveAt: '2026-11-14T09:00:00+08:00',
      reentryAt: '2026-11-13T07:30:00+08:00',
      note: '流失后 8 天回访，仍在回归窗口内',
    },
    {
      userId: 'U-2007',
      modelId: 'LIFE-0002',
      stage: '流失',
      stageRevision: 3,
      stageEnteredAt: '2026-11-10T09:00:00+08:00',
      lastActiveAt: '2026-10-10T09:00:00+08:00',
      reentryAt: null,
      note: '超过流失周期，仍在流失层',
    },
    {
      userId: 'U-2008',
      modelId: 'LIFE-0002',
      stage: '流失',
      stageRevision: 3,
      stageEnteredAt: '2026-11-05T09:00:00+08:00',
      lastActiveAt: '2026-10-05T09:00:00+08:00',
      reentryAt: null,
      note: '流失层用户，不得进入新白名单',
    },
    {
      userId: 'U-2009',
      modelId: 'LIFE-0002',
      stage: '培育',
      stageRevision: 2,
      stageEnteredAt: '2026-11-06T09:00:00+08:00',
      lastActiveAt: '2026-11-14T08:00:00+08:00',
      reentryAt: null,
      note: '培育期用户，尚未进入活跃层',
    },
    {
      userId: 'U-2010',
      modelId: 'LIFE-0002',
      stage: '获客',
      stageRevision: 1,
      stageEnteredAt: '2026-11-13T09:00:00+08:00',
      lastActiveAt: '2026-11-13T09:00:00+08:00',
      reentryAt: null,
      note: '新注册用户',
    },
  ],
  transitions: [],
}

export const PLAN_CONFIG_SEED: PlanConfigStore = {
  schemaVersion: 2,
  plans: [
    {
      planId: 'ABGR-0002',
      planName: '生命周期分层实验',
      splitType: '生命周期分层分流',
      ratios: { 获客: 10, 培育: 20, 活跃: 50, 流失: 20, 回归: 40 },
      groupLabels: ['实验组A', '对照组B'],
      groupCodes: ['A', 'B'],
      page: '数据看板首页',
      mutex: '同一用户同一阶段仅进入一个实验',
    },
  ],
}

function groupsFor(stage: LifecycleStage, version: number, ratio: number, users: string[]) {
  const labels: [string, string] = ['实验组A', '对照组B']
  const codes: [string, string] = ['A', 'B']
  return users.map((userId) => {
    const input = `ABGR-0002|${stage}|LIFE-0002@${stage}/V${version}|${userId}`
    let hash = 2_166_136_261
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index)
      hash = Math.imul(hash, 16_777_619)
    }
    const bucket = (hash >>> 0) % 10_000
    const inExperiment = bucket < ratio * 100
    return {
      userId,
      stage,
      stageRevision: 0,
      groupCode: codes[inExperiment ? 0 : 1],
      groupLabel: labels[inExperiment ? 0 : 1],
      bucket,
      ratio,
      stageEnteredAt: '',
      reentryAt: null,
      lastActiveAt: '',
    }
  })
}

const activeMembers = groupsFor('活跃', 3, 50, ['U-2001', 'U-2002', 'U-2003'])
const regressionMembers = groupsFor('回归', 5, 40, ['U-2004', 'U-2005', 'U-2006'])

export const EXPERIMENT_STORE_SEED: ExperimentStore = {
  schemaVersion: 2,
  results: [
    {
      id: 'ABGR-0002:LIFE-0002:V5',
      planId: 'ABGR-0002',
      planName: '生命周期分层实验',
      modelId: 'LIFE-0002',
      stage: '回归',
      stageVersion: 5,
      stageVersionLabel: 'LIFE-0002@回归/V5',
      generatedAt: '2026-11-13T09:00:00+08:00',
      splitType: '生命周期分层分流',
      ratio: 40,
      actualRatio: 33.3,
      groupLabels: ['实验组A', '对照组B'],
      groupCodes: ['A', 'B'],
      page: '数据看板首页',
      mutex: '同一用户同一阶段仅进入一个实验',
      whitelist: regressionMembers.map((member, index) => ({
        ...member,
        stageRevision: [4, 4, 4][index],
        stageEnteredAt: ['2026-11-12T10:00:00+08:00', '2026-11-12T11:00:00+08:00', '2026-11-13T08:00:00+08:00'][index],
        reentryAt: ['2026-11-12T08:00:00+08:00', '2026-11-11T20:00:00+08:00', '2026-11-13T07:30:00+08:00'][index],
        lastActiveAt: ['2026-11-13T08:30:00+08:00', '2026-11-12T21:00:00+08:00', '2026-11-13T08:30:00+08:00'][index],
      })),
      excluded: [
        { userId: 'U-2007', stage: '流失', reason: '流失层用户不进入新白名单' },
        { userId: 'U-2008', stage: '流失', reason: '流失层用户不进入新白名单' },
        { userId: 'U-2009', stage: '培育', reason: '仍处于培育阶段，尚未进入活跃或回归层' },
        { userId: 'U-2010', stage: '获客', reason: '仍处于获客阶段，尚未进入活跃或回归层' },
      ],
      population: [
        { stage: '获客', total: 1, eligible: 0, selected: 0 },
        { stage: '培育', total: 1, eligible: 0, selected: 0 },
        { stage: '活跃', total: 3, eligible: 3, selected: 0 },
        { stage: '流失', total: 2, eligible: 0, selected: 0 },
        { stage: '回归', total: 3, eligible: 3, selected: 3 },
      ],
      fingerprint: 'seed0005',
      operator: '值班管理员',
    },
    {
      id: 'ABGR-0002:LIFE-0002:V3',
      planId: 'ABGR-0002',
      planName: '生命周期分层实验',
      modelId: 'LIFE-0002',
      stage: '活跃',
      stageVersion: 3,
      stageVersionLabel: 'LIFE-0002@活跃/V3',
      generatedAt: '2026-11-10T10:00:00+08:00',
      splitType: '生命周期分层分流',
      ratio: 50,
      actualRatio: 66.7,
      groupLabels: ['实验组A', '对照组B'],
      groupCodes: ['A', 'B'],
      page: '数据看板首页',
      mutex: '同一用户同一阶段仅进入一个实验',
      whitelist: activeMembers.map((member, index) => ({
        ...member,
        stageRevision: [3, 5, 3][index],
        stageEnteredAt: ['2026-11-09T09:00:00+08:00', '2026-11-10T09:00:00+08:00', '2026-11-08T09:30:00+08:00'][index],
        reentryAt: [null, '2026-11-10T09:00:00+08:00', null][index],
        lastActiveAt: ['2026-11-10T09:00:00+08:00', '2026-11-10T08:00:00+08:00', '2026-11-10T08:00:00+08:00'][index],
      })),
      excluded: [
        { userId: 'U-2007', stage: '流失', reason: '流失层用户不进入新白名单' },
        { userId: 'U-2009', stage: '培育', reason: '仍处于培育阶段，尚未进入活跃或回归层' },
      ],
      population: [
        { stage: '获客', total: 1, eligible: 0, selected: 0 },
        { stage: '培育', total: 1, eligible: 0, selected: 0 },
        { stage: '活跃', total: 3, eligible: 3, selected: 3 },
        { stage: '流失', total: 2, eligible: 0, selected: 0 },
        { stage: '回归', total: 3, eligible: 0, selected: 0 },
      ],
      fingerprint: 'seed0003',
      operator: '值班管理员',
    },
  ],
}
