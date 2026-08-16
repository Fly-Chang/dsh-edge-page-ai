/**
 * 本地网关 HTTP 应用。只暴露 127.0.0.1。
 * 协议: docs/specs/gateway-protocol-v1.md
 */
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ERROR_CODES,
  LIMITS,
  PROTOCOL_VERSION,
  TOKEN_HEADER,
  protocolError,
  protocolOk,
  validateChatRequest,
  validateTranslateRequest,
} from '../shared/protocol.js';
import { createModelAdapter, ModelAdapterError } from './model-adapter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(HERE, '..');
const PACKAGE_JSON = JSON.parse(readFileSync(resolve(SRC_ROOT, '..', 'package.json'), 'utf8'));

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': `Content-Type, ${TOKEN_HEADER}`,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '600',
};

const RATE_LIMIT_RULES = new Map([
  ['/v1/translate', { limit: 60, windowMs: 60_000 }],
  ['/v1/chat', { limit: 60, windowMs: 60_000 }],
]);

const STATUS_BY_CODE = new Map([
  [ERROR_CODES.UNAUTHORIZED, 401],
  [ERROR_CODES.VALIDATION_FAILED, 422],
  [ERROR_CODES.MODEL_UNAVAILABLE, 502],
  [ERROR_CODES.MODEL_ERROR, 502],
  [ERROR_CODES.RATE_LIMITED, 429],
  [ERROR_CODES.NOT_FOUND, 404],
  [ERROR_CODES.INTERNAL_ERROR, 500],
]);

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...CORS_HEADERS,
  });
  response.end(body);
}

function sendText(response, status, body, contentType, { cache = false } = {}) {
  response.writeHead(status, {
    'Content-Type': `${contentType}; charset=utf-8`,
    'Cache-Control': cache ? 'public, max-age=300' : 'no-store',
    ...CORS_HEADERS,
  });
  response.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > LIMITS.MAX_BODY_BYTES) {
        reject(Object.assign(new Error('request body too large'), { code: ERROR_CODES.VALIDATION_FAILED }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('request body is not valid JSON'), { code: ERROR_CODES.VALIDATION_FAILED }));
      }
    });
    req.on('error', reject);
  });
}

function isRateLimited(rules, hits) {
  const now = Date.now();
  const recent = hits.filter((time) => now - time < rules.windowMs);
  return { recent, limited: recent.length >= rules.limit };
}

