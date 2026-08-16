import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayClient, GatewayClientError } from '../../src/shared/gateway-client.js';

test('外部 AbortSignal 会中止 translate 请求并抛出 NETWORK_ERROR', async () => {
  let seenSignal = null;
  const fetchImpl = async (_url, options) => {
    seenSignal = options.signal;
    await new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  };

  const client = createGatewayClient({
    baseUrl: 'http://127.0.0.1:8787',
    token: 'test-token',
    fetchImpl,
    timeoutMs: 5000,
  });
  const controller = new AbortController();
  const request = client.translate({
    protocol: 1,
    sourceLang: 'en',
    targetLang: 'zh-CN',
    items: [{ id: 'u0', text: 'Hello' }],
  }, { signal: controller.signal });

  controller.abort();
  await assert.rejects(request, (error) => {
    assert.equal(error instanceof GatewayClientError, true);
    assert.equal(error.code, 'NETWORK_ERROR');
    return true;
  });
  assert.equal(seenSignal.aborted, true);
});
