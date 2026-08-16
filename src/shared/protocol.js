/**
 * gateway-protocol-v1 的共享常量与纯校验函数。
 * 规范: docs/specs/gateway-protocol-v1.md
 *
 * 该文件在 Node(网关/测试) 与浏览器(书签注入脚本) 两侧复用，
 * 因此禁止引入任何 Node 专有 API。
 */

export const PROTOCOL_VERSION = 1;
export const GATEWAY_HOST = '127.0.0.1';
export const GATEWAY_PORT = 8787;
export const GATEWAY_BASE_URL = `http://${GATEWAY_HOST}:${GATEWAY_PORT}`;

export const TOKEN_HEADER = 'x-dsh-token';
export const DEFAULT_TARGET_LANG = 'zh-CN';

export const LIMITS = Object.freeze({
  MAX_ITEMS_PER_REQUEST: 200,
  MAX_TEXT_LENGTH: 5000,
  MAX_ID_LENGTH: 64,
  MAX_BODY_BYTES: 2 * 1024 * 1024,
});

export const ERROR_CODES = Object.freeze({
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  MODEL_ERROR: 'MODEL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

export const CHAT_ROLES = Object.freeze(['system', 'user', 'assistant']);

/** 构造协议标准错误对象。 */
export function protocolError(code, message) {
  return {
    protocol: PROTOCOL_VERSION,
    ok: false,
    error: { code, message },
  };
}

/** 构造协议标准成功对象。 */
export function protocolOk(payload = {}) {
  return { protocol: PROTOCOL_VERSION, ok: true, ...payload };
}

/** 校验 /v1/translate 请求体，返回 { ok, value, error }。 */
export function validateTranslateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: protocolError(ERROR_CODES.VALIDATION_FAILED, 'body must be an object') };
  }
  if (body.protocol !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error: protocolError(
        ERROR_CODES.VALIDATION_FAILED,
        `protocol must be ${PROTOCOL_VERSION}`,
      ),
    };
  }
  const { targetLang, sourceLang, items } = body;
  if (typeof targetLang !== 'string' || targetLang.length === 0) {
    return { ok: false, error: protocolError(ERROR_CODES.VALIDATION_FAILED, 'targetLang is required') };
  }
  if (sourceLang !== undefined && (typeof sourceLang !== 'string' || sourceLang.length === 0)) {
    return { ok: false, error: protocolError(ERROR_CODES.VALIDATION_FAILED, 'sourceLang must be a string') };
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > LIMITS.MAX_ITEMS_PER_REQUEST) {
    return {
      ok: false,
      error: protocolError(
        ERROR_CODES.VALIDATION_FAILED,
        `items must contain 1-${LIMITS.MAX_ITEMS_PER_REQUEST} entries`,
      ),
    };
  }
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: protocolError(ERROR_CODES.VALIDATION_FAILED, `items[${index}] must be an object`) };
    }
    const { id, text } = item;
    if (typeof id !== 'string' || id.length < 1 || id.length > LIMITS.MAX_ID_LENGTH) {
      return {
        ok: false,
        error: protocolError(
          ERROR_CODES.VALIDATION_FAILED,
          `items[${index}].id must be a 1-${LIMITS.MAX_ID_LENGTH} character string`,
        ),
      };
    }
    if (ids.has(id)) {
      return { ok: false, error: protocolError(ERROR_CODES.VALIDATION_FAILED, `duplicate id: ${id}`) };
    }
    ids.add(id);
    if (typeof text !== 'string' || text.length < 1 || text.length > LIMITS.MAX_TEXT_LENGTH) {
      return {
        ok: false,
        error: protocolError(
          ERROR_CODES.VALIDATION_FAILED,
          `items[${index}].text must be a 1-${LIMITS.MAX_TEXT_LENGTH} character string`,
        ),
      };
    }
    for (const key of ['contextBefore', 'contextAfter']) {
      const value = item[key];
      if (value !== undefined && typeof value !== 'string') {
        return {
          ok: false,
          error: protocolError(ERROR_CODES.VALIDATION_FAILED, `items[${index}].${key} must be a string`),
        };
      }
    }
  }
  return { ok: true, value: { targetLang, sourceLang, items } };
}

/** 校验 /v1/chat 请求体。 */
export function validateChatRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: protocolError(ERROR_CODES.VALIDATION_FAILED, 'body must be an object') };
  }
  if (body.protocol !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error: protocolError(
        ERROR_CODES.VALIDATION_FAILED,
        `protocol must be ${PROTOCOL_VERSION}`,
      ),
    };
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 50) {
    return {
      ok: false,
      error: protocolError(ERROR_CODES.VALIDATION_FAILED, 'messages must contain 1-50 entries'),
    };
  }
  for (const [index, message] of body.messages.entries()) {
    if (!message || typeof message !== 'object' || !CHAT_ROLES.includes(message.role)) {
      return {
        ok: false,
        error: protocolError(
          ERROR_CODES.VALIDATION_FAILED,
          `messages[${index}].role must be one of ${CHAT_ROLES.join(', ')}`,
        ),
      };
    }
    if (typeof message.content !== 'string' || message.content.length === 0) {
      return {
        ok: false,
        error: protocolError(ERROR_CODES.VALIDATION_FAILED, `messages[${index}].content is required`),
      };
    }
  }
  return { ok: true, value: { messages: body.messages, context: body.context ?? {} } };
}
