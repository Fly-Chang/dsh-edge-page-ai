/**
 * 页面内客户端（书签模式与薄壳扩展共用）。
 * 通过 <script type="module" src="/v1/client.mjs?token=..."> 注入页面上下文，
 * 直接调用本地网关；不包含模型密钥以外的任何后端业务。
 */
import { createGatewayClient, GatewayClientError } from '../../shared/gateway-client.js';
import {
  restoreOriginals,
  snapshotOriginals,
  translatePage,
} from '../../core/page-translator.js';

const BRIDGE_CONFIG = globalThis.__DSH_BRIDGE_CONFIG__ ?? null;
const TOKEN = new URL(import.meta.url).searchParams.get('token') ?? BRIDGE_CONFIG?.token ?? '';
const BASE_URL = BRIDGE_CONFIG?.gatewayUrl ?? undefined;
const TARGET_LANG = 'zh-CN';
const SOURCE_LANG = 'en';
const MAX_CHAT_ROWS = 40;

function notify(message) {
  // 页面主世界可用 alert；扩展隔离世界没有 alert，降级到 console/status。
  if (typeof globalThis.alert === 'function') {
    try {
      globalThis.alert(message);
      return;
    } catch {
      // fall through
    }
  }
  console.error('[edge-page-ai]', message);
}

function start() {
  try {
    bootstrap();
  } catch (error) {
    // 初始化失败时给出可见提示，避免“点击后无反应”。
    notify(`DSH 页面客户端初始化失败：${error?.message ?? error}`);
  }
}

if (window.__DSH_PANEL__) {
  // 同一文档再次注入（例如缓存破坏 URL 重载）：已有面板则直接显示，不再创建第二个。
  const existing = document.getElementById('dsh-page-ai-panel');
  if (existing) {
    existing.style.display = '';
  } else {
    delete window.__DSH_PANEL__;
    start();
  }
} else {
  start();
}

function bootstrap() {
  const gateway = createGatewayClient({
    baseUrl: BASE_URL,
    token: TOKEN,
    timeoutMs: 180_000,
  });
  const state = {
    originals: new Map(),
    busy: false,
    handshakeOk: false,
    abortController: null,
  };

  const ui = buildUi(gateway, state);
  const panelApi = {
    gateway,
    state,
    show: ui.show,
    hide: ui.hide,
    toggle: ui.toggle,
  };
  window.__DSH_PANEL__ = panelApi;
  globalThis.__DSH_BRIDGE_PANEL__ = panelApi;
}

