/**
 * Edge 扩展选项页：保存网关地址与 token，并测试连通性。
 */
(() => {
  const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8787';
  const gatewayUrlInput = document.getElementById('gateway-url');
  const tokenInput = document.getElementById('token');
  const statusEl = document.getElementById('status');

  function setStatus(message, className = '') {
    statusEl.textContent = message;
    statusEl.className = className;
  }

  async function load() {
    const stored = await chrome.storage.local.get(['gatewayUrl', 'token']);
    gatewayUrlInput.value = stored.gatewayUrl || DEFAULT_GATEWAY_URL;
    tokenInput.value = stored.token || '';
  }

  document.getElementById('save').addEventListener('click', async () => {
    const gatewayUrl = gatewayUrlInput.value.trim().replace(/\/+$/, '') || DEFAULT_GATEWAY_URL;
    const token = tokenInput.value.trim();
    await chrome.storage.local.set({ gatewayUrl, token });
    setStatus('已保存。刷新已打开的页面后生效。', 'ok');
  });

  document.getElementById('test').addEventListener('click', async () => {
    const gatewayUrl = gatewayUrlInput.value.trim().replace(/\/+$/, '') || DEFAULT_GATEWAY_URL;
    const token = tokenInput.value.trim();
    setStatus('测试中…');
    try {
      const response = await fetch(`${gatewayUrl}/v1/health`);
      if (!response.ok) {
        setStatus(`网关响应异常：HTTP ${response.status}`, 'err');
        return;
      }
      if (!token) {
        setStatus('网关在线，但尚未填写 token。', 'err');
        return;
      }
      const handshake = await fetch(`${gatewayUrl}/v1/handshake`, {
        headers: { 'X-DSH-Token': token },
      });
      if (!handshake.ok) {
        setStatus('网关在线，但 token 校验失败。', 'err');
        return;
      }
      const payload = await handshake.json();
      setStatus(`连接成功：${payload.name} v${payload.version}，模型 ${payload.model?.id ?? 'mock'}`, 'ok');
    } catch {
      setStatus('无法连接本机网关，请确认 DSH 插件/网关已启动。', 'err');
    }
  });

  void load();
})();
