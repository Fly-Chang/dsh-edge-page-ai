import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTranslations,
  decomposeText,
  makeUnitId,
  shouldSkipText,
} from '../../src/core/text-collector.js';

function element(tagName, attrs = {}, parent = null) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    parentNode: parent,
    parentElement: parent,
    attrs,
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name);
    },
  };
  return node;
}

function textNode(parent, value) {
  return { nodeType: 3, nodeValue: value, parentNode: parent, parentElement: parent };
}

test('decomposeText 保留首尾空白并识别空文本', () => {
  assert.deepEqual(decomposeText('  hello  '), { lead: '  ', core: 'hello', trail: '  ', isEmpty: false });
  assert.equal(decomposeText('   ').isEmpty, true);
  assert.deepEqual(decomposeText('x'), { lead: '', core: 'x', trail: '', isEmpty: false });
});

test('shouldSkipText 跳过 code/pre/script 及其后代', () => {
  const body = element('body');
  const paragraph = element('p', {}, body);
  const code = element('code', {}, paragraph);
  assert.equal(shouldSkipText(textNode(code, 'print(1)')), true);
  assert.equal(shouldSkipText(textNode(paragraph, 'normal text')), false);
});

test('shouldSkipText 跳过已翻译与 DSH UI 标记', () => {
  const body = element('body');
  const done = element('p', { 'data-dsh-tr': '1' }, body);
  const ui = element('div', { 'data-dsh-ui': '1' }, body);
  assert.equal(shouldSkipText(textNode(done, 'translated')), true);
  assert.equal(shouldSkipText(textNode(ui, 'panel label')), true);
});

test('makeUnitId 生成稳定且满足协议长度的 id', () => {
  assert.equal(makeUnitId(0), 'u0');
  assert.equal(makeUnitId(42, 'block-'), 'block-42');
  assert.throws(() => makeUnitId(-1), RangeError);
});

test('applyTranslations 只写 nodeValue 并保留首尾空白', () => {
  const body = element('body');
  const paragraph = element('p', {}, body);
  const units = [
    { id: 'u0', node: textNode(paragraph, 'Hello '), parent: paragraph, lead: '', text: 'Hello', trail: ' ' },
    { id: 'u1', node: textNode(paragraph, 'world'), parent: paragraph, lead: '', text: 'world', trail: '' },
  ];
  const { applied, failed } = applyTranslations(units, { u0: '你好', u1: '世界' });

  assert.equal(applied, 2);
  assert.equal(failed.length, 0);
  assert.equal(units[0].node.nodeValue, '你好 ');
  assert.equal(units[1].node.nodeValue, '世界');
  assert.equal(paragraph.attrs['data-dsh-tr'], '1');
});

test('applyTranslations 缺失译文时保留原文且父元素不标记', () => {
  const body = element('body');
  const paragraph = element('p', {}, body);
  const units = [
    { id: 'u0', node: textNode(paragraph, 'Hello'), parent: paragraph, lead: '', text: 'Hello', trail: '' },
  ];
  const { applied, failed } = applyTranslations(units, {});

  assert.equal(applied, 0);
  assert.equal(failed[0].reason, 'missing-or-empty-translation');
  assert.equal(units[0].node.nodeValue, 'Hello');
  assert.equal(paragraph.attrs['data-dsh-tr'], undefined);
});
