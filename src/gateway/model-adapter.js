/**
 * 模型适配器。当前支持：
 * - mock：本地演示/测试，不调用任何外部服务；
 * - openai-compatible：任何 OpenAI 兼容的 /chat/completions 端点（BYOK）。
 */
import { ERROR_CODES } from '../shared/protocol.js';

export class ModelAdapterError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = 'ModelAdapterError';
    this.code = code;
    this.cause = cause;
  }
}

const SYSTEM_PROMPT = [
  'You are a professional translation engine.',
  'Translate the "text" field of every item from the source language to the target language.',
  'Keep tokens like [[0]], [[1]] exactly as they are; never translate or reorder them.',
  'Use contextBefore/contextAfter only to understand the text; do not translate them.',
  'Return ONLY a JSON object of the form {"items":[{"id":"...","text":"..."}]}.',
  'Keep every id unchanged, keep the same count and order, and do not add explanations.',
].join(' ');

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl ?? '').replace(/\/+$/, '');
  if (!trimmed) {
    throw new ModelAdapterError(ERROR_CODES.MODEL_UNAVAILABLE, 'model.baseUrl is not configured');
  }
  return trimmed;
}

function stripFences(raw) {
  let text = String(raw).trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  return text;
}

function parseItemsJson(raw) {
  let payload;
  try {
    payload = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
  if (!payload || !Array.isArray(payload.items)) {
    return null;
  }
  return payload.items;
}

function validateTranslatedItems(requestItems, translatedItems) {
  if (translatedItems.length !== requestItems.length) {
    return 'translated item count does not match request';
  }
  const byId = new Map(translatedItems.map((item) => [item?.id, item]));
  for (const requested of requestItems) {
    const translated = byId.get(requested.id);
    if (!translated) {
      return `missing translated id: ${requested.id}`;
    }
    if (typeof translated.text !== 'string' || translated.text.length === 0) {
      return `empty translated text for id: ${requested.id}`;
    }
  }
  return null;
}

function mockTranslateText(text) {
  // 演示模式：包裹标记，保留占位符与数字，便于端到端验证。
  return `【译】${text}`;
}

/**
 * @param {object} config 由 loadConfig 返回的完整配置
 */
export function createModelAdapter(config) {
  const modelConfig = config.model ?? {};

  async function callOpenAi(messages) {
    const baseUrl = normalizeBaseUrl(modelConfig.baseUrl);
    const apiKey = String(modelConfig.apiKey ?? '');
    if (!apiKey) {
      throw new ModelAdapterError(ERROR_CODES.MODEL_UNAVAILABLE, 'model.apiKey is not configured');
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    const body = {
      model: modelConfig.model,
      temperature: 0.1,
      messages,
    };
    if (modelConfig.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timeoutMs = Number.isFinite(modelConfig.timeoutMs) ? modelConfig.timeoutMs : 30000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw new ModelAdapterError(ERROR_CODES.MODEL_UNAVAILABLE, `model endpoint unreachable: ${error.message}`, error);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ModelAdapterError(ERROR_CODES.MODEL_ERROR, `model endpoint returned HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ModelAdapterError(ERROR_CODES.MODEL_ERROR, 'model endpoint returned non-JSON response', error);
    }
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new ModelAdapterError(ERROR_CODES.MODEL_ERROR, 'model response has no text content');
    }
    return content;
  }

  async function translateItems({ items, targetLang, sourceLang }) {
    if (modelConfig.provider === 'mock') {
      return {
        items: items.map((item) => ({ id: item.id, text: mockTranslateText(item.text) })),
      };
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({ sourceLang, targetLang, items }),
      },
    ];

    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let raw;
      try {
        raw = await callOpenAi(messages);
      } catch (error) {
        throw error;
      }
      const translatedItems = parseItemsJson(raw);
      const validationError = translatedItems ? validateTranslatedItems(items, translatedItems) : 'response is not valid JSON';
      if (!validationError) {
        return { items: translatedItems };
      }
      lastError = new ModelAdapterError(
        ERROR_CODES.MODEL_ERROR,
        `attempt ${attempt + 1}: ${validationError}`,
      );
      if (attempt === 0) {
        messages.push({ role: 'assistant', content: raw });
        messages.push({
          role: 'user',
          content: `The previous output is invalid (${validationError}). Return ONLY the corrected JSON object, same ids, same count and order.`,
        });
      }
    }
    throw lastError ?? new ModelAdapterError(ERROR_CODES.MODEL_ERROR, 'translation failed');
  }

  async function chat({ messages, context }) {
    if (modelConfig.provider === 'mock') {
      return {
        text: `【演示模式】已收到 ${messages.length} 条消息。页面：${context?.title ?? '未知'}（${context?.url ?? '未知'}）。配置真实模型后我会在这里回复。`,
      };
    }

    const systemMessages = [
      { role: 'system', content: '你是随呼助手。请用目标用户的语言简洁回答。' },
    ];
    if (context?.url || context?.title) {
      systemMessages.push({
        role: 'system',
        content: `用户当前页面：标题=${context.title ?? ''}，URL=${context.url ?? ''}`,
      });
    }
    const raw = await callOpenAi([...systemMessages, ...messages]);
    return { text: raw };
  }

  return { translateItems, chat };
}
