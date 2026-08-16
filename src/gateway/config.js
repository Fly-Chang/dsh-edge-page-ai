/**
 * 网关配置加载与本地 token 持久化。
 * 优先级：环境变量 > config.local.json > config.example.json > 内置默认值。
 * config.local.json 被 .gitignore 忽略，可安全保存密钥。
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function envOr(value, name) {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? value : raw;
}

/**
 * @param {object} [options]
 * @param {string} [options.cwd]
 */
export function loadConfig(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const localFile = resolve(cwd, 'config.local.json');
  const exampleFile = resolve(cwd, 'config.example.json');

  const localRaw = readJson(localFile);
  const base = localRaw ?? readJson(exampleFile) ?? {};

  const gateway = base.gateway ?? {};
  const model = base.model ?? {};

  const host = envOr(gateway.host ?? '127.0.0.1', 'DSH_GATEWAY_HOST');
  const port = Number.parseInt(envOr(String(gateway.port ?? 8787), 'DSH_GATEWAY_PORT'), 10);
  let token = envOr(gateway.token ?? '', 'DSH_GATEWAY_TOKEN');

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`refusing to bind non-loopback host: ${host}`);
  }

  // 没有配置 token 时生成随机 token，并持久化到本地配置，保证重启后书签仍有效。
  if (!token) {
    token = randomBytes(16).toString('hex');
    if (localRaw) {
      writeJson(localFile, {
        ...localRaw,
        gateway: { ...localRaw.gateway, token },
      });
    } else {
      const created = {
        gateway: { host, port, token },
        model: {
          provider: model.provider ?? 'mock',
          baseUrl: model.baseUrl ?? 'https://api.openai.com/v1',
          apiKey: model.apiKey ?? '',
          model: model.model ?? 'gpt-4o-mini',
          timeoutMs: model.timeoutMs ?? 30000,
          jsonMode: model.jsonMode ?? false,
          extraBody: model.extraBody ?? {},
        },
      };
      writeJson(localFile, created);
    }
  }

  return {
    configFile: localFile,
    gateway: {
      host,
      port,
      token,
    },
    model: {
      provider: envOr(model.provider ?? 'mock', 'DSH_MODEL_PROVIDER'),
      baseUrl: envOr(model.baseUrl ?? 'https://api.openai.com/v1', 'DSH_MODEL_BASE_URL'),
      apiKey: envOr(model.apiKey ?? '', 'DSH_MODEL_API_KEY'),
      model: envOr(model.model ?? 'gpt-4o-mini', 'DSH_MODEL_NAME'),
      timeoutMs: Number.parseInt(envOr(String(model.timeoutMs ?? 30000), 'DSH_MODEL_TIMEOUT_MS'), 10),
      jsonMode: envOr(model.jsonMode ?? false, 'DSH_MODEL_JSON_MODE') === 'true',
      extraBody: parseExtraBody(model.extraBody),
    },
  };
}

function parseExtraBody(value) {
  const fromEnv = process.env.DSH_MODEL_EXTRA_BODY;
  if (fromEnv) {
    try {
      value = JSON.parse(fromEnv);
    } catch {
      throw new Error('DSH_MODEL_EXTRA_BODY is not valid JSON');
    }
  }
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('model.extraBody must be a JSON object');
  }
  return value;
}
