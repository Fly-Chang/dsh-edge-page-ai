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

  async function togglePanel() {
    const existing = globalThis.__DSH_BRIDGE_PANEL__;
    if (existing) {
      existing.toggle();
      return true;
    }
    return ensurePanel();
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