import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/gateway/config.js';

function makeTempConfig() {
  const dir = mkdtempSync(join(tmpdir(), 'edge-page-ai-config-'));
  writeFileSync(join(dir, 'config.local.json'), JSON.stringify({
    gateway: { host: '127.0.0.1', port: 8787, token: 'local-token' },
    model: {
      provider: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-v4-flash',
      timeoutMs: 60000,
      jsonMode: false,
      extraBody: { thinking: { type: 'enabled' }, reasoning_effort: 'low' },
    },
  }));
  return dir;
}

function withEnv(values, fn) {
  const previous = new Map();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test('DSH_* 环境变量覆盖本地模型配置', (t) => {
  const dir = makeTempConfig();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const config = withEnv({
    DSH_MODEL_API_KEY: 'env-key-123',
    DSH_MODEL_NAME: 'deepseek-v4-pro',
    DSH_MODEL_EXTRA_BODY: '{"thinking":{"type":"disabled"}}',
  }, () => loadConfig({ cwd: dir }));

  assert.equal(config.model.apiKey, 'env-key-123');
  assert.equal(config.model.model, 'deepseek-v4-pro');
  assert.deepEqual(config.model.extraBody, { thinking: { type: 'disabled' } });
  // 未覆盖的字段仍来自 config.local.json。
  assert.equal(config.model.baseUrl, 'https://api.deepseek.com');
  assert.equal(config.model.reasoning_effort, undefined);
});

test('DSH_MODEL_EXTRA_BODY 非法 JSON 时报错', (t) => {
  const dir = makeTempConfig();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  assert.throws(
    () => withEnv({ DSH_MODEL_EXTRA_BODY: 'not-json' }, () => loadConfig({ cwd: dir })),
    /DSH_MODEL_EXTRA_BODY is not valid JSON/,
  );
});

test('无环境变量时密钥保持本地配置值', (t) => {
  const dir = makeTempConfig();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const config = withEnv({ DSH_MODEL_API_KEY: undefined }, () => loadConfig({ cwd: dir }));
  assert.equal(config.model.apiKey, '');
  assert.deepEqual(config.model.extraBody, { thinking: { type: 'enabled' }, reasoning_effort: 'low' });
});

test('兼容 UTF-8 BOM 的 config.local.json 且不覆盖原文件', (t) => {
  const dir = makeTempConfig();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const file = join(dir, 'config.local.json');
  writeFileSync(file, `\uFEFF${JSON.stringify({
    gateway: { host: '127.0.0.1', port: 8787, token: 'bom-token' },
    model: { provider: 'openai-compatible', apiKey: 'bom-key' },
  })}`, 'utf8');

  const config = loadConfig({ cwd: dir });
  assert.equal(config.gateway.token, 'bom-token');
  assert.equal(config.model.apiKey, 'bom-key');
  // 原文件仍保持 BOM 且 token 未被重新生成。
  assert.match(readFileSync(file, 'utf8'), /bom-token/);
});

test('config.local.json 非法 JSON 时拒绝覆盖并报错', (t) => {
  const dir = makeTempConfig();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  writeFileSync(join(dir, 'config.local.json'), '{not-json', 'utf8');
  assert.throws(() => loadConfig({ cwd: dir }), /refusing to overwrite/);
});
