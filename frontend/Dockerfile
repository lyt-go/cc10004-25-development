# 构建阶段：锁定依赖、跑类型检查与测试，再产出静态资源。
FROM node:22-alpine AS build
WORKDIR /srv/web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run typecheck
RUN npm test
RUN npm run build

# 运行阶段：只带生产依赖和 dist，由 vite preview 提供静态服务。
FROM node:22-alpine AS runtime
WORKDIR /srv/web
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /srv/web/dist ./dist
COPY --from=build /srv/web/vite.config.ts ./vite.config.ts
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5173/ >/dev/null || exit 1
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
