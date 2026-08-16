import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  restoreOriginals,
  snapshotOriginals,
  toBatches,
  TRANSLATE_BATCH_SIZE,
  TRANSLATE_CONCURRENCY,
} from '../../src/core/page-translator.js';

function makeParent() {
  const attrs = {};
  return {
    nodeType: 1,
    tagName: 'P',
    attrs,
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name);
    },
  };
}

test('snapshotOriginals 记录节点与父元素', () => {
  const parent = makeParent();
  const node = { nodeType: 3, nodeValue: 'Hello world', parentElement: parent };
  const units = [{ id: 'u0', node, parent, lead: '', text: 'Hello world', trail: '' }];

  const snapshot = snapshotOriginals(units);
  assert.equal(snapshot.get('u0').text, 'Hello world');
  assert.equal(snapshot.get('u0').parent, parent);
});

test('restoreOriginals 还原原文并清除 data-dsh-tr 标记', () => {
  const parent = makeParent();
  parent.setAttribute('data-dsh-tr', '1');
  const node = { nodeType: 3, nodeValue: '你好世界', parentElement: parent };
  const units = [{ id: 'u0', node, parent, lead: ' ', text: 'Hello world', trail: ' ' }];

  const snapshot = snapshotOriginals(units);
  const count = restoreOriginals(snapshot);

  assert.equal(count, 1);
  assert.equal(node.nodeValue, ' Hello world ');
  assert.equal(parent.hasAttribute('data-dsh-tr'), false);
});

test('还原后再次翻译的收集前置条件：已翻译标记被清除', () => {
  const parent = makeParent();
  parent.setAttribute('data-dsh-tr', '1');
  const node = { nodeType: 3, nodeValue: '【译】Hello', parentElement: parent };
  const units = [{ id: 'u0', node, parent, lead: '', text: 'Hello', trail: '' }];

  restoreOriginals(snapshotOriginals(units));

  // 标记被移除后，collectTextUnits 才不会跳过该节点。
  assert.equal(parent.hasAttribute('data-dsh-tr'), false);
  assert.equal(node.nodeValue, 'Hello');
});

test('A+C 优化参数：小批尺寸与并发度', () => {
  assert.equal(TRANSLATE_BATCH_SIZE, 30);
  assert.equal(TRANSLATE_CONCURRENCY, 3);

  const batches = toBatches(Array.from({ length: 70 }, (_, index) => index), TRANSLATE_BATCH_SIZE);
  assert.equal(batches.length, 3);
  assert.deepEqual(batches.map((batch) => batch.length), [30, 30, 10]);
});
