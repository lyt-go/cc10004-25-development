import { useEffect, useMemo, useState } from 'react'

import {
  abgroupRow,
  advanceStage,
  commitStageWhitelist,
  experimentsFor,
  plans,
  previewStageWhitelist,
  runtime,
  latestExperimentFor,
} from '@/api/lifecycle-service'
import {
  LIFECYCLE_STAGES,
  STAGE_ORDER,
  dwellDaysOf,
  evaluateEligibility,
  nextStagesOf,
  usersOf,
} from '@/domain/lifecycle'
import type {
  ExperimentResult,
  LifecycleModelRuntime,
  LifecycleStage,
  LifecycleUser,
  StageWhitelistPreview,
} from '@/domain/lifecycle'

const OPERATOR = '值班管理员'

function todayIso(): string {
  const now = new Date()
  const offset = -now.getTimezoneOffset()
  const local = new Date(now.getTime() + offset * 60_000)
  return `${local.toISOString().slice(0, 10)}T09:00`
}

function toIso(value: string): string {
  if (!value) {
    return ''
  }
  // datetime-local 给出本地时间，转成带时区的 ISO 字符串再参与比较。
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

function formatDate(value: string | null): string {
  if (!value) {
    return '—'
  }
  return value.length > 10 ? value.slice(0, 10) : value
}

function stageTag(stage: LifecycleStage): string {
  return `stage-tag stage-${STAGE_ORDER[stage]}`
}

export default function LifecycleStagePanel() {
  const [model, setModel] = useState<LifecycleModelRuntime>(runtime().models[0])
  const [users, setUsers] = useState<LifecycleUser[]>(usersOf(runtime(), runtime().models[0].modelId))
  const [selectedStage, setSelectedStage] = useState<LifecycleStage>(runtime().models[0].currentStage)
  const [selectedPlan, setSelectedPlan] = useState(plans()[0]?.planId ?? '')
  const [at, setAt] = useState(todayIso())
  const [preview, setPreview] = useState<StageWhitelistPreview | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState<ExperimentResult | undefined>(
    latestExperimentFor(runtime().models[0].modelId, plans()[0]?.planId),
  )
  const [historyOpen, setHistoryOpen] = useState(false)
  const [advanceInput, setAdvanceInput] = useState<{ userId: string; toStage: LifecycleStage; expectedRevision: number } | null>(null)
  const [conflictNotice, setConflictNotice] = useState('')

  const planOptions = useMemo(() => plans(), [])
  const plan = useMemo(() => planOptions.find((item) => item.planId === selectedPlan), [planOptions, selectedPlan])
  const ratio = plan?.ratios[selectedStage]
  const currentStage = model.currentStage
  const abgroup = useMemo(() => abgroupRow(selectedPlan), [selectedPlan, lastResult, model.updatedAt])

  function refresh() {
    const nextRuntime = runtime()
    const nextModel = nextRuntime.models[0]
    setModel({ ...nextModel })
    setUsers(usersOf(nextRuntime, nextModel.modelId).map((user) => ({ ...user })))
    setLastResult(latestExperimentFor(nextModel.modelId, selectedPlan))
  }

  useEffect(() => {
    setPreview(null)
    setMessage('')
    setError('')
    setConflictNotice('')
  }, [selectedStage, selectedPlan, at])

  function doPreview() {
    setMessage('')
    setError('')
    setPreview(null)
    if (!plan) {
      setError('请选择分流方案')
      return
    }
    if (ratio === undefined) {
      setError(`分流方案 ${plan.planId} 未配置「${selectedStage}」阶段的分流比例`)
      return
    }
    const outcome = previewStageWhitelist({
      modelId: model.modelId,
      targetStage: selectedStage,
      planId: selectedPlan,
      at: toIso(at),
      operator: OPERATOR,
    })
    if (!outcome.ok) {
      setError(outcome.message)
      return
    }
    setPreview(outcome.preview)
    setMessage(
      `预览完成：${outcome.preview.targetStage}分层 ${outcome.preview.whitelist.length} 人，` +
        `实验组 ${outcome.preview.actualRatio}%，确认后才写入实验分流结果`,
    )
  }

  function doCommit(options: { simulateFailure?: boolean } = {}) {
    if (!preview) {
      setError('请先预览分层人群与分组标识')
      return
    }
    setMessage('')
    setError('')
    const outcome = commitStageWhitelist(preview, options)
    if (!outcome.ok) {
      setError(outcome.message)
      if (!options.simulateFailure) {
        setPreview(null)
      } else {
        setMessage(`已按失败路径处理：${outcome.message}`)
      }
      refresh()
      return
    }
    setLastResult(outcome.result)
    setPreview(null)
    refresh()
    setMessage(
      `已写入实验分流结果 ${outcome.result.id}：${outcome.result.stage}分层 ` +
        `${outcome.result.whitelist.length} 人，阶段版本 ${outcome.result.stageVersionLabel}，` +
        `生命周期模型已推进到「${outcome.result.stage}」V${outcome.result.stageVersion}`,
    )
  }

  function requestAdvance(user: LifecycleUser) {
    const nextStage = nextStagesOf(user.stage)[0]
    if (!nextStage) {
      setError(`${user.userId} 当前阶段没有可推进的目标`)
      return
    }
    setAdvanceInput({ userId: user.userId, toStage: nextStage, expectedRevision: user.stageRevision })
    setConflictNotice('')
  }

  function doAdvance() {
    if (!advanceInput) {
      return
    }
    setError('')
    const outcome = advanceStage({
      modelId: model.modelId,
      userId: advanceInput.userId,
      toStage: advanceInput.toStage,
      at: toIso(at),
      expectedRevision: advanceInput.expectedRevision,
      operator: OPERATOR,
    })
    if (!outcome.ok) {
      setError(outcome.message)
      setConflictNotice(outcome.conflict ? outcome.message : '')
      setAdvanceInput(null)
      refresh()
      return
    }
    setMessage(outcome.message)
    setConflictNotice('')
    setAdvanceInput(null)
    refresh()
  }

  // 模拟并发：同一用户同一时间点提交两次，第二次用旧版本号，应被拒绝。
  function simulateConcurrentAdvance(user: LifecycleUser) {
    const nextStage = nextStagesOf(user.stage)[0]
    if (!nextStage) {
      return
    }
    const atValue = toIso(at)
    const before = user.stageRevision
    const first = advanceStage({
      modelId: model.modelId,
      userId: user.userId,
      toStage: nextStage,
      at: atValue,
      expectedRevision: before,
      operator: OPERATOR,
      reason: '并发推进 A',
    })
    if (!first.ok) {
      setError(first.message)
      refresh()
      return
    }
    const second = advanceStage({
      modelId: model.modelId,
      userId: user.userId,
      toStage: nextStage,
      at: atValue,
      expectedRevision: before,
      operator: OPERATOR,
      reason: '并发推进 B',
    })
    if (second.ok) {
      setError(`并发推进未被拦截：${user.userId} 接受了两次阶段推进`)
    } else {
      setMessage(
        `两处同时推进 ${user.userId}：第一处接受「${nextStage}」版本 ${before + 1}；` +
          `第二处被拒绝（${second.message}），白名单命中以已接受的阶段为准`,
      )
    }
    refresh()
  }

  const population = useMemo(() => {
    const atIso = toIso(at)
    return LIFECYCLE_STAGES.map((stage) => {
      const rows = users.filter((user) => user.stage === stage)
      const eligible = rows.filter((user) => evaluateEligibility(model, user, atIso).eligible).length
      return { stage, total: rows.length, eligible }
    })
  }, [users, model, at])

  return (
    <section className="page lifecycle-stage" data-module="lifecycle-stage">
      <header className="page-head">
        <div>
          <h2>按生命周期阶段生成白名单</h2>
          <p className="page-desc">
            选择生命周期模型、目标阶段和分流方案，先预览分层人群与分组标识，确认后同时推进阶段并写入实验分流结果。
          </p>
        </div>
      </header>

      <div className="stage-summary">
        <article className="stat-card">
          <span className="stat-label">当前阶段</span>
          <strong className="stat-value">
            <span className={stageTag(currentStage)}>{currentStage}</span>
          </strong>
          <span className="stat-note">阶段版本 V{model.stageVersion} · 进入于 {formatDate(model.stageEnteredAt)}</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">流失周期天</span>
          <strong className="stat-value">{model.churnCycleDays}</strong>
          <span className="stat-note">超过该天数无活跃即判定流失</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">回归条件</span>
          <strong className="stat-value">{model.regressionWindowDays} 天内回访</strong>
          <span className="stat-note">回归宽限期 {model.regressionGraceDays} 天，超期不能回到活跃层</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">最近实验</span>
          <strong className="stat-value">{lastResult ? lastResult.whitelist.length : 0} 人</strong>
          <span className="stat-note">
            {lastResult ? `${lastResult.stage} · ${lastResult.stageVersionLabel}` : '尚未生成'}
          </span>
        </article>
      </div>

      <p className="hint stage-rule-note">
        名单资格：活跃层需已进入活跃阶段且最近活跃距今不超过 {model.churnCycleDays} 天；回归层需处于
        {model.regressionWindowDays} 天回归窗口与 {model.regressionGraceDays} 天宽限期内，并保留再次入组时间；
        流失层及获客/培育阶段用户不进入新白名单。
      </p>

      <div className="panel-grid">
        <article className="panel">
          <h3>阶段定义</h3>
          <table className="data-table compact">
            <thead>
              <tr><th>阶段</th><th>定义事件</th><th>停留阈值</th><th>说明</th></tr>
            </thead>
            <tbody>
              {model.stageDefinitions.map((definition) => (
                <tr key={definition.stage} className={definition.stage === currentStage ? 'row-current' : ''}>
                  <td><span className={stageTag(definition.stage)}>{definition.stage}</span></td>
                  <td>{definition.event}</td>
                  <td>{definition.dwellDays} 天</td>
                  <td className="muted">{definition.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="panel">
          <h3>当前分层人群</h3>
          <table className="data-table compact">
            <thead>
              <tr><th>阶段</th><th>用户数</th><th>名单资格</th><th>说明</th></tr>
            </thead>
            <tbody>
              {population.map((item) => (
                <tr key={item.stage}>
                  <td><span className={stageTag(item.stage)}>{item.stage}</span></td>
                  <td>{item.total}</td>
                  <td>{item.eligible}</td>
                  <td className="muted">
                    {item.stage === '流失'
                      ? '不进入新白名单'
                      : item.stage === '回归'
                        ? '按回归阶段规则分层'
                        : item.stage === '活跃'
                          ? '按活跃阶段规则分层'
                          : '尚未进入活跃/回归层'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>

      <article className="panel">
        <h3>生成参数</h3>
        <div className="form-grid">
          <label className="filter-item">
            <span>生命周期模型</span>
            <select value={model.modelId} disabled onChange={() => undefined}>
              <option value={model.modelId}>{model.modelId} · {model.name}</option>
            </select>
          </label>
          <label className="filter-item">
            <span>目标阶段</span>
            <select value={selectedStage} onChange={(event) => setSelectedStage(event.target.value as LifecycleStage)}>
              {LIFECYCLE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                  {stage === currentStage ? '（当前）' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-item">
            <span>分流方案</span>
            <select value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value)}>
              {planOptions.map((item) => (
                <option key={item.planId} value={item.planId}>{item.planId} · {item.planName}</option>
              ))}
            </select>
          </label>
          <label className="filter-item">
            <span>名单生成时间</span>
            <input type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} />
          </label>
          <div className="form-actions">
            <button className="btn primary" type="button" onClick={doPreview}>预览分层人群</button>
            <button className="btn" type="button" onClick={() => doCommit()} disabled={!preview}>
              确认并写入实验分流结果
            </button>
            <button className="btn ghost" type="button" onClick={() => doCommit({ simulateFailure: true })} disabled={!preview}>
              演练写入失败
            </button>
          </div>
        </div>
        {plan && (
          <p className="hint">
            方案 {plan.planId} · {plan.splitType} · 目标阶段比例 {ratio ?? '未配置'}% · 生效页面 {plan.page} ·
            互斥规则 {plan.mutex}
          </p>
        )}
        {preview && (
          <p className="hint">
            本次将写入阶段版本 {preview.stageVersionLabel}（{preview.advanceRequired ? '模型阶段推进 +1' : '沿用当前阶段'}），
            预览指纹 {preview.fingerprint}，确认前不会改动任何数据。
          </p>
        )}
      </article>

      {abgroup && (
        <article className="panel" data-testid="abgroup-summary">
          <div className="panel-head">
            <h3>分流方案 {selectedPlan} · {String(abgroup['方案名称'] ?? '')}</h3>
            <span className="legend-item">{String(abgroup['阶段版本'] ?? '—')}</span>
          </div>
          <div className="summary-grid">
            <div><span className="stat-label">分流类型</span><strong>{String(abgroup['分流类型'] ?? '—')}</strong></div>
            <div><span className="stat-label">分流比例</span><strong>{String(abgroup['分流比例'] ?? '—')}</strong></div>
            <div><span className="stat-label">分组标识</span><strong>{String(abgroup['分组标识'] ?? '—')}</strong></div>
            <div><span className="stat-label">生效页面</span><strong>{String(abgroup['生效页面'] ?? '—')}</strong></div>
            <div><span className="stat-label">互斥规则</span><strong>{String(abgroup['互斥规则'] ?? '—')}</strong></div>
            <div><span className="stat-label">名单生成时间</span><strong>{formatDate(String(abgroup['名单生成时间'] ?? ''))}</strong></div>
          </div>
          <h4>白名单用户</h4>
          <p className="hint">{String(abgroup['白名单用户'] ?? '—')}</p>
        </article>
      )}

      <article className="panel">
        <h3>生命周期模型阶段轨迹</h3>
        <table className="data-table compact">
          <thead><tr><th>版本</th><th>阶段</th><th>来源阶段</th><th>进入时间</th><th>说明</th></tr></thead>
          <tbody>
            {model.history.map((entry) => (
              <tr key={entry.version}>
                <td>V{entry.version}</td>
                <td><span className={stageTag(entry.stage)}>{entry.stage}</span></td>
                <td>{entry.fromStage ?? '—'}</td>
                <td>{formatDate(entry.enteredAt)}</td>
                <td className="muted">{entry.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      {preview && (
        <article className="panel" data-testid="stage-preview">
          <h3>分层预览 · {preview.targetStage}层</h3>
          <div className="preview-grid">
            <div>
              <h4>分层人群</h4>
              <table className="data-table compact">
                <thead><tr><th>阶段</th><th>总人数</th><th>有资格</th><th>本次入选</th></tr></thead>
                <tbody>
                  {preview.population.map((item) => (
                    <tr key={item.stage} className={item.stage === preview.targetStage ? 'row-current' : ''}>
                      <td><span className={stageTag(item.stage)}>{item.stage}</span></td>
                      <td>{item.total}</td>
                      <td>{item.eligible}</td>
                      <td>{item.stage === preview.targetStage ? item.selected : 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">
                预计分流比例：目标 {preview.ratio}% · 实际 {preview.actualRatio}% ·
                分组标识 {preview.groupCodes[0]}={preview.groupLabels[0]} / {preview.groupCodes[1]}={preview.groupLabels[1]}
              </p>
            </div>
            <div>
              <h4>白名单与分组</h4>
              <table className="data-table compact">
                <thead>
                  <tr><th>用户</th><th>阶段</th><th>分组标识</th><th>分桶</th><th>再次入组时间</th></tr>
                </thead>
                <tbody>
                  {preview.whitelist.map((member) => (
                    <tr key={member.userId}>
                      <td>{member.userId}</td>
                      <td>{member.stage}</td>
                      <td>{member.groupCode} · {member.groupLabel}</td>
                      <td>{member.bucket}</td>
                      <td>{formatDate(member.reentryAt)}</td>
                    </tr>
                  ))}
                  {preview.whitelist.length === 0 && (
                    <tr><td colSpan={5} className="empty-state">该阶段当前没有符合资格的用户</td></tr>
                  )}
                </tbody>
              </table>
              <h4>未入选人群</h4>
              <table className="data-table compact">
                <thead><tr><th>用户</th><th>阶段</th><th>原因</th></tr></thead>
                <tbody>
                  {preview.excluded.map((item) => (
                    <tr key={item.userId}>
                      <td>{item.userId}</td>
                      <td>{item.stage}</td>
                      <td className="muted">{item.reason}</td>
                    </tr>
                  ))}
                  {preview.excluded.length === 0 && (
                    <tr><td colSpan={3} className="empty-state">没有需要排除的用户</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      )}

      <article className="panel">
        <div className="panel-head">
          <h3>用户阶段推进（同一用户只接受一个当前阶段）</h3>
          <button className="link" type="button" onClick={() => setHistoryOpen((value) => !value)}>
            {historyOpen ? '收起推进记录' : '展开推进记录'}
          </button>
        </div>
        <table className="data-table compact">
          <thead>
            <tr><th>用户</th><th>当前阶段</th><th>版本</th><th>进入阶段</th><th>最近活跃</th><th>再次入组时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId}>
                <td>{user.userId}</td>
                <td><span className={stageTag(user.stage)}>{user.stage}</span></td>
                <td>{user.stageRevision}</td>
                <td>{formatDate(user.stageEnteredAt)}</td>
                <td>{formatDate(user.lastActiveAt)}</td>
                <td>{formatDate(user.reentryAt)}</td>
                <td className="row-actions">
                  <button className="link" type="button" onClick={() => requestAdvance(user)}>
                    推进到{nextStagesOf(user.stage)[0] ?? '—'}
                  </button>
                  <button className="link" type="button" onClick={() => simulateConcurrentAdvance(user)}>
                    模拟并发推进
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {advanceInput && (
          <div className="advance-bar">
            <span>
              将对 {advanceInput.userId} 提交「{advanceInput.toStage}」阶段，期望版本 {advanceInput.expectedRevision}，
              停留阈值：{dwellDaysOf(model, users.find((user) => user.userId === advanceInput.userId)?.stage ?? '获客')} 天
            </span>
            <button className="btn primary" type="button" onClick={doAdvance}>提交推进</button>
            <button className="btn ghost" type="button" onClick={() => setAdvanceInput(null)}>取消</button>
          </div>
        )}
        {historyOpen && (
          <table className="data-table compact">
            <thead><tr><th>用户</th><th>原阶段</th><th>目标阶段</th><th>生效时间</th><th>版本</th><th>原因</th></tr></thead>
            <tbody>
              {runtime().transitions.length === 0 && (
                <tr><td colSpan={6} className="empty-state">本次会话还没有用户阶段推进记录</td></tr>
              )}
              {runtime().transitions.map((item) => (
                <tr key={item.id}>
                  <td>{item.userId}</td>
                  <td>{item.fromStage}</td>
                  <td>{item.toStage}</td>
                  <td>{item.at}</td>
                  <td>{item.revision}</td>
                  <td className="muted">{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      {lastResult && (
        <article className="panel">
          <h3>实验分流结果 · {lastResult.id}</h3>
          <p className="hint">
            {lastResult.planId} · 目标阶段 {lastResult.stage} · 阶段版本 {lastResult.stageVersionLabel} ·
            生成时间 {lastResult.generatedAt} · 操作人 {lastResult.operator}
          </p>
          <table className="data-table compact">
            <thead>
              <tr><th>用户</th><th>阶段</th><th>用户阶段版本</th><th>分组标识</th><th>分桶</th><th>再次入组时间</th></tr>
            </thead>
            <tbody>
              {lastResult.whitelist.map((member) => (
                <tr key={member.userId}>
                  <td>{member.userId}</td>
                  <td>{member.stage}</td>
                  <td>{member.stageRevision}</td>
                  <td>{member.groupCode} · {member.groupLabel}</td>
                  <td>{member.bucket}</td>
                  <td>{formatDate(member.reentryAt)}</td>
                </tr>
              ))}
              {lastResult.whitelist.length === 0 && (
                <tr><td colSpan={6} className="empty-state">该实验没有白名单用户</td></tr>
              )}
            </tbody>
          </table>
          {experimentsFor(model.modelId).length > 1 && (
            <p className="hint">历史实验：{experimentsFor(model.modelId).map((item) => `${item.stage} ${item.stageVersionLabel}`).join(' · ')}</p>
          )}
        </article>
      )}

      <footer className="page-foot">
        <span>
          {message || conflictNotice || '预览不写数据；确认后阶段推进与白名单写入同时成功，失败保留原实验结果'}
        </span>
        {error && <span className="error-text">{error}</span>}
      </footer>
    </section>
  )
}
