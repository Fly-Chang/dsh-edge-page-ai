/**
 * Edge MV3 内容脚本（隔离世界）：
 * 1. 页面加载后检查本机网关，可用时注入 DSH 页面客户端模块；
 * 2. 接收后台的“显示/隐藏”消息并转发给页面客户端。
 *
 * 本文件刻意保持极薄：所有翻译、UI、对话逻辑都来自本地网关分发的 client.mjs。
 */
(() => {
  const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8787';
  const SCRIPT_ID = 'dsh-page-ai-injected';

  async function getSettings() {
    const stored = await chrome.storage.local.get(['gatewayUrl', 'token']);
    return {
      gatewayUrl: stored.gatewayUrl || DEFAULT_GATEWAY_URL,
      token: stored.token || '',
    };
  }

  function clientScriptExists() {
    return Boolean(document.getElementById(SCRIPT_ID));
  }

  function panelExists() {
    return Boolean(document.getElementById('dsh-page-ai-panel'));
  }

  function injectClient(gatewayUrl, token) {
    if (clientScriptExists()) {
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.type = 'module';
    script.src = `${gatewayUrl.replace(/\/+$/, '')}/v1/client.mjs?token=${encodeURIComponent(token)}`;
    script.addEventListener('error', () => {
      console.warn('[edge-page-ai] 无法加载页面客户端：请确认网关已启动且 token 正确。');
      script.remove();
    });
    document.documentElement?.appendChild(script);
  }

  async function tryInject() {
    const settings = await getSettings();
    if (!settings.token) {
      console.info('[edge-page-ai] 尚未配置网关 token，请在扩展选项中填写（npm start 会打印 token）。');
      return;
    }
    try {
      const response = await fetch(`${settings.gatewayUrl.replace(/\/+$/, '')}/v1/health`);
      if (!response.ok) {
        return;
      }
    } catch {
      return;
    }
    injectClient(settings.gatewayUrl, settings.token);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'dsh-toggle-panel') {
      if (!panelExists()) {
        void tryInject();
        sendResponse({ ok: false, reason: 'panel-not-ready' });
        return false;
      }
      window.postMessage({ source: 'dsh-page-ai-bridge', type: 'toggle-panel' }, '*');
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  void tryInject();
})();
