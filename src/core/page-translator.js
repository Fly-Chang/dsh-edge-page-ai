/**
 * 整页翻译编排：收集 → 占位符保护 → 分批请求 → 校验 → 还原 → 回填。
 * 浏览器页面内运行；不直接依赖网关实现，只依赖一个含 translate(payload) 的客户端。
 */
import { LIMITS } from '../shared/protocol.js';
import {
  applyTranslations,
  collectTextUnits,
  toTranslateItems,
} from './text-collector.js';
import { protect, restore } from './placeholder-protector.js';

function chunk(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/**
 * @param {object} options
 * @param {Element|Document} options.root
 * @param {{ translate(payload: object): Promise<object> }} options.gateway
 * @param {string} [options.targetLang='zh-CN']
 * @param {string} [options.sourceLang='en']
 * @param {(phase: string, done: number, total: number) => void} [options.onProgress]
 * @returns {Promise<{ units: object[], applied: number, failed: object[], batches: number }>}
 */
export async function translatePage(options) {
  const {
    root,
    gateway,
    targetLang = 'zh-CN',
    sourceLang = 'en',
    onProgress = () => {},
  } = options;

  const { units } = collectTextUnits(root, { includeContext: true });
  if (units.length === 0) {
    return { units, applied: 0, failed: [], batches: 0 };
  }

  // 逐单元做占位符保护，并建立 id → 原单元映射。
  const byId = new Map();
  const protectedByUnit = new Map();
  for (const unit of units) {
    byId.set(unit.id, unit);
    const { protectedText, placeholders } = protect(unit.text);
    protectedByUnit.set(unit.id, { protectedText, placeholders });
  }

  const batches = chunk(
    units.map((unit) => {
      const { protectedText } = protectedByUnit.get(unit.id);
      const item = { id: unit.id, text: protectedText };
      if (unit.contextBefore) {
        item.contextBefore = unit.contextBefore;
      }
      if (unit.contextAfter) {
        item.contextAfter = unit.contextAfter;
      }
      return item;
    }),
    LIMITS.MAX_ITEMS_PER_REQUEST,
  );

  const translationsById = {};
  const failed = [];
  let processed = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const response = await gateway.translate({
      protocol: 1,
      sourceLang,
      targetLang,
      items: batches[batchIndex],
    });

    if (!Array.isArray(response?.items)) {
      throw new Error('gateway.translate returned an invalid response');
    }

    for (const translatedItem of response.items) {
      const unit = byId.get(translatedItem?.id);
      if (!unit) {
        failed.push({ id: translatedItem?.id ?? '<unknown>', reason: 'unknown-id' });
        continue;
      }
      const { placeholders } = protectedByUnit.get(unit.id);
      const { restoredText, missing, unknown } = restore(translatedItem.text ?? '', placeholders);
      if (missing.length > 0 || unknown.length > 0) {
        failed.push({ id: unit.id, reason: 'placeholder-mismatch' });
        continue;
      }
      translationsById[unit.id] = restoredText;
    }

    processed += batches[batchIndex].length;
    onProgress('translate', processed, units.length);
  }

  // 模型漏掉的单元保留原文。
  for (const unit of units) {
    if (!(unit.id in translationsById)) {
      failed.push({ id: unit.id, reason: 'missing-from-model-response' });
    }
  }

  const result = applyTranslations(units, translationsById);
  return { units, applied: result.applied, failed: [...failed, ...result.failed], batches: batches.length };
}

/**
 * 记录原文快照，供“还原原文”使用。
 * @param {object[]} units
 * @returns {Map<string, { node: Text, lead: string, text: string, trail: string }>}
 */
export function snapshotOriginals(units) {
  const map = new Map();
  for (const unit of units) {
    map.set(unit.id, {
      node: unit.node,
      lead: unit.lead,
      text: unit.text,
      trail: unit.trail,
    });
  }
  return map;
}

/** 用快照还原原文；返回还原数量。 */
export function restoreOriginals(snapshotMap) {
  let count = 0;
  for (const entry of snapshotMap.values()) {
    entry.node.nodeValue = entry.lead + entry.text + entry.trail;
    count += 1;
  }
  return count;
}

/** 供页面 UI 使用的批处理小工具。 */
export function toBatches(items, size = LIMITS.MAX_ITEMS_PER_REQUEST) {
  return chunk(items, size);
}

export { toTranslateItems };
