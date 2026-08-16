/**
 * 协议客户端：浏览器侧（书签脚本、薄壳扩展测试）与测试共用。
 * 仅依赖全局 fetch，不依赖 Node 专有 API。
 */
import {
  GATEWAY_BASE_URL,
  PROTOCOL_VERSION,
  TOKEN_HEADER,
} from './protocol.js';

export class GatewayClientError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'GatewayClientError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {object} options
 * @param {string} [options.baseUrl]
 * @param {string} [options.token]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs=30000]
 */
export function createGatewayClient(options = {}) {
  const baseUrl = (options.baseUrl ?? GATEWAY_BASE_URL).replace(/\/+$/, '');
  const token = options.token ?? '';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 30000;

  if (typeof fetchImpl !== 'function') {
    throw new TypeError('createGatewayClient: fetch is not available');
  }

  async function request(endpoint, { method = 'GET', body, auth = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (auth && token) {
      headers[TOKEN_HEADER] = token;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${endpoint}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw new GatewayClientError('NETWORK_ERROR', error.message ?? 'network error');
    } finally {
      clearTimeout(timer);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new GatewayClientError('BAD_RESPONSE', 'gateway returned non-JSON response', response.status);
    }

    if (!response.ok || payload?.ok !== true) {
      const code = payload?.error?.code ?? 'HTTP_ERROR';
      const message = payload?.error?.message ?? `HTTP ${response.status}`;
      throw new GatewayClientError(code, message, response.status);
    }
    if (payload.protocol !== PROTOCOL_VERSION) {
      throw new GatewayClientError('PROTOCOL_MISMATCH', `expected protocol ${PROTOCOL_VERSION}, got ${payload.protocol}`, response.status);
    }
    return payload;
  }

  return {
    baseUrl,
    health: () => request('/v1/health', { auth: false }),
    handshake: () => request('/v1/handshake'),
    translate: (payload) => request('/v1/translate', { method: 'POST', body: payload }),
    chat: (payload) => request('/v1/chat', { method: 'POST', body: payload }),
  };
}
