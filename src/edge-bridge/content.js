/**
 * Edge MV3 content script (isolated world).
 * Loads the bundled page client directly in the isolated world, so no <script>
 * tag is injected into the page. This bypasses page CSP / Local Network Access
 * restrictions that break bookmarklet mode (BUG-013).
 */
(() => {
  // Guard against double injection (declared content script + scripting.executeScript fallback).
  if (globalThis.__DSH_BRIDGE_CONTENT_LOADED__) {
    return;
  }
  globalThis.__DSH_BRIDGE_CONTENT_LOADED__ = true;

  const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8787';
  let loadPromise = null;

  async function getSettings() {
    const stored = await chrome.storage.local.get(['gatewayUrl', 'token']);
    return {
      gatewayUrl: (stored.gatewayUrl || DEFAULT_GATEWAY_URL).replace(/\/+$/, ''),
      token: stored.token || '',
    };
  }

  async function ensurePanel() {
    const settings = await getSettings();
    if (!settings.token) {
      console.info('[edge-page-ai] gateway token is not configured. Open the extension options.');
      return false;
    }

    const existing = globalThis.__DSH_BRIDGE_PANEL__;
    if (existing) {
      existing.show();
      return true;
    }

    if (loadPromise) {
      await loadPromise;
      return Boolean(globalThis.__DSH_BRIDGE_PANEL__);
    }

    globalThis.__DSH_BRIDGE_CONFIG__ = {
      gatewayUrl: settings.gatewayUrl,
      token: settings.token,
    };

    loadPromise = import(chrome.runtime.getURL('bridge-client.bundle.mjs'))
      .then(() => {
        globalThis.__DSH_BRIDGE_PANEL__?.show?.();
        return Boolean(globalThis.__DSH_BRIDGE_PANEL__);
      })
      .catch((error) => {
        console.warn('[edge-page-ai] failed to load bridge client', error);
        loadPromise = null;
        return false;
      });

    return loadPromise;
  }

  function showNotice(message) {
    let el = document.getElementById('dsh-page-ai-bridge-error');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dsh-page-ai-bridge-error';
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;'
        + 'background:#b42318;color:#fff;padding:10px 14px;border-radius:8px;'
        + 'font:13px/1.5 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.2)';
      document.documentElement.appendChild(el);
    }
    el.textContent = `[DSH] ${message}`;
    clearTimeout(el.__dshTimer);
    el.__dshTimer = setTimeout(() => el.remove(), 8000);
  }

  async function togglePanel() {
    const existing = globalThis.__DSH_BRIDGE_PANEL__;
    if (existing) {
      existing.toggle();
      return true;
    }
    const ok = await ensurePanel();
    if (!ok) {
      showNotice('无法启动：请确认网关已运行，且扩展选项中已填写 token。');
    }
    return ok;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'dsh-toggle-panel') {
      void togglePanel().then((ok) => sendResponse({ ok }));
      return true; // keep the message channel open for async sendResponse
    }
    return false;
  });

  // Do NOT auto-initialize the panel or access the gateway on page load.
  // The client loads only when the user clicks the toolbar icon or presses
  // Alt+Shift+D (manual activation requested by the user).
})();