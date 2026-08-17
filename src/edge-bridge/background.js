/**
 * Edge MV3 后台服务：转发工具条点击与快捷键到当前标签页。
 * 不处理翻译逻辑，不持有模型密钥（仅 storage 中保存网关 token）。
 */

async function toggleInTab(tabId) {
  // Always inject the current content script first. The content script has a
  // duplicate-injection guard, so this is safe even on pages where the
  // declared content script is already present. This also heals pages that
  // were opened before an extension reload.
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  } catch {
    // Restricted page (edge://, extension store, etc.).
  }

  try {
    await chrome.tabs.sendMessage(tabId, { type: 'dsh-toggle-panel' });
    await chrome.action.setBadgeText({ text: '' });
  } catch {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#b42318' });
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id !== undefined) {
    void toggleInTab(tab.id);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-dsh-panel') {
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) {
    void toggleInTab(tab.id);
  }
});

const NATIVE_HOST_NAME = 'dsh_edge_page_ai';
const HEARTBEAT_ALARM = 'dsh-native-heartbeat';

let nativePort = null;

function connectNativeHost() {
  if (nativePort) {
    return;
  }
  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    nativePort.onMessage.addListener((message) => {
      if (message?.type === 'error') {
        console.warn('[dsh-edge-page-ai] native host error:', message.error);
      }
    });
    nativePort.onDisconnect.addListener(() => {
      nativePort = null;
    });
    nativePort.postMessage({ type: 'start-gateway' });
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
  } catch (error) {
    console.warn('[dsh-edge-page-ai] native host connect failed:', error);
  }
}

function sendHeartbeat() {
  if (nativePort) {
    nativePort.postMessage({ type: 'heartbeat' });
  }
}

chrome.runtime.onStartup.addListener(() => {
  connectNativeHost();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    sendHeartbeat();
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  connectNativeHost();
  if (details.reason === 'install') {
    void chrome.runtime.openOptionsPage();
  }
});

// Ensure native host connection is attempted whenever the service worker starts,
// including after an unpacked extension reload (onInstalled/onStartup may not fire).
connectNativeHost();
