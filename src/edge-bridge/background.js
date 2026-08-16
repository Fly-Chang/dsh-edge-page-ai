/**
 * Edge MV3 后台服务：转发工具条点击与快捷键到当前标签页。
 * 不处理翻译逻辑，不持有模型密钥（仅 storage 中保存网关 token）。
 */

async function toggleInTab(tabId) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'dsh-toggle-panel' });
      return;
    } catch {
      if (attempt === 0) {
        // The tab may have been open before the extension was reloaded.
        // Inject the content script on demand, then try again.
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js'],
          });
        } catch {
          // Restricted page (edge://, store, etc.): cannot inject.
          return;
        }
      }
    }
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

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.runtime.openOptionsPage();
  }
});
