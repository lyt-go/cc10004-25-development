import { useCallback, useEffect, useMemo, useState } from 'react'

import { downloadEntries, listEntries, moduleMeta, runAction as applyAction } from '@/api/local-service'
import {
  experimentResults,
  experimentsFor,
  latestExperimentFor,
  plans,
} from '@/api/lifecycle-service'
import type { ExperimentResult } from '@/domain/lifecycle'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('abgroup')
const columns = [
  "方案编号",
  "方案名称",
  "分流类型",
  "分流比例",
  "分组标识",
  "互斥规则",
  "生效页面",
  "白名单用户",
  "阶段版本",
  "名单生成时间"
]
const actions = [
  "提交方案评审",
  "生效方案",
  "下线方案"
]
const statuses = [
  "草稿",
  "方案评审中",
  "已生效",
  "已下线"
]
const stats = [
  {
    "label": "分流方案总数",
    "value": 0
  },
  {
    "label": "已生效方案",
    "value": 0
  },
  {
    "label": "方案评审中",
    "value": 0
  }
]

function formatDate(value: string | null): string {
  if (!value) {
    return '—'
  }
  return value.length > 10 ? value.slice(0, 10) : value
}

function ExperimentDetail({ result }: { result: ExperimentResult }) {
  return (
    <article className="panel" data-testid="abgroup-experiment">
      <div className="panel-head">
        <h3>实验分流结果 · {result.id}</h3>
        <span className="legend-item">阶段版本 {result.stageVersionLabel}</span>
      </div>
      <div className="summary-grid">
        <div><span className="stat-label">分流类型</span><strong>{result.splitType}</strong></div>
        <div>
          <span className="stat-label">分流比例</span>
          <strong>{result.stage} 配置 {result.ratio}% · 实际 {result.actualRatio}%</strong>
        </div>
        <div>
          <span className="stat-label">分组标识</span>
          <strong>
            {result.groupCodes[0]}={result.groupLabels[0]} / {result.groupCodes[1]}={result.groupLabels[1]}
          </strong>
        </div>
        <div><span className="stat-label">生效页面</span><strong>{result.page}</strong></div>
        <div><span className="stat-label">生成时间</span><strong>{formatDate(result.generatedAt)}</strong></div>
        <div><span className="stat-label">名单人数</span><strong>{result.whitelist.length}</strong></div>
      </div>
      <h4>白名单用户</h4>
      <table className="data-table compact">
        <thead>
          <tr>
            <th>用户</th>
            <th>阶段</th>
            <th>用户阶段版本</th>
            <th>分组标识</th>
            <th>分桶</th>
            <th>进入阶段</th>
            <th>再次入组时间</th>
          </tr>
        </thead>
        <tbody>
          {result.whitelist.map((member) => (
            <tr key={member.userId}>
              <td>{member.userId}</td>
              <td>{member.stage}</td>
              <td>{member.stageRevision}</td>
              <td>{member.groupCode} · {member.groupLabel}</td>
              <td>{member.bucket}</td>
              <td>{formatDate(member.stageEnteredAt)}</td>
              <td>{formatDate(member.reentryAt)}</td>
            </tr>
          ))}
          {result.whitelist.length === 0 && (
            <tr><td colSpan={7} className="empty-state">本次名单没有符合资格的用户</td></tr>
          )}
        </tbody>
      </table>
      <h4>未入选人群</h4>
      <table className="data-table compact">
        <thead><tr><th>用户</th><th>阶段</th><th>未入选原因</th></tr></thead>
        <tbody>
          {result.excluded.map((item) => (
            <tr key={`${item.userId}-${item.stage}`}>
              <td>{item.userId}</td>
              <td>{item.stage}</td>
              <td className="muted">{item.reason}</td>
            </tr>
          ))}
          {result.excluded.length === 0 && (
            <tr><td colSpan={3} className="empty-state">没有需要排除的用户</td></tr>
          )}
        </tbody>
      </table>
      <h4>历史阶段版本</h4>
      <p className="hint">
        {experimentsFor(result.modelId)
          .map((item) => `${item.stage} ${item.stageVersionLabel}（${item.whitelist.length} 人）`)
          .join(' · ') || '暂无历史版本'}
      </p>
    </article>
  )
}

