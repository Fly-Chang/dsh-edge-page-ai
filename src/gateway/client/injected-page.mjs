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

const TOKEN = new URL(import.meta.url).searchParams.get('token') ?? '';
const TARGET_LANG = 'zh-CN';
const SOURCE_LANG = 'en';
const MAX_CHAT_ROWS = 40;

if (window.__DSH_PANEL__) {
  console.warn('[edge-page-ai] panel already injected');
} else {
  try {
    bootstrap();
  } catch (error) {
    // 初始化失败时清除书签侧置位的占位标志，允许用户刷新后/修复后再次点击书签重试。
    delete window.__DSH_BOOTSTRAPPED__;
    console.error('[edge-page-ai] client bootstrap failed', error);
    alert(`DSH 页面客户端初始化失败：${error?.message ?? error}`);
  }
}

function bootstrap() {
  const gateway = createGatewayClient({ token: TOKEN, timeoutMs: 180_000 });
  const state = {
    originals: new Map(),
    busy: false,
    handshakeOk: false,
  };

  window.__DSH_PANEL__ = { gateway, state };
  buildUi(gateway, state);
}

function buildUi(gateway, state) {
  const root = document.createElement('div');
  root.id = 'dsh-page-ai-panel';
  root.setAttribute('data-dsh-ui', '1');
  root.innerHTML = `
  <style>
    #dsh-page-ai-panel{all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;
      width:300px;font:13px/1.5 system-ui,"Segoe UI",sans-serif;color:#1b1f24;
      background:#ffffff;border:1px solid #d0d7de;border-radius:10px;
      box-shadow:0 8px 30px rgba(0,0,0,.18)}
    #dsh-page-ai-panel .dsh-head{display:flex;align-items:center;gap:8px;
      padding:8px 10px;cursor:move;user-select:none;border-bottom:1px solid #eaeef2;
      font-weight:600}
    #dsh-page-ai-panel .dsh-head button{margin-left:auto;border:0;background:transparent;
      font-size:15px;cursor:pointer;color:#667085}
    #dsh-page-ai-panel .dsh-body{padding:10px;display:flex;flex-direction:column;gap:8px}
    #dsh-page-ai-panel .dsh-row{display:flex;gap:8px}
    #dsh-page-ai-panel button.dsh-btn{flex:1;border:1px solid #d0d7de;border-radius:6px;
      background:#f6f8fa;padding:7px 8px;cursor:pointer;font:inherit}
    #dsh-page-ai-panel button.dsh-btn:hover{background:#eef1f4}
    #dsh-page-ai-panel button.dsh-btn:disabled{opacity:.5;cursor:default}
    #dsh-page-ai-panel .dsh-status{color:#667085;min-height:18px;word-break:break-all}
    #dsh-page-ai-panel .dsh-status.dsh-err{color:#b42318}
    #dsh-page-ai-panel textarea{box-sizing:border-box;width:100%;height:72px;resize:vertical;
      border:1px solid #d0d7de;border-radius:6px;padding:6px;font:inherit}
    #dsh-page-ai-panel .dsh-chat{border-top:1px dashed #eaeef2;padding-top:8px;
      max-height:160px;overflow:auto;white-space:pre-wrap;word-break:break-word}
  </style>
  <div class="dsh-head" data-dsh-drag-handle="1"><span>DSH 页面助手</span><button type="button" data-dsh-close="1" title="关闭">×</button></div>
  <div class="dsh-body">
    <div class="dsh-row">
      <button type="button" class="dsh-btn" data-dsh-action="translate">整页翻译</button>
      <button type="button" class="dsh-btn" data-dsh-action="restore">还原原文</button>
    </div>
    <div class="dsh-status">正在检查本地网关…</div>
    <details>
      <summary style="cursor:pointer">随呼对话</summary>
      <div style="display:flex;flex-direction:column;gap:8px;padding-top:8px">
        <textarea data-dsh-chat-input placeholder="向 DSH/模型提问，默认带上当前页面信息"></textarea>
        <button type="button" class="dsh-btn" data-dsh-action="chat">发送</button>
        <div class="dsh-chat" data-dsh-chat-log></div>
      </div>
    </details>
  </div>`;

  const statusEl = root.querySelector('.dsh-status');
  const chatInput = root.querySelector('[data-dsh-chat-input]');
  const chatLog = root.querySelector('[data-dsh-chat-log]');

  const setStatus = (message, isError = false) => {
    statusEl.textContent = message;
    statusEl.classList.toggle('dsh-err', isError);
  };

  const setBusy = (busy) => {
    state.busy = busy;
    for (const button of root.querySelectorAll('button.dsh-btn')) {
      button.disabled = busy;
    }
  };

  async function onTranslate() {
    if (state.busy) return;
    setBusy(true);
    setStatus('正在收集页面文本…');
    try {
      const result = await translatePage({
        root: document.body,
        gateway,
        sourceLang: SOURCE_LANG,
        targetLang: TARGET_LANG,
        onProgress: (_phase, done, total) => setStatus(`翻译中 ${done}/${total}`),
      });
      if (result.applied > 0) {
        state.originals = snapshotOriginals(result.units);
      }
      if (result.failed.length > 0) {
        setStatus(`完成：${result.applied} 处已翻译，${result.failed.length} 处保留原文`, true);
      } else {
        setStatus(`完成：${result.applied} 处已翻译`);
      }
    } catch (error) {
      setStatus(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
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

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'dsh-page-ai-bridge') return;
    if (event.data?.type !== 'toggle-panel') return;
    const current = document.getElementById('dsh-page-ai-panel');
    if (current) {
      current.style.display = current.style.display === 'none' ? '' : 'none';
    }
  });

  root.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-dsh-action]')?.dataset?.dshAction;
    if (action === 'translate') await onTranslate();
    if (action === 'restore') onRestore();
    if (action === 'chat') await onChat();
    if (event.target.closest('[data-dsh-close]')) {
      root.remove();
      delete window.__DSH_PANEL__;
      // 清除书签注入标志，允许用户关闭面板后再次点击书签重新打开。
      delete window.__DSH_BOOTSTRAPPED__;
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
