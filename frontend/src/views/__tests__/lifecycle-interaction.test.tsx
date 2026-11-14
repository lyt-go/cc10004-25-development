import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { latestExperimentFor, runtime } from '@/api/lifecycle-service'
import { listRows } from '@/data/local-store'
import LifecycleStagePanel from '@/views/lifecycle/LifecycleStagePanel'

let container: HTMLDivElement
let root: Root

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
    'value',
  )
  descriptor?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function findButton(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(text),
  )
  if (!button) {
    throw new Error(`没有找到按钮：${text}`)
  }
  return button as HTMLButtonElement
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(<LifecycleStagePanel />)
  })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe('生命周期页交互', () => {
  it('先预览再确认，确认前不写实验分流结果，确认后阶段与名单一起生效', () => {
    const before = latestExperimentFor('LIFE-0002', 'ABGR-0002')
    expect(before?.stageVersionLabel).toBe('LIFE-0002@回归/V5')

    const stageSelect = container.querySelectorAll('select')[1] as HTMLSelectElement
    act(() => setValue(stageSelect, '活跃'))

    const previewButton = findButton('预览分层人群')
    act(() => previewButton.click())

    const preview = container.querySelector('[data-testid="stage-preview"]')
    expect(preview).not.toBeNull()
    expect(preview?.textContent).toContain('分层预览')
    expect(preview?.textContent).toContain('U-2002')
    // 预览阶段仍未写库
    expect(latestExperimentFor('LIFE-0002', 'ABGR-0002')?.stageVersionLabel).toBe('LIFE-0002@回归/V5')
    expect(runtime().models[0].currentStage).toBe('回归')

    const commitButton = findButton('确认并写入实验分流结果')
    expect(commitButton.disabled).toBe(false)
    act(() => commitButton.click())

    const latest = latestExperimentFor('LIFE-0002', 'ABGR-0002')
    expect(latest?.stageVersionLabel).toBe('LIFE-0002@活跃/V6')
    expect(runtime().models[0].currentStage).toBe('活跃')

    const abgroup = listRows('abgroup').find((row) => row['方案编号'] === 'ABGR-0002')
    expect(abgroup?.['阶段版本']).toBe('LIFE-0002@活跃/V6')
    expect(container.textContent).toContain('生命周期模型已推进到「活跃」V6')
  })

  it('演练写入失败时保留原实验结果', () => {
    const stageSelect = container.querySelectorAll('select')[1] as HTMLSelectElement
    act(() => setValue(stageSelect, '活跃'))
    act(() => findButton('预览分层人群').click())
    act(() => findButton('演练写入失败').click())

    expect(container.querySelector('.error-text')?.textContent).toMatch(/保留原实验结果/)
    expect(latestExperimentFor('LIFE-0002', 'ABGR-0002')?.stageVersionLabel).toBe('LIFE-0002@回归/V5')
    expect(runtime().models[0].currentStage).toBe('回归')
  })
})
