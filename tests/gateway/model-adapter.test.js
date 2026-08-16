import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModelAdapter } from '../../src/gateway/model-adapter.js';

const CONFIG = {
  model: {
    provider: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'test-key',
    model: 'deepseek-v4-flash',
    timeoutMs: 3000,
    jsonMode: false,
    disableThinkingForTranslate: true,
    extraBody: {
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
    },
  },
};

function makeFetchSpy(items) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetchImpl };
}

test('翻译请求关闭思考并透传低思考 effort', async () => {
  const { calls, fetchImpl } = makeFetchSpy([{ id: 'u0', text: '你好 [[0]]' }]);
  const adapter = createModelAdapter(CONFIG, { fetchImpl });

  const result = await adapter.translateItems({
    items: [{ id: 'u0', text: 'Hello [[0]]' }],
    targetLang: 'zh-CN',
    sourceLang: 'en',
  });

  assert.equal(result.items[0].text, '你好 [[0]]');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].body.model, 'deepseek-v4-flash');
  assert.equal(calls[0].body.reasoning_effort, 'low');
  assert.deepEqual(calls[0].body.thinking, { type: 'disabled' });
  assert.equal(calls[0].body.response_format, undefined);
});

test('jsonMode 开启时附加 response_format', async () => {
  const { calls, fetchImpl } = makeFetchSpy([{ id: 'u0', text: 'ok' }]);
  const adapter = createModelAdapter(
    { ...CONFIG, model: { ...CONFIG.model, jsonMode: true } },
    { fetchImpl },
  );

  await adapter.translateItems({
    items: [{ id: 'u0', text: 'Hello' }],
    targetLang: 'zh-CN',
    sourceLang: 'en',
  });

  assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
});


test('chat 请求保留低思考（thinking enabled）', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'chat-ok' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const adapter = createModelAdapter(CONFIG, { fetchImpl });

  const result = await adapter.chat({
    messages: [{ role: 'user', content: 'hi' }],
    context: { url: 'https://example.com', title: 'Example' },
  });

  assert.equal(result.text, 'chat-ok');
  assert.deepEqual(calls[0].body.thinking, { type: 'enabled' });
  assert.equal(calls[0].body.reasoning_effort, 'low');
});
