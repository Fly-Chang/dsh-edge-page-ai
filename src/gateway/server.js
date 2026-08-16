/**
 * 网关启动入口：npm start
 */
import { loadConfig } from './config.js';
import { createGatewayServer } from './app.js';

const config = loadConfig();
const server = createGatewayServer({ config });

server.listen(config.gateway.port, config.gateway.host, () => {
  const { host, port, token } = config.gateway;
  const base = `http://${host}:${port}`;
  console.log(`[edge-page-ai] gateway v1 listening on ${base}`);
  console.log(`[edge-page-ai] provider: ${config.model.provider}`);
  if (config.model.provider !== 'mock' && !config.model.apiKey) {
    console.warn('[edge-page-ai] WARNING: model.apiKey is empty; set it in config.local.json');
  }
  console.log(`[edge-page-ai] bookmarklet page: ${base}/v1/bookmarklet?token=${token}`);
  console.log('[edge-page-ai] press Ctrl+C to stop');
});

server.on('error', (error) => {
  console.error(`[edge-page-ai] failed to start: ${error.message}`);
  process.exitCode = 1;
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
