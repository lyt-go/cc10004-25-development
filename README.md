# 数据产品运营与归因分析平台

面向数据产品运营、渠道归因、用户行为分析、ROI评估、转化优化与数据应用监控的数据分析工程平台。

这是一个**纯前端**管理平台：React + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 React + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/api/lifecycle-service.ts  生命周期分层白名单：预览、确认写入、分流配置同步
│   ├── src/domain/lifecycle.ts   生命周期规则（阶段定义、资格、分桶、并发推进）
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化 / 迁移
│   ├── scripts/migrate-local.mjs 本地开发库与示例数据迁移
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .github/workflows/frontend-pipeline.yml   构建 → 部署 → 上线流水线
└── docker-compose.yml        迁移任务 + 前端服务
```

## 生命周期分层白名单

生命周期页（`/lifecycle`）下半部分是「按生命周期阶段生成白名单」：

1. 选择生命周期模型、目标阶段和分流方案，设置名单生成时间；
2. **预览**分层人群、分组标识与预计分流比例——只计算，不写任何数据；
3. **确认并写入**：生命周期模型阶段推进、实验分流结果、分流配置（ABGR）展示字段
   通过一次原子写入同时生效；任一步失败会回滚，保留原实验结果。

规则要点（`src/domain/lifecycle.ts`）：

- 活跃层与回归层分别按各自阶段规则分层，回归用户保留「再次入组时间」；
- 流失层及获客/培育阶段用户不进入新白名单，不会沿用旧名单；
- 每个阶段有停留阈值，流失后回归窗口、回归宽限期由模型定义；
- 用户推进使用 `stageRevision` 乐观锁：两处同时推进同一用户只接受一个当前阶段。

示例数据：LIFE-0002 于 2026-11-08 由培育进入活跃，ABGR-0002 于 11-10 生成活跃层名单；
当前模型已推进到回归（V5），ABGR-0002 的白名单是回归分层，实验结果记录阶段版本
`LIFE-0002@回归/V5`，流失层用户（U-2007 / U-2008）不在名单里。

## 启动

```bash
cd frontend
npm ci
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

```bash
cd frontend
npm test          # 领域规则、迁移、页面交互测试
npm run build     # 类型检查 + 生产构建
npm run migrate:local   # 本地开发库 / 示例数据迁移（可重复执行）
```

`npm run dev` 首次打开时会自动执行一次浏览器内数据迁移，旧 localStorage 数据会补上新字段。

## 构建 / 部署 / 上线

`.github/workflows/frontend-pipeline.yml` 分三段：

1. **构建**：`npm ci` → 类型检查 → 测试 → 生产构建 → 上传 dist 与本地数据快照；
2. **部署**：构建并推送前端镜像；
3. **上线**：先跑 `migrate:local` 完成本地数据与示例数据迁移，再 `docker compose up -d --wait`
   并做健康检查。

本地模拟整条流水线：

```bash
make pipeline
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 渠道管理 | `channel` | 渠道配置 | 渠道编号、渠道名称、渠道类型 |
| 投放活动 | `campaign` | 投放活动 | 活动编号、活动名称、关联渠道 |
| 触点追踪 | `touchpoint` | 触点记录 | 触点编号、用户标识、触点类型 |
| 归因分析 | `attribution` | 归因模型 | 模型编号、模型名称、归因算法 |
| ROI评估 | `roi` | ROI报告 | 报告编号、关联活动、投入金额 |
| 转化漏斗 | `conversion` | 转化定义 | 转化编号、转化名称、步骤序列 |
| 用户路径 | `userpath` | 路径模式 | 模式编号、路径名称、节点序列 |
| 留存分析 | `retention` | 留存方案 | 方案编号、方案名称、初始事件 |
| 事件定义 | `eventdef` | 埋点事件 | 事件编号、事件名称、事件类型 |
| 用户画像 | `profile` | 画像定义 | 画像编号、画像名称、统计维度 |
| 热力分析 | `heatmap` | 热力方案 | 方案编号、页面名称、热力类型 |
| 竞品对标 | `benchmark` | 对标方案 | 方案编号、对标对象、对比指标 |
| 数据审计 | `auditcheck` | 审计规则 | 规则编号、审计对象、校验字段 |
| 分流配置 | `abgroup` | 分流方案 | 方案编号、分流类型、分流比例、分组标识、白名单用户、阶段版本 |
| 可视化配置 | `dataviz` | 图表配置 | 配置编号、图表名称、图表类型 |
| 舆情分析 | `sentiment` | 舆情方案 | 方案编号、监控主题、关键词集合 |
| 生命周期 | `lifecycle` | 生命周期模型 | 模型编号、生命周期阶段、阶段定义事件、阶段停留阈值、流失周期天、回归条件 |
| 运营预警 | `opsalert` | 预警规则 | 预警编号、监控指标、比较方式 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.tsx`，页面只负责渲染，读写统一走
  `frontend/src/api/`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` / `lifecycle-service.ts` 里改，页面组件不做业务判断。
- 生命周期领域规则全部是纯函数（`src/domain/lifecycle.ts`），页面、持久化与迁移脚本共用。
- 想回到初始数据：清掉浏览器里 `data-product-ops:*` 相关项，或调用 `resetModule(模块)`。

领域：数据工程
子方向：数据分析与数据应用
