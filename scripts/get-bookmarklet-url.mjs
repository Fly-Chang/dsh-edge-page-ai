/**
 * 打印书签说明页完整 URL（供批处理脚本调用）。
 * 用法: node scripts/get-bookmarklet-url.mjs
 */
import { loadConfig } from '../src/gateway/config.js';

const config = loadConfig();
const { host, port, token } = config.gateway;
console.log(`http://${host}:${port}/v1/bookmarklet?token=${token}`);
