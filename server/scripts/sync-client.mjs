/**
 * 把前端构建产物 client/dist 同步到 server/public，
 * 使后端能以单端口同时提供页面与 API（生产模式 / 部署用）。
 */
import { cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = join(projectRoot, 'client', 'dist');
const dst = join(projectRoot, 'server', 'public');

if (!existsSync(src)) {
  console.error('找不到 client/dist，请先执行：cd client && npm install && npm run build');
  process.exit(1);
}

await rm(dst, { recursive: true, force: true });
await cp(src, dst, { recursive: true });
console.log('已将前端产物同步到 server/public');
