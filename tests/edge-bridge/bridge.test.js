import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

test('bridge-client.bundle.mjs 是自包含模块且包含桥接配置入口', () => {
  const bundle = readFileSync(resolve(root, 'src/edge-bridge/bridge-client.bundle.mjs'), 'utf8');

  assert.equal(/^import\s/m.test(bundle), false, 'bundle should not contain static imports');
  assert.match(bundle, /__DSH_BRIDGE_CONFIG__/);
  assert.match(bundle, /__DSH_BRIDGE_PANEL__/);
  assert.match(bundle, /dsh-page-ai-panel/);
  assert.match(bundle, /createGatewayClient/);
});

test('content.js 使用隔离世界动态导入，不注入页面 script', () => {
  const content = readFileSync(resolve(root, 'src/edge-bridge/content.js'), 'utf8');

  assert.match(content, /import\(chrome\.runtime\.getURL\('bridge-client\.bundle\.mjs'\)\)/);
  assert.match(content, /__DSH_BRIDGE_CONFIG__/);
  assert.match(content, /__DSH_BRIDGE_CONTENT_LOADED__/);
  assert.doesNotMatch(content, /createElement\('script'\)/);
  // Manual activation: must not auto-run ensurePanel on page load.
  assert.doesNotMatch(content, /^\s*void ensurePanel\(\);\s*$/m);
});

test('manifest 声明 bundle 为 web accessible resource', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'src/edge-bridge/manifest.json'), 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.permissions.includes('scripting'), true);
  assert.equal(manifest.permissions.includes('nativeMessaging'), true);
  assert.equal(manifest.permissions.includes('alarms'), true);
  assert.equal(manifest.web_accessible_resources[0].resources.includes('bridge-client.bundle.mjs'), true);
});
