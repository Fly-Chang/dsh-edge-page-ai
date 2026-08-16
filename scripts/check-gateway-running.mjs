/**
 * 检查本地网关是否已在 8787 端口运行。
 * 健康检查无需 token。退出码: 0 = 运行中, 1 = 未运行/不可用。
 */
import { createGatewayClient } from '../src/shared/gateway-client.js';

const client = createGatewayClient({ timeoutMs: 2000 });
try {
  const payload = await client.health();
  if (payload?.status === 'up') {
    process.exit(0);
  }
  process.exit(1);
} catch {
  process.exit(1);
}
