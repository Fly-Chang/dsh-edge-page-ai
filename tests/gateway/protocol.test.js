import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOL_VERSION,
  validateChatRequest,
  validateTranslateRequest,
} from '../../src/shared/protocol.js';

test('validateTranslateRequest 接受合法请求', () => {
  const { ok, value } = validateTranslateRequest({
    protocol: PROTOCOL_VERSION,
    sourceLang: 'en',
    targetLang: 'zh-CN',
    items: [{ id: 'u0', text: 'Hello', contextBefore: 'Hi' }],
  });
  assert.equal(ok, true);
  assert.equal(value.items.length, 1);
});

test('validateTranslateRequest 拒绝协议不匹配', () => {
  const { ok, error } = validateTranslateRequest({ protocol: 2, targetLang: 'zh-CN', items: [] });
  assert.equal(ok, false);
  assert.equal(error.error.code, 'VALIDATION_FAILED');
});

test('validateTranslateRequest 拒绝重复 id', () => {
  const { ok, error } = validateTranslateRequest({
    protocol: 1,
    targetLang: 'zh-CN',
    items: [
      { id: 'a', text: 'one' },
      { id: 'a', text: 'two' },
    ],
  });
  assert.equal(ok, false);
  assert.match(error.error.message, /duplicate id/);
});

test('validateTranslateRequest 拒绝超长文本', () => {
  const { ok } = validateTranslateRequest({
    protocol: 1,
    targetLang: 'zh-CN',
    items: [{ id: 'a', text: 'x'.repeat(5001) }],
  });
  assert.equal(ok, false);
});

test('validateChatRequest 接受合法消息并拒绝非法角色', () => {
  const good = validateChatRequest({ protocol: 1, messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(good.ok, true);

  const bad = validateChatRequest({ protocol: 1, messages: [{ role: 'hacker', content: 'hi' }] });
  assert.equal(bad.ok, false);
});
