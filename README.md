# dsh-edge-page-ai

在 Edge 浏览器任意页面上随时调出 **DSH / 已配置模型**，并对英文页面执行
“**只替换文字、不改变页面结构**”的整页翻译。

- 主体：DSH 本地网关（翻译核心、模型适配、书签分发）
- 浏览器侧：Edge MV3 薄壳扩展 + 书签模式（二选一）
- 模型：BYOK（OpenAI 兼容端点），已适配 DeepSeek V4 Flash 低思考模式
- 隐私：模型密钥只保存在 `DSH_*` 环境变量，不写入仓库

---

## 功能

- 整页翻译：只修改文本节点，不动 DOM 结构、样式与交互
- 渐进翻译：每批完成立即回填，页面“逐块”变中文
- 性能：小批 30 条 + 3 路并发；翻译关闭思考、对话保留低思考
- 手动停止：翻译中可强制终止，已完成部分保留
- 随呼对话：面板内直接与模型对话，自动附带当前页面上下文
- 双入口：
  - **Edge 扩展**：手动点击工具栏图标或 `Alt+Shift+D` 唤起，支持严格 CSP 页面
  - **书签模式**：零安装试用（受页面 CSP/本地网络策略限制）

## 架构

```text
Edge 页面
   ├─ 书签模式：页面主世界加载 /v1/client.mjs
   └─ 薄壳扩展：content script 隔离世界加载 bridge-client.bundle.mjs
        │  HTTP (127.0.0.1:8787, X-DSH-Token)
        ▼
本地网关 src/gateway/server.js
   ├─ /v1/health、/v1/handshake、/v1/translate、/v1/chat、/v1/bookmarklet
   └─ OpenAI 兼容模型适配器（DeepSeek 等）
        │
        ▼
DSH_MODEL_API_KEY / config.local.json
```

## 目录结构

```text
docs/pm/          项目管理规范（章程、命名、日志/缺陷模板、流程）
docs/specs/       协议与接口规格
docs/worklogs/    工作日志（按日）
docs/bugs/        缺陷记录（BUG-NNN.md）
src/core/         共享翻译核心（收集、占位符、回填）
src/gateway/      本地网关与书签模式入口
src/edge-bridge/  Edge MV3 薄壳扩展（手动唤起）
tests/            测试（node --test）
scripts/          启动/停止/构建脚本
```

命名、存放、日志与缺陷管理规则见 `docs/pm/file-conventions.md`。

## 环境要求

- Windows 11 + Microsoft Edge
- Node.js ≥ 18.17（开发环境验证：v22.19.0）
- 任意 OpenAI 兼容模型 API（示例为 DeepSeek）

## 快速开始

```powershell
# 1. 克隆仓库
git clone https://github.com/Fly-Chang/dsh-edge-page-ai.git
cd dsh-edge-page-ai

# 2. 设置模型密钥（仅一次；写入 Windows 用户级 DSH_* 环境变量）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/set-dsh-model-env.ps1 -ApiKey "sk-你的DeepSeek密钥"

# 3. 检查环境变量（密钥只显示前 4 位和后 4 位）
npm run env:check

# 4. 启动本地网关（任选一种）
#    双击 scripts\start-gateway-silent.vbs  ← 后台静默，推荐
#    双击 scripts\start-gateway.bat         ← 前台窗口
#    npm start                              ← 开发调试

# 5. 浏览器入口（二选一）
#    a) 薄壳扩展（推荐日常使用）：
#       edge://extensions → 开发人员模式 → 加载 src/edge-bridge
#       设置页填写网关地址 http://127.0.0.1:8787 与 token
#    b) 书签模式（零安装试用）：
#       双击 scripts\open-bookmarklet.bat，按页面说明创建书签
```

停止网关：双击 `scripts\stop-gateway.bat`。

### 伴随浏览器启动（Phase 1）

桌面新增 **「DSH Edge」** 快捷方式（也可双击 `scripts\start-edge-with-gateway.vbs`）：

1. 检查 `127.0.0.1:8787`，未运行时自动后台启动网关；
2. 打开 Edge；
3. 当所有 Edge 可见窗口关闭约 10 秒后，自动停止“本次启动的网关”；
4. 如果启动前网关已在运行，则关闭 Edge 时**不会**停止它。

命令行调试：`npm run start:edge`。日志：`logs\edge-gateway.log`。

### 伴随浏览器启动（Phase 2：Native Messaging）

安装本机守护进程（一次性）：

```powershell
npm run native:install
```

之后 Edge 启动时会自动通过 Native Messaging Host 拉起本地网关；Edge 关闭后，
宿主进程检测到心跳停止会自动关闭“本次由宿主启动的网关”。卸载：

```powershell
npm run native:uninstall
```

- 要求：先安装 Node.js，且 Node 在 PATH 中；
- 宿主脚本：`native-host/index.js`；
- 注册表位置：`HKCU\Software\Microsoft\Edge\NativeMessagingHosts\dsh_edge_page_ai`；
- 该方案不依赖特定 Edge 入口，任意方式打开 Edge 都有效。

### 支持的 DSH 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `DSH_MODEL_API_KEY` | 模型密钥 | 空 |
| `DSH_MODEL_PROVIDER` | 服务商 | `openai-compatible` |
| `DSH_MODEL_BASE_URL` | API 地址 | `https://api.deepseek.com` |
| `DSH_MODEL_NAME` | 模型名 | `deepseek-v4-flash` |
| `DSH_MODEL_TIMEOUT_MS` | 超时 | `60000` |
| `DSH_MODEL_JSON_MODE` | JSON 模式 | `false` |
| `DSH_MODEL_EXTRA_BODY` | 厂商扩展参数 | DeepSeek 低思考 |

网关会优先读进程环境变量，其次回退读取 Windows 用户级环境变量（HKCU），
最后使用 `config.local.json`（已被 git 忽略）。

## 使用

1. 启动网关后打开任意英文网页；
2. 薄壳扩展：点工具栏图标或按 `Alt+Shift+D` 唤出面板；
   书签模式：点击书签唤出面板；
3. 点击「整页翻译」；
4. 需要中断时点击「停止」；恢复原文点击「还原原文」；
5. 「随呼对话」中可向模型提问，默认附带当前页面标题与 URL。

## 测试

```powershell
npm test
npm run build:edge-bridge
```

完整手工测试步骤见 `docs/testing-guide.md`。

## 文档

- 项目章程：`docs/pm/project-charter.md`
- 协议规格：`docs/specs/gateway-protocol-v1.md`
- 架构说明：`docs/architecture.md`
- 测试指南：`docs/testing-guide.md`
- 路线图：`docs/roadmap.md`
- 变更日志：`CHANGELOG.md`

## 许可证

[MIT](LICENSE) © Fly-Chang

