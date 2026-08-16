/**
 * 网关配置加载与本地 token 持久化。
 * 优先级：环境变量 > config.local.json > config.example.json > 内置默认值。
 * config.local.json 被 .gitignore 忽略，可安全保存密钥。
 */
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function readJson(file) {
  try {
    // 兼容 Windows PowerShell 5.1 写出的 UTF-8 BOM 文件（BUG-010）。
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * 读取 Windows 用户级环境变量（HKCU\Environment）。
 * 用于网关由旧进程/工具启动、未继承新设置的用户环境变量时回退读取。
 * 非 Windows 或读取失败返回 undefined。
 */
function readUserEnvironment(name) {
  try {
    const output = execFileSync(
      'reg',
      ['query', 'HKCU\\Environment', '/v', name],
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const match = output.match(new RegExp(`\\b${name}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.+)`, 'i'));
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function envOr(value, name, userEnvFallback = true) {
  const raw = process.env[name];
  if (raw !== undefined && raw !== '') {
    return raw;
  }
  if (userEnvFallback) {
    const user = readUserEnvironment(name);
    if (user !== undefined && user !== '') {
      return user;
    }
  }
  return value;
}

/**
 * @param {object} [options]
 * @param {string} [options.cwd]
 */
export function loadConfig(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const localFile = resolve(cwd, 'config.local.json');
  const exampleFile = resolve(cwd, 'config.example.json');

  const localExists = existsSync(localFile);
  const localRaw = readJson(localFile);
  if (localExists && !localRaw) {
    throw new Error(
      `config.local.json exists but is not valid JSON; refusing to overwrite it. ` +
      `Fix or delete the file and try again.`,
    );
  }
  const base = localRaw ?? readJson(exampleFile) ?? {};

  const gateway = base.gateway ?? {};
  const model = base.model ?? {};
  const userEnvFallback = options.userEnvFallback !== false;

  const host = envOr(gateway.host ?? '127.0.0.1', 'DSH_GATEWAY_HOST', userEnvFallback);
  const port = Number.parseInt(envOr(String(gateway.port ?? 8787), 'DSH_GATEWAY_PORT', userEnvFallback), 10);
  let token = envOr(gateway.token ?? '', 'DSH_GATEWAY_TOKEN', userEnvFallback);

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
      provider: envOr(model.provider ?? 'mock', 'DSH_MODEL_PROVIDER', userEnvFallback),
      baseUrl: envOr(model.baseUrl ?? 'https://api.openai.com/v1', 'DSH_MODEL_BASE_URL', userEnvFallback),
      apiKey: envOr(model.apiKey ?? '', 'DSH_MODEL_API_KEY', userEnvFallback),
      model: envOr(model.model ?? 'gpt-4o-mini', 'DSH_MODEL_NAME', userEnvFallback),
      timeoutMs: Number.parseInt(envOr(String(model.timeoutMs ?? 30000), 'DSH_MODEL_TIMEOUT_MS', userEnvFallback), 10),
      jsonMode: envOr(model.jsonMode ?? false, 'DSH_MODEL_JSON_MODE', userEnvFallback) === 'true',
      extraBody: parseExtraBody(model.extraBody, userEnvFallback),
    },
  };
}

function parseExtraBody(value, userEnvFallback = true) {
  let fromEnv = process.env.DSH_MODEL_EXTRA_BODY;
  if ((fromEnv === undefined || fromEnv === '') && userEnvFallback) {
    fromEnv = readUserEnvironment('DSH_MODEL_EXTRA_BODY');
  }
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
