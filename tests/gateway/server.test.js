import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayServer } from '../../src/gateway/app.js';

const CONFIG = {
  gateway: { host: '127.0.0.1', port: 0, token: 'test-token-0123456789abcdef' },
  model: {
    provider: 'mock',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'mock-model',
    timeoutMs: 3000,
    jsonMode: false,
  },
};

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

test('网关 v1 核心端点（mock 模型）', async (t) => {
  const server = createGatewayServer({ config: CONFIG });
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  // 健康检查免鉴权。
  const health = await fetch(`${base}/v1/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).protocol, 1);

  // 错误 token 返回 401。
  const denied = await fetch(`${base}/v1/handshake`, { headers: { 'X-DSH-Token': 'bad' } });
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).error.code, 'UNAUTHORIZED');

  // 握手。
  const handshake = await fetch(`${base}/v1/handshake`, {
    headers: { 'X-DSH-Token': CONFIG.gateway.token },
  });
  assert.equal(handshake.status, 200);
  const handshakeBody = await handshake.json();
  assert.equal(handshakeBody.name, 'edge-page-ai');
  assert.equal(handshakeBody.capabilities.translate, true);

  // 翻译。
  const translateResponse = await fetch(`${base}/v1/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DSH-Token': CONFIG.gateway.token },
    body: JSON.stringify({
      protocol: 1,
      sourceLang: 'en',
      targetLang: 'zh-CN',
      items: [
        { id: 'u0', text: 'Hello world' },
        { id: 'u1', text: 'See [[0]]', contextBefore: 'Hello world' },
      ],
    }),
  });
  assert.equal(translateResponse.status, 200);
  const translateBody = await translateResponse.json();
  assert.equal(translateBody.items.length, 2);
  assert.equal(translateBody.items[0].id, 'u0');
  assert.equal(translateBody.items[0].text, '【译】Hello world');
  assert.equal(translateBody.items[1].text, '【译】See [[0]]');

  // 非法请求 422。
  const invalid = await fetch(`${base}/v1/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DSH-Token': CONFIG.gateway.token },
    body: JSON.stringify({ protocol: 1, targetLang: 'zh-CN', items: [] }),
  });
  assert.equal(invalid.status, 422);

  // 对话。
  const chat = await fetch(`${base}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DSH-Token': CONFIG.gateway.token },
    body: JSON.stringify({
      protocol: 1,
      messages: [{ role: 'user', content: 'hello' }],
      context: { url: 'https://example.com', title: 'Example' },
    }),
  });
  assert.equal(chat.status, 200);
  assert.match((await chat.json()).text, /Example/);
});

test('书签分发与页面模块（CORS/静态资源）', async (t) => {
  const server = createGatewayServer({ config: CONFIG });
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const bootstrap = await fetch(`${base}/v1/bootstrap.js?token=${CONFIG.gateway.token}`);
  assert.equal(bootstrap.status, 200);
  assert.match(await bootstrap.text(), /client\.mjs\?token=/);
  assert.equal(bootstrap.headers.get('access-control-allow-origin'), '*');

  const badBootstrap = await fetch(`${base}/v1/bootstrap.js?token=nope`);
  assert.equal(badBootstrap.status, 401);

  const clientModule = await fetch(`${base}/v1/client.mjs`);
  assert.equal(clientModule.status, 200);
  assert.match(await clientModule.text(), /dsh-page-ai-panel/);

  const coreModule = await fetch(`${base}/core/page-translator.js`);
  assert.equal(coreModule.status, 200);
  assert.equal(coreModule.headers.get('access-control-allow-origin'), '*');

  const options = await fetch(`${base}/v1/translate`, { method: 'OPTIONS' });
  assert.equal(options.status, 204);
});