export default function AbgroupView() {
  const [rows, setRows] = useState<EntryRow[]>([])
  const [total, setTotal] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const filterFields = useMemo(() => columns.slice(0, 3), [])
  const [selectedPlan, setSelectedPlan] = useState(plans()[0]?.planId ?? '')
  const planConfigs = useMemo(() => plans(), [])
  const experiment = useMemo<ExperimentResult | undefined>(() => {
    if (!selectedPlan) {
      return undefined
    }
    const modelIds = new Set(experimentResults().results.map((item) => item.modelId))
    for (const modelId of modelIds) {
      const matched = latestExperimentFor(modelId, selectedPlan)
      if (matched) {
        return matched
      }
    }
    return undefined
  }, [selectedPlan])

  const reload = useCallback(() => {
    setErrorMessage('')
    try {
      const payload = listEntries(meta.key, filters)
      setRows(payload.items)
      setTotal(payload.total)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '分流配置列表读取失败')
    }
  }, [filters])

  useEffect(() => {
    reload()
  }, [reload])

  function runAction(action: string, row: EntryRow) {
    setErrorMessage('')
    const result = applyAction(meta.key, Number(row.id), action)
    if (!result.ok) {
      setErrorMessage(result.message)
      return
    }
    reload()
  }

  return (
    <section className="page" data-module="abgroup">
      <header className="page-head">
        <div>
          <h2>分流配置管理</h2>
          <p className="page-desc">管理数据产品的流量分流配置，支持A/B实验、灰度发布和分层分流。</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" type="button" onClick={() => setErrorMessage('分流方案登记入口尚未接入审批流')}>
            登记分流方案
          </button>
          <button className="btn" type="button" onClick={() => downloadEntries(meta.key)}>
            导出分流配置清单
          </button>
        </div>
      </header>

      <div className="stat-row">
        {stats.map((item) => (
          <article key={item.label} className="stat-card">
            <span className="stat-label">{item.label}</span>
            <strong className="stat-value">{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="filter-bar">
        <label className="filter-item">
          <span>实验分流方案</span>
          <select value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value)}>
            {planConfigs.map((item) => (
              <option key={item.planId} value={item.planId}>{item.planId} · {item.planName}</option>
            ))}
          </select>
        </label>
      </div>

      {experiment && <ExperimentDetail result={experiment} />}

      <p className="status-legend">
        {statuses.map((status: string) => (
          <span key={status} className="legend-item">
            {status}：{rows.filter((row) => String(row.status) === status).length}
          </span>
        ))}
      </p>

      <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); reload() }}>
        {filterFields.map((field) => (
          <label key={field} className="filter-item">
            <span>{field}</span>
            <input
              value={filters[field] ?? ''}
              placeholder={`按${field}检索`}
              onChange={(event) => setFilters((prev) => ({ ...prev, [field]: event.target.value }))}
            />
          </label>
        ))}
        <button className="btn" type="submit">查询</button>
        <button className="btn ghost" type="button" onClick={() => setFilters({})}>重置条件</button>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
            <th>当前状态</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)}>
              {columns.map((column) => <td key={column}>{row[column] ?? '—'}</td>)}
              <td>{row.status}</td>
              <td className="row-actions">
                {actions.map((action) => (
                  <button key={action} className="link" type="button" onClick={() => runAction(action, row)}>
                    {action}
                  </button>
                ))}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="empty-state" colSpan={columns.length + 2}>暂无分流配置数据，可先登记分流方案</td>
            </tr>
          )}
        </tbody>
      </table>

      <footer className="page-foot">
        <span>共 {total} 条分流配置记录</span>
        {errorMessage && <span className="error-text">{errorMessage}</span>}
      </footer>
    </section>
  )
}
