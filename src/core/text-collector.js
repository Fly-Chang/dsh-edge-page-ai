/**
 * 文本节点收集与译文回填。
 *
 * 关键不变式：
 * 1. 只收集文本节点，不收集元素节点；
 * 2. 回填只写 node.nodeValue，不增删元素、不改 innerHTML；
 * 3. 保留每个文本节点首尾空白，只翻译中间文本；
 * 4. 跳过脚本、样式、代码、输入框与 DSH 自己的 UI。
 */

export const DEFAULT_SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'IFRAME',
  'SVG',
  'MATH',
  'OBJECT',
  'AUDIO',
  'VIDEO',
  'CANVAS',
]);

export const MARK_TRANSLATED_ATTR = 'data-dsh-tr';
export const MARK_UI_ATTR = 'data-dsh-ui';
export const MARK_NO_TRANSLATE_ATTR = 'data-dsh-no-translate';

const MAX_CONTEXT_LENGTH = 120;

/**
 * 拆分文本节点的首尾空白。
 * @param {string} raw
 * @returns {{ lead: string, core: string, trail: string, isEmpty: boolean }}
 */
export function decomposeText(raw) {
  const value = String(raw);
  const lead = /^\s*/.exec(value)[0];
  const trail = /\s*$/.exec(value)[0];
  const core = value.slice(lead.length, value.length - trail.length);
  return { lead, core, trail, isEmpty: core.length === 0 };
}

/**
 * 判断文本节点是否应跳过。可传入 node 为 null 用于纯逻辑场景。
 * @param {Node|null} node 文本节点
 * @param {object} [options]
 * @returns {boolean}
 */
export function shouldSkipText(node, options = {}) {
  const skipTags = options.skipTags ?? DEFAULT_SKIP_TAGS;
  if (!node) {
    return true;
  }

  let current = node;
  while (current) {
    if (current.nodeType === 1) {
      const tagName = String(current.tagName ?? '').toUpperCase();
      if (skipTags.has(tagName)) {
        return true;
      }
      if (current.hasAttribute?.(MARK_NO_TRANSLATE_ATTR)) {
        return true;
      }
      if (current.hasAttribute?.(MARK_TRANSLATED_ATTR)) {
        return true;
      }
      if (current.hasAttribute?.(MARK_UI_ATTR)) {
        return true;
      }
    }
    current = current.parentNode ?? current.parentElement ?? null;
  }
  return false;
}

/**
 * 生成本页内稳定的文本单元 id。
 * 前缀 + 序号，满足协议 1-64 字符要求。
 */
export function makeUnitId(sequence, prefix = 'u') {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new RangeError('makeUnitId(sequence): sequence must be a non-negative integer');
  }
  return `${prefix}${sequence}`;
}

/**
 * 从 root 收集可翻译文本单元。
 * @param {Element|Document} root
 * @param {object} [options]
 * @param {string} [options.unitPrefix='u']
 * @param {number} [options.maxUnits=5000] 安全上限
 * @param {boolean} [options.includeContext=true]
 * @returns {{ units: object[], skippedCount: number }}
 */
export function collectTextUnits(root, options = {}) {
  if (!root || typeof root.ownerDocument?.createTreeWalker !== 'function') {
    throw new TypeError('collectTextUnits(root): root must be a DOM element/document');
  }

  const prefix = options.unitPrefix ?? 'u';
  const maxUnits = options.maxUnits ?? 5000;
  const includeContext = options.includeContext ?? true;
  const acceptedNodes = [];

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipText(node, options)) {
        return NodeFilter.FILTER_REJECT;
      }
      const { core, isEmpty } = decomposeText(node.nodeValue);
      if (isEmpty) {
        return NodeFilter.FILTER_REJECT;
      }
      if (core.length > 5000) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    if (acceptedNodes.length >= maxUnits) {
      break;
    }
    acceptedNodes.push(walker.currentNode);
  }

  const units = acceptedNodes.map((node, index) => {
    const { lead, core, trail } = decomposeText(node.nodeValue);
    const contextBefore =
      includeContext && index > 0
        ? decomposeText(acceptedNodes[index - 1].nodeValue).core.slice(-MAX_CONTEXT_LENGTH)
        : '';
    const contextAfter =
      includeContext && index < acceptedNodes.length - 1
        ? decomposeText(acceptedNodes[index + 1].nodeValue).core.slice(0, MAX_CONTEXT_LENGTH)
        : '';
    return {
      id: makeUnitId(index, prefix),
      node,
      parent: node.parentElement,
      text: core,
      lead,
      trail,
      contextBefore,
      contextAfter,
    };
  });

  return { units, skippedCount: 0 };
}

/**
 * 把文本单元转换为协议 items。
 */
export function toTranslateItems(units, { includeContext = true } = {}) {
  return units.map((unit) => {
    const item = { id: unit.id, text: unit.text };
    if (includeContext && unit.contextBefore) {
      item.contextBefore = unit.contextBefore;
    }
    if (includeContext && unit.contextAfter) {
      item.contextAfter = unit.contextAfter;
    }
    return item;
  });
}

/**
 * 将译文写回文本节点。translationsById 的值必须是已经还原占位符的最终文本。
 * @returns {{ applied: number, failed: { id: string, reason: string }[] }}
 */
export function applyTranslations(units, translationsById) {
  const failed = [];
  let applied = 0;

  for (const unit of units) {
    const translated = translationsById[unit.id];
    if (typeof translated !== 'string' || translated.length === 0) {
      failed.push({ id: unit.id, reason: 'missing-or-empty-translation' });
      continue;
    }
    unit.node.nodeValue = unit.lead + translated + unit.trail;
    applied += 1;
  }

  if (applied > 0) {
    markTranslatedParents(units, translationsById);
  }
  return { applied, failed };
}

/**
 * 仅当某父元素下的全部单元都成功回填时，才标记 data-dsh-tr，
 * 避免下一次收集跳过未翻译的兄弟节点。
 */
export function markTranslatedParents(units, translationsById) {
  const byParent = new Map();
  for (const unit of units) {
    if (!unit.parent?.setAttribute) {
      continue;
    }
    if (!byParent.has(unit.parent)) {
      byParent.set(unit.parent, []);
    }
    byParent.get(unit.parent).push(unit);
  }
  for (const [parent, siblings] of byParent) {
    const allDone = siblings.every((unit) => typeof translationsById[unit.id] === 'string');
    if (allDone && parent.tagName !== 'BODY' && parent.tagName !== 'HTML') {
      parent.setAttribute(MARK_TRANSLATED_ATTR, '1');
    }
  }
}
