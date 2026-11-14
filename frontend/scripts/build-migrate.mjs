// 把 scripts/migrate-local.ts 打包成可直接用 node 运行的 ESM（Node 不会解析 TS 里的
// 无扩展名相对导入，打包后统一处理）。
import { build } from 'esbuild'

await build({
  entryPoints: ['scripts/migrate-local.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'scripts/migrate-local.mjs',
  external: ['node:*'],
  banner: { js: '// 由 esbuild 从 scripts/migrate-local.ts 生成，请勿直接编辑。' },
})
