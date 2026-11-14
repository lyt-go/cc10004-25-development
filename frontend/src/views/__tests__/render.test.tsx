import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'

import LifecycleView from '@/views/lifecycle'
import AbgroupView from '@/views/abgroup'

describe('页面渲染', () => {
  it('生命周期页展示阶段定义、停留阈值、流失周期天、回归条件与 ABGR-0002 配置', () => {
    const html = renderToString(<LifecycleView />)
    expect(html).toContain('按生命周期阶段生成白名单')
    expect(html).toContain('阶段定义事件')
    expect(html).toContain('阶段停留阈值')
    expect(html).toContain('流失周期天')
    expect(html).toContain('回归条件')
    expect(html).toContain('回访会话（return_session）')
    expect(html).toContain('生命周期分层分流')
    expect(html).toContain('A=实验组A / B=对照组B')
    expect(html).toContain('数据看板首页')
    expect(html).toContain('U-2004')
  })

  it('分流配置页展示阶段版本、白名单与未入选原因', () => {
    const html = renderToString(<AbgroupView />)
    expect(html).toContain('实验分流结果')
    expect(html).toContain('LIFE-0002@回归/V5')
    expect(html).toContain('再次入组时间')
    expect(html).toContain('流失层用户不进入新白名单')
    expect(html).toContain('未入选人群')
  })
})
