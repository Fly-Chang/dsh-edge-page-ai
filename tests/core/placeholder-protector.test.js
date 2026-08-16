import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSafeToRestore,
  protect,
  restore,
} from '../../src/core/placeholder-protector.js';

test('protect 提取 URL、邮箱、数字并生成可还原占位符', () => {
  const text = 'Open https://example.com/a?b=1 and mail me@example.com. Price is 42.5 USD.';
  const { protectedText, placeholders } = protect(text);

  assert.equal(protectedText.includes('https://example.com'), false);
  assert.equal(protectedText.includes('me@example.com'), false);
  assert.equal(protectedText.includes('42.5 USD'), false);
  assert.match(protectedText, /\[\[0\]\]/);
  assert.equal(placeholders.includes('https://example.com/a?b=1'), true);
  assert.equal(placeholders.includes('me@example.com'), true);
  assert.equal(placeholders.includes('42.5 USD'), true);
});

test('restore 完整还原占位符', () => {
  const { protectedText, placeholders } = protect('Visit https://a.example and pay $9.99 now.');
  const translated = protectedText.replace('Visit', '访问');
  const { restoredText, missing, unknown } = restore(translated, placeholders);

  assert.equal(missing.length, 0);
  assert.equal(unknown.length, 0);
  assert.match(restoredText, /https:\/\/a\.example/);
  assert.match(restoredText, /\$9\.99/);
});

test('restore 检测模型丢弃占位符', () => {
  const { protectedText, placeholders } = protect('Go to https://a.example');
  const { missing, unknown } = restore('去网站', placeholders);

  assert.deepEqual(missing, [0]);
  assert.equal(unknown.length, 0);
  assert.equal(isSafeToRestore('去网站', placeholders), false);
});

test('restore 检测模型编造未知占位符', () => {
  const { placeholders } = protect('Hello https://a.example');
  const { unknown } = restore('你好 [[99]]', placeholders);

  assert.deepEqual(unknown, [99]);
});

test('重复片段复用同一占位符', () => {
  const { protectedText, placeholders } = protect('See https://a.example and https://a.example again.');
  const matches = [...protectedText.matchAll(/\[\[(\d+)\]\]/g)].map((m) => m[1]);

  assert.deepEqual(matches, ['0', '0']);
  assert.equal(placeholders.length, 1);
});
