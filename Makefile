.PHONY: install frontend build test migrate-local pipeline

install:
	cd frontend && npm ci

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

test:
	cd frontend && npm test

# 本地数据迁移：把 .local/dev-db.json（本地开发库 + 示例数据）升到当前 schema。
migrate-local:
	cd frontend && npm run migrate:local

# 模拟上线流水线：安装 → 类型检查 → 测试 → 构建 → 迁移。
pipeline: install test build migrate-local
