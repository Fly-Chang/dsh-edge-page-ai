/**
 * 占位符保护：翻译前把链接、邮箱、数字、单位、代码片段等从文本中摘出，
 * 用 [[n]] 占位符替换；模型返回后用原文还原。
 *
 * 设计目标：
 * 1. 模型不改写链接/数字等高风险内容；
 * 2. 回填时校验占位符完整性，缺失时整项回退原文。
 *
 * 本模块为纯函数，不依赖 DOM 与 Node 专有 API。
 */

const PLACEHOLDER_PATTERN = /\[\[\s*(\d+)\s*\]\]/g;

/**
 * 模式按“长串优先”排列，避免 URL 中的数字等被先摘走。
 * 所有模式在单次 replace 中合并执行：JS replace 不会重扫替换产物，
 * 因此已生成的 [[n]] 占位符不会被数字模式再次处理。
 */
const PROTECT_PATTERNS = [
  /https?:\/\/[^\s"'<>()]+/gi,
  /www\.[^\s"'<>()]+/gi,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi,
  /`[^`\n]+`/g,
  /#[\w-]+/g,
  /\b\d+(?:[.,]\d+)*(?:\s?(?:%|kg|km|m|cm|mm|GB|MB|KB|ms|s|USD|EUR|CNY|RMB|\$|€|¥))?\b/gi,
];

const COMBINED_PATTERN = new RegExp(
  PROTECT_PATTERNS.map((pattern) => pattern.source).join('|'),
  'gi',
);

const MAX_PLACEHOLDERS = 200;

/**
 * 把文本中的高风险片段替换为 [[n]]。
 * @param {string} text
 * @returns {{ protectedText: string, placeholders: string[] }}
 */
export function protect(text) {
  if (typeof text !== 'string') {
    throw new TypeError('protect(text): text must be a string');
  }
  if (text.length === 0) {
    return { protectedText: text, placeholders: [] };
  }

  const placeholders = [];
  const protectedText = text.replace(COMBINED_PATTERN, (match) => {
    if (placeholders.length >= MAX_PLACEHOLDERS) {
      return match;
    }
    const index = placeholders.indexOf(match);
    if (index !== -1) {
      return `[[${index}]]`;
    }
    placeholders.push(match);
    return `[[${placeholders.length - 1}]]`;
  });

  return { protectedText, placeholders };
}

/** 解析占位符文本中出现的索引（升序、去重）。 */
export function collectPlaceholderIndexes(text) {
  const indexes = new Set();
  for (const match of String(text).matchAll(PLACEHOLDER_PATTERN)) {
    indexes.add(Number(match[1]));
  }
  return [...indexes].sort((a, b) => a - b);
}

/**
 * 把译文中的占位符还原为原文。
 * @param {string} protectedText
 * @param {string[]} placeholders
 * @returns {{ restoredText: string, missing: number[], unknown: number[] }}
 */
export function restore(protectedText, placeholders) {
  if (typeof protectedText !== 'string' || !Array.isArray(placeholders)) {
    throw new TypeError('restore(protectedText, placeholders): invalid arguments');
  }

  const present = new Set(collectPlaceholderIndexes(protectedText));
  const missing = [];
  const unknown = [];

  for (let index = 0; index < placeholders.length; index += 1) {
    if (!present.has(index)) {
      missing.push(index);
    }
  }
  for (const index of present) {
    if (index < 0 || index >= placeholders.length) {
      unknown.push(index);
    }
  }

  const restoredText = protectedText.replace(PLACEHOLDER_PATTERN, (_match, rawIndex) => {
    const index = Number(rawIndex);
    return placeholders[index] ?? `[[${index}]]`;
  });

  return { restoredText, missing, unknown };
}

/**
 * 判断译文是否可安全回填：所有原文占位符都保留，且没有未知占位符。
 */
export function isSafeToRestore(protectedText, placeholders) {
  const { missing, unknown } = restore(protectedText, placeholders);
  return missing.length === 0 && unknown.length === 0;
}