function buildUi(gateway, state) {
  const root = document.createElement('div');
  root.id = 'dsh-page-ai-panel';
  root.setAttribute('data-dsh-ui', '1');
  root.innerHTML = `    <style>
      #dsh-page-ai-panel{all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647;width:324px;font:13px/1.5 system-ui,"Segoe UI",sans-serif;color:#1f2430;background:rgba(255,255,255,.97);border:1px solid rgba(15,23,42,.12);border-radius:16px;box-shadow:0 18px 50px rgba(15,23,42,.22);overflow:hidden}
      #dsh-page-ai-panel .dsh-head{display:flex;align-items:center;gap:8px;padding:12px 14px;cursor:move;user-select:none;background:linear-gradient(135deg,#4f6ef7,#7c5cf0);color:#fff;font-weight:600}
      #dsh-page-ai-panel .dsh-dot{width:8px;height:8px;border-radius:50%;background:#5eead4;box-shadow:0 0 0 3px rgba(94,234,212,.25)}
      #dsh-page-ai-panel .dsh-head button{margin-left:auto;border:0;background:rgba(255,255,255,.16);color:#fff;width:24px;height:24px;border-radius:8px;font-size:14px;line-height:1;cursor:pointer}
      #dsh-page-ai-panel .dsh-head button:hover{background:rgba(255,255,255,.28)}
      #dsh-page-ai-panel .dsh-body{padding:14px;display:flex;flex-direction:column;gap:10px}
      #dsh-page-ai-panel .dsh-row{display:flex;gap:8px}
      #dsh-page-ai-panel button.dsh-btn{flex:1;border:1px solid #dfe3ea;border-radius:10px;background:#f7f8fb;padding:8px 6px;cursor:pointer;font:inherit;font-weight:500;color:#384152;transition:transform .05s ease,box-shadow .15s ease,background .15s ease}
      #dsh-page-ai-panel button.dsh-btn:hover{background:#eef1f7}
      #dsh-page-ai-panel button.dsh-btn:active{transform:translateY(1px)}
      #dsh-page-ai-panel button.dsh-btn:disabled{opacity:.45;cursor:default;transform:none}
      #dsh-page-ai-panel button.dsh-primary{background:linear-gradient(135deg,#4f6ef7,#7c5cf0);border:none;color:#fff}
      #dsh-page-ai-panel button.dsh-primary:hover{background:linear-gradient(135deg,#5b7bf8,#8b6cf7)}
      #dsh-page-ai-panel button.dsh-stop{border-color:#f3c6c6;background:#fff5f5;color:#b42318}
      #dsh-page-ai-panel button.dsh-stop:hover{background:#ffecec}
      #dsh-page-ai-panel .dsh-progress{height:4px;background:#eef1f6;border-radius:999px;overflow:hidden;display:none}
      #dsh-page-ai-panel .dsh-progress.dsh-on{display:block}
      #dsh-page-ai-panel .dsh-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,#4f6ef7,#8b6cf7);transition:width .2s ease}
      #dsh-page-ai-panel .dsh-status{color:#667085;min-height:20px;word-break:break-all;background:#f6f8fb;border-radius:8px;padding:6px 8px}
      #dsh-page-ai-panel .dsh-status.dsh-err{background:#fff5f5;color:#b42318}
      #dsh-page-ai-panel details{border-top:1px dashed #e6eaf1;padding-top:8px}
      #dsh-page-ai-panel summary{cursor:pointer;font-weight:600;color:#384152}
      #dsh-page-ai-panel textarea{box-sizing:border-box;width:100%;height:72px;resize:vertical;border:1px solid #dfe3ea;border-radius:10px;padding:8px;font:inherit;background:#fbfcfe}
      #dsh-page-ai-panel .dsh-chat{border-top:1px dashed #e6eaf1;padding-top:8px;max-height:170px;overflow:auto;display:flex;flex-direction:column;gap:6px;white-space:pre-wrap;word-break:break-word}
      #dsh-page-ai-panel .dsh-msg{max-width:88%;border-radius:10px;padding:6px 9px;line-height:1.45}
      #dsh-page-ai-panel .dsh-user{align-self:flex-end;background:#eef2ff;color:#384152}
      #dsh-page-ai-panel .dsh-bot{align-self:flex-start;background:#f6f8fb;color:#1f2430}
    </style>
    <div class="dsh-head" data-dsh-drag-handle="1"><span class="dsh-dot"></span><span>DSH 页面助手</span><button type="button" data-dsh-close="1" title="关闭">×</button></div>
    <div class="dsh-body">
      <div class="dsh-row">
        <button type="button" class="dsh-btn dsh-primary" data-dsh-action="translate">整页翻译</button>
        <button type="button" class="dsh-btn" data-dsh-action="restore">还原原文</button>
        <button type="button" class="dsh-btn dsh-stop" data-dsh-action="stop" disabled>停止</button>
      </div>
      <div class="dsh-progress"><span></span></div>
      <div class="dsh-status">正在检查本地网关…</div>
      <details>
        <summary>随呼对话</summary>
        <div style="display:flex;flex-direction:column;gap:8px;padding-top:8px">
          <textarea data-dsh-chat-input placeholder="向 DSH/模型提问，默认带上当前页面信息"></textarea>
          <button type="button" class="dsh-btn dsh-primary" data-dsh-action="chat">发送</button>
          <div class="dsh-chat" data-dsh-chat-log></div>
        </div>
      </details>
    </div>`;

  const statusEl = root.querySelector('.dsh-status');
  const chatInput = root.querySelector('[data-dsh-chat-input]');
  const chatLog = root.querySelector('[data-dsh-chat-log]');
  const progressEl = root.querySelector('.dsh-progress');
  const progressBar = root.querySelector('.dsh-progress span');

  const setProgress = (done, total) => {
    if (!progressEl || !progressBar) return;
    if (!total || done >= total) {
      progressEl.classList.remove('dsh-on');
      progressBar.style.width = '0%';
      return;
    }
    progressEl.classList.add('dsh-on');
    progressBar.style.width = `${Math.min(100, Math.round((done / total) * 100))}%`;
  };

  const setStatus = (message, isError = false) => {
    statusEl.textContent = message;
    statusEl.classList.toggle('dsh-err', isError);
  };

  const setBusy = (busy) => {
    state.busy = busy;
    for (const button of root.querySelectorAll('button.dsh-btn')) {
      if (button.dataset.dshAction === 'stop') {
        button.disabled = !busy;
      } else {
        button.disabled = busy;
      }
    }
  };

  async function onTranslate() {
    if (state.busy) return;
    const controller = new AbortController();
    state.abortController = controller;
    setBusy(true);
    setStatus('正在收集页面文本…');
    setProgress(0, 1);
    try {
      const result = await translatePage({
        root: document.body,
        gateway,
        sourceLang: SOURCE_LANG,
        targetLang: TARGET_LANG,
        onProgress: (_phase, done, total) => {
        setProgress(done, total);
        setStatus(`翻译中 ${done}/${total}`);
      },
          signal: controller.signal,
      });
      if (result.applied > 0) {
        state.originals = snapshotOriginals(result.units);
      }
      if (result.aborted) {
        setStatus(result.applied > 0 ? `已停止：${result.applied} 处已翻译，其余保留原文` : '已停止翻译');
      } else if (result.failed.length > 0) {
        setStatus(`完成：${result.applied} 处已翻译，${result.failed.length} 处保留原文`, true);
      } else {
        setStatus(`完成：${result.applied} 处已翻译`);
      }
    } catch (error) {
      setStatus(friendlyError(error), true);
    } finally {
      if (state.abortController === controller) {
        state.abortController = null;
      }
      setProgress(0, 0);
      setBusy(false);
    }
  }

  function onStop() {
    if (!state.busy || !state.abortController) {
      setStatus('当前没有进行中的翻译');
      return;
    }
    state.abortController.abort();
    setStatus('正在停止翻译…');
  }

  function onRestore() {
    const count = restoreOriginals(state.originals);
    state.originals = new Map();
    setStatus(count > 0 ? `已还原 ${count} 处原文` : '没有可还原的内容');
  }

  async function onChat() {
    const prompt = chatInput.value.trim();
    if (!prompt) {
      setStatus('请先输入问题', true);
      return;
    }
    setBusy(true);
    setStatus('对话中…');
    try {
      const payload = {
        protocol: 1,
        messages: [{ role: 'user', content: prompt }],
        context: { url: location.href, title: document.title },
      };
      const response = await gateway.chat(payload);
      appendChat('我', prompt);
      appendChat('DSH', response.text);
      chatInput.value = '';
      setStatus('对话完成');
    } catch (error) {
      setStatus(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  }

  function appendChat(who, text) {
    const row = document.createElement('div');
    row.className = who === '我' ? 'dsh-msg dsh-user' : 'dsh-msg dsh-bot';
    row.textContent = `${who}：${text}`;
    chatLog.appendChild(row);
    while (chatLog.children.length > MAX_CHAT_ROWS) {
      chatLog.firstChild.remove();
    }
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function friendlyError(error) {
    if (error instanceof GatewayClientError) {
      const messages = {
        NETWORK_ERROR: '无法连接本地网关，请先运行 DSH 插件/网关',
        UNAUTHORIZED: '网关鉴权失败，请刷新书签或在扩展设置中更新 token',
        MODEL_UNAVAILABLE: '模型未配置或不可用，请检查 config.local.json',
        MODEL_ERROR: '模型返回异常，请稍后重试',
        RATE_LIMITED: '请求过于频繁，请稍后再试',
      };
      return messages[error.code] ?? `网关错误：${error.message}`;
    }
    return `出错：${error?.message ?? error}`;
  }

  const show = () => {
    root.style.display = '';
  };
  const hide = () => {
    root.style.display = 'none';
  };
  const toggle = () => {
    if (root.style.display === 'none') {
      show();
    } else {
      hide();
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'dsh-page-ai-bridge') return;
    if (event.data?.type !== 'toggle-panel') return;
    toggle();
  });

  root.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-dsh-action]')?.dataset?.dshAction;
    if (action === 'translate') await onTranslate();
    if (action === 'restore') onRestore();
    if (action === 'stop') onStop();
    if (action === 'chat') await onChat();
    if (event.target.closest('[data-dsh-close]')) {
      // 关闭改为隐藏：同文档内模块 URL 相同，浏览器不会二次执行模块。
      // 隐藏后再次点击书签/扩展图标会直接重新显示，不需要刷新页面（BUG-008）。
      hide();
    }
  });

  makeDraggable(root, root.querySelector('[data-dsh-drag-handle]'));
  document.documentElement.appendChild(root);

  gateway.handshake().then((payload) => {
    state.handshakeOk = true;
    setStatus(`就绪：${payload.model?.id ?? 'mock'}（协议 v${payload.protocol}）`);
  }).catch((error) => {
    setStatus(friendlyError(error), true);
  });

  return { show, hide, toggle };
}

function makeDraggable(root, handle) {
  handle.addEventListener('pointerdown', (event) => {
    const rect = root.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const onMove = (moveEvent) => {
      root.style.left = `${moveEvent.clientX - offsetX}px`;
      root.style.top = `${moveEvent.clientY - offsetY}px`;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}
