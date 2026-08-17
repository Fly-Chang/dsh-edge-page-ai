/**
 * Native Messaging Host for dsh-edge-page-ai.
 *
 * Protocol: length-prefixed JSON over stdio (uint32 LE length + UTF-8 JSON).
 * Messages:
 *   { type: "start-gateway" }
 *   { type: "heartbeat" }
 *   { type: "stop-gateway" }
 */
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8787;
const HEARTBEAT_TIMEOUT_MS = 90_000;
const START_WAIT_MS = 5_000;

let startedByHost = false;
let gatewayChild = null;
let lastHeartbeat = Date.now();

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function log(line) {
  try {
    process.stderr.write(`[native-host] ${line}\n`);
  } catch {
    // ignore
  }
}

async function isGatewayRunning() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/v1/health`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForGateway(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isGatewayRunning()) {
      return true;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
  }
  return false;
}

async function startGateway() {
  if (await isGatewayRunning()) {
    return { ok: true, status: 'running', startedByHost: false };
  }
  log('starting gateway');
  gatewayChild = spawn(process.execPath, ['src/gateway/server.js'], {
    cwd: ROOT,
    windowsHide: true,
    stdio: 'ignore',
  });
  startedByHost = true;

  const ready = await waitForGateway(START_WAIT_MS);
  if (!ready) {
    log('gateway failed to start');
    try {
      spawnSync('taskkill', ['/pid', String(gatewayChild.pid), '/t', '/f'], {
        windowsHide: true,
      });
    } catch {
      // ignore
    }
    gatewayChild = null;
    startedByHost = false;
    return { ok: false, status: 'failed' };
  }
  log('gateway started');
  return { ok: true, status: 'started', startedByHost: true };
}

function stopGateway() {
  if (startedByHost && gatewayChild) {
    log('stopping gateway');
    try {
      spawnSync('taskkill', ['/pid', String(gatewayChild.pid), '/t', '/f'], {
        windowsHide: true,
      });
    } catch {
      // ignore
    }
    gatewayChild = null;
    startedByHost = false;
    return { ok: true, status: 'stopped' };
  }
  return { ok: true, status: 'not-started-by-host' };
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    send({ type: 'error', ok: false, error: 'invalid message' });
    return;
  }

  lastHeartbeat = Date.now();

  switch (message.type) {
    case 'start-gateway': {
      const status = await startGateway();
      send({ type: 'status', ok: status.ok, status: status.status });
      break;
    }
    case 'heartbeat':
      send({ type: 'heartbeat-ack', ok: true });
      break;
    case 'stop-gateway': {
      const status = stopGateway();
      send({ type: 'status', ok: status.ok, status: status.status });
      break;
    }
    default:
      send({ type: 'error', ok: false, error: `unknown type: ${message.type}` });
  }
}

let inputBuffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  while (inputBuffer.length >= 4) {
    const length = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length < 4 + length) {
      break;
    }
    const raw = inputBuffer.subarray(4, 4 + length).toString('utf8');
    inputBuffer = inputBuffer.subarray(4 + length);
    try {
      void handleMessage(JSON.parse(raw));
    } catch (error) {
      send({ type: 'error', ok: false, error: error.message });
    }
  }
});

process.stdin.on('end', () => {
  log('stdin closed; stopping gateway if started by host');
  stopGateway();
  process.exit(0);
});

const heartbeatTimer = setInterval(() => {
  if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
    log('heartbeat timeout; shutting down');
    stopGateway();
    process.exit(0);
  }
}, 10_000);
heartbeatTimer.unref?.();
