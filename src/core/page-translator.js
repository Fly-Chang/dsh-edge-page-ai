/**
 * 整页翻译编排：收集 → 占位符保护 → 分批请求 → 校验 → 还原 → 回填。
 * 浏览器页面内运行；不直接依赖网关实现，只依赖一个含 translate(payload) 的客户端。
 */
import { LIMITS } from '../shared/protocol.js';
import {
  applyTranslations,
  collectTextUnits,
  MARK_TRANSLATED_ATTR,
  markTranslatedParents,
} from './text-collector.js';
import { protect, restore } from './placeholder-protector.js';

function chunk(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

export const TRANSLATE_BATCH_SIZE = 30;
export const TRANSLATE_CONCURRENCY = 3;

async function runPool(items, worker, concurrency) {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

/**
 * @param {object} options
 * @param {Element|Document} options.root
 * @param {{ translate(payload: object): Promise<object> }} options.gateway
 * @param {string} [options.targetLang='zh-CN']
 * @param {string} [options.sourceLang='en']
 * @param {(phase: string, done: number, total: number) => void} [options.onProgress]
 * @param {number} [options.batchSize=TRANSLATE_BATCH_SIZE]
 * @param {number} [options.concurrency=TRANSLATE_CONCURRENCY]
 * @returns {Promise<{ units: object[], applied: number, failed: object[], batches: number }>}
 */
export async function translatePage(options) {
  const {
    root,
    gateway,
    targetLang = 'zh-CN',
    sourceLang = 'en',
    onProgress = () => {},
    batchSize = TRANSLATE_BATCH_SIZE,
    concurrency = TRANSLATE_CONCURRENCY,
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

  const items = units.map((unit) => {
    const { protectedText } = protectedByUnit.get(unit.id);
    const item = { id: unit.id, text: protectedText };
    if (unit.contextBefore) {
      item.contextBefore = unit.contextBefore;
    }
    if (unit.contextAfter) {
      item.contextAfter = unit.contextAfter;
    }
    return item;
  });
  const batches = chunk(items, batchSize);

  const translationsById = {};
  const failed = [];
  const failedIds = new Set();
  let processed = 0;
  let applied = 0;

  const recordFailure = (id, reason, message) => {
    if (!failedIds.has(id)) {
      failedIds.add(id);
      failed.push(message ? { id, reason, message } : { id, reason });
    }
  };

  await runPool(batches, async (batch) => {
    const batchUnits = batch.map((item) => byId.get(item.id)).filter(Boolean);
    const batchTranslations = {};

    try {
      const response = await gateway.translate({
        protocol: 1,
        sourceLang,
        targetLang,
        items: batch,
      });

      if (!Array.isArray(response?.items)) {
        throw new Error('gateway.translate returned an invalid response');
      }

      for (const translatedItem of response.items) {
        const unit = byId.get(translatedItem?.id);
        if (!unit) {
          recordFailure(translatedItem?.id ?? '<unknown>', 'unknown-id');
          continue;
        }
        const { placeholders } = protectedByUnit.get(unit.id);
        const { restoredText, missing, unknown } = restore(translatedItem.text ?? '', placeholders);
        if (missing.length > 0 || unknown.length > 0) {
          recordFailure(unit.id, 'placeholder-mismatch');
          continue;
        }
        translationsById[unit.id] = restoredText;
        batchTranslations[unit.id] = restoredText;
      }

      // A: 每批完成立即回填，页面渐进变中文；先不做 data-dsh-tr 标记，
      // 等全部批次完成后统一标记，避免跨批父元素被提前误标。
      const result = applyTranslations(batchUnits, batchTranslations, { mark: false });
      applied += result.applied;
      for (const failure of result.failed) {
        recordFailure(failure.id, failure.reason);
      }
    } catch (error) {
      // 单批失败不中断整页：记录失败，保留原文，继续其他批次。
      for (const unit of batchUnits) {
        recordFailure(unit.id, 'gateway-error', error?.message ?? String(error));
      }
    } finally {
      processed += batch.length;
      onProgress('translate', processed, units.length);
    }
  }, concurrency);

  // 模型漏掉的单元保留原文。
  for (const unit of units) {
    if (!(unit.id in translationsById)) {
      recordFailure(unit.id, 'missing-from-model-response');
    }
  }

  // 全部完成后统一标记已翻译父元素，保证下次收集的幂等性。
  markTranslatedParents(units, translationsById);

  return { units, applied, failed, batches: batches.length };
}

/**
 * 记录原文快照，供“还原原文”使用。
 * 除文本外同时记录父元素，还原时清除 data-dsh-tr 标记，
 * 保证还原后可以再次执行整页翻译（BUG-009）。
 * @param {object[]} units
 * @returns {Map<string, { node: Text, parent: Element, lead: string, text: string, trail: string }>}
 */
export function snapshotOriginals(units) {
  const map = new Map();
  for (const unit of units) {
    map.set(unit.id, {
      node: unit.node,
      parent: unit.parent ?? unit.node?.parentElement ?? null,
      lead: unit.lead,
      text: unit.text,
      trail: unit.trail,
    });
  }
  return map;
}

/** 用快照还原原文；同时移除相关父元素的已翻译标记。返回还原数量。 */
export function restoreOriginals(snapshotMap) {
  const parents = new Set();
  for (const entry of snapshotMap.values()) {
    entry.node.nodeValue = entry.lead + entry.text + entry.trail;
    if (entry.parent?.removeAttribute) {
      parents.add(entry.parent);
    }
  }
  for (const parent of parents) {
    parent.removeAttribute(MARK_TRANSLATED_ATTR);
  }
  return snapshotMap.size;
}

/** 供页面 UI 使用的批处理小工具。 */
export function toBatches(items, size = LIMITS.MAX_ITEMS_PER_REQUEST) {
  return chunk(items, size);
}
