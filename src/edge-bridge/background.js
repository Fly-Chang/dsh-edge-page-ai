/**
 * Edge MV3 后台服务：转发工具条点击与快捷键到当前标签页。
 * 不处理翻译逻辑，不持有模型密钥（仅 storage 中保存网关 token）。
 */

async function toggleInTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'dsh-toggle-panel' });
  } catch {
    // 页面无法接收（受限页面/未注入），静默失败。
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