function bookmarkletPage(config) {
  const { host, port, token } = config.gateway;
  const base = `http://${host}:${port}`;
  const code =
    `(()=>{if(window.__DSH_BOOTSTRAPPED__)return;` +
    `window.__DSH_BOOTSTRAPPED__=true;` +
    `const s=document.createElement('script');` +
    `s.src='${base}/v1/bootstrap.js?token=${token}';` +
    `document.documentElement.appendChild(s);})();`;
  const href = `javascript:${encodeURIComponent(code)}`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>edge-page-ai 书签模式</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.7;color:#1b1f24}
h1{font-size:1.4em}code{background:#f2f4f7;padding:2px 6px;border-radius:4px;word-break:break-all}
.steps{margin:16px 0}.note{color:#667085}
</style>
</head>
<body>
<h1>edge-page-ai 书签模式</h1>
<p>把下面的链接拖到 Edge 书签栏；打开任意英文页面后点击该书签，即可调出翻译面板。</p>
<p><a href="${href}">DSH 整页翻译</a></p>
<ol class="steps">
<li>如果书签栏未显示：<code>Ctrl+Shift+B</code> 开启。</li>
<li>拖不动时可手动新建收藏夹，把地址设为下面这行：</li>
</ol>
<textarea rows="3" style="width:100%" readonly>${code}</textarea>
<p class="note">链接中的 token 仅本机有效，请勿分享。网关地址：<code>${base}</code>。该页面与链接不要缓存。</p>
</body>
</html>`;
}

function bootstrapJs(config) {
  const { host, port, token } = config.gateway;
  const base = `http://${host}:${port}`;
  return `(()=>{if(window.__DSH_BOOTSTRAPPED__)return;window.__DSH_BOOTSTRAPPED__=true;` +
    `const s=document.createElement('script');s.type='module';` +
    `s.src='${base}/v1/client.mjs?token=${token}';` +
    `document.documentElement.appendChild(s);})();`;
}

const STATIC_ROUTES = [
  { pattern: /^\/(core|shared)\/[a-z0-9-]+\.js$/, root: SRC_ROOT },
];

async function serveStatic(urlPath) {
  for (const route of STATIC_ROUTES) {
    if (route.pattern.test(urlPath)) {
      const relative = urlPath.slice(1);
      const file = resolve(route.root, relative);
      if (!file.startsWith(route.root)) {
        return null;
      }
      try {
        return await readFile(file, 'utf8');
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * @param {object} options
 * @param {object} options.config 由 loadConfig 返回
 * @param {object} [options.modelAdapter] 测试注入用；默认 createModelAdapter(config)
 */
export function createGatewayServer(options) {
  const config = options.config;
  const modelAdapter = options.modelAdapter ?? createModelAdapter(config);
  const rateHits = new Map();

  function consumeRateLimit(pathname) {
    const rules = RATE_LIMIT_RULES.get(pathname);
    if (!rules) {
      return false;
    }
    const hits = rateHits.get(pathname) ?? [];
    const { recent, limited } = isRateLimited(rules, hits);
    recent.push(Date.now());
    rateHits.set(pathname, recent);
    return limited;
  }

  function isAuthorized(req, { allowQueryToken = false } = {}) {
    const headerToken = req.headers[TOKEN_HEADER];
    if (typeof headerToken === 'string' && safeEqual(headerToken, config.gateway.token)) {
      return true;
    }
    if (allowQueryToken) {
      const url = new URL(req.url, 'http://gateway.local');
      const queryToken = url.searchParams.get('token');
      return typeof queryToken === 'string' && safeEqual(queryToken, config.gateway.token);
    }
    return false;
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://gateway.local');
    const pathname = url.pathname;

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }

      // 健康检查：免鉴权。
      if (req.method === 'GET' && pathname === '/v1/health') {
        sendJson(res, 200, protocolOk({ status: 'up', time: new Date().toISOString() }));
        return;
      }

      // 页面内 ES 模块及依赖：不携带密钥，开放 CORS 供书签模式导入。
      if (req.method === 'GET' && (pathname === '/v1/client.mjs' || STATIC_ROUTES.some((r) => r.pattern.test(pathname)))) {
        let content = null;
        if (pathname === '/v1/client.mjs') {
          try {
            content = await readFile(resolve(HERE, 'client', 'injected-page.mjs'), 'utf8');
          } catch {
            content = null;
          }
        } else {
          content = await serveStatic(pathname);
        }
        if (content !== null) {
          sendText(res, 200, content, 'text/javascript');
        } else {
          sendJson(res, 404, protocolError(ERROR_CODES.NOT_FOUND, 'not found'));
        }
        return;
      }

      // 业务端点：鉴权。
      const allowQueryToken = req.method === 'GET' &&
        (pathname === '/v1/bootstrap.js' || pathname === '/v1/bookmarklet');
      if (!isAuthorized(req, { allowQueryToken })) {
        sendJson(res, 401, protocolError(ERROR_CODES.UNAUTHORIZED, 'invalid or missing token'));
        return;
      }

      if (consumeRateLimit(pathname)) {
        sendJson(res, 429, protocolError(ERROR_CODES.RATE_LIMITED, 'too many requests'));
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/handshake') {
        sendJson(res, 200, protocolOk({
          name: PACKAGE_JSON.name,
          version: PACKAGE_JSON.version,
          model: { id: config.model.model, endpoint: config.model.baseUrl },
          capabilities: { translate: true, chat: true, bookmarklet: true },
          minClientProtocol: PROTOCOL_VERSION,
          maxClientProtocol: PROTOCOL_VERSION,
        }));
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/bookmarklet') {
        sendText(res, 200, bookmarkletPage(config), 'text/html');
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/bootstrap.js') {
        sendText(res, 200, bootstrapJs(config), 'text/javascript');
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/translate') {
        const body = await readJsonBody(req);
        const validation = validateTranslateRequest(body);
        if (!validation.ok) {
          sendJson(res, 422, validation.error);
          return;
        }
        const result = await modelAdapter.translateItems({
          items: validation.value.items,
          targetLang: validation.value.targetLang,
          sourceLang: validation.value.sourceLang,
        });
        sendJson(res, 200, protocolOk({ items: result.items }));
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/chat') {
        const body = await readJsonBody(req);
        const validation = validateChatRequest(body);
        if (!validation.ok) {
          sendJson(res, 422, validation.error);
          return;
        }
        const result = await modelAdapter.chat({
          messages: validation.value.messages,
          context: validation.value.context,
        });
        sendJson(res, 200, protocolOk({ text: result.text }));
        return;
      }

      sendJson(res, 404, protocolError(ERROR_CODES.NOT_FOUND, 'not found'));
    } catch (error) {
      if (error instanceof ModelAdapterError) {
        const status = STATUS_BY_CODE.get(error.code) ?? 500;
        sendJson(res, status, protocolError(error.code, error.message));
        return;
      }
      const code = error?.code === ERROR_CODES.VALIDATION_FAILED
        ? ERROR_CODES.VALIDATION_FAILED
        : ERROR_CODES.INTERNAL_ERROR;
      const status = STATUS_BY_CODE.get(code) ?? 500;
      sendJson(res, status, protocolError(code, error?.message ?? 'internal error'));
    }
  });
}
