# 测试指南

- 文档编号: SPEC-003
- 版本: 1.0.0
- 生效日期: 2026-08-16
- 适用范围: edge-page-ai 0.1.0（MVP）

本指南按“不需要 API key → 需要 API key”的顺序排列。先用 mock 模式完成全链路测试，
再切换到真实模型验证翻译质量。发现缺陷按 PM-04 新建 `docs/bugs/BUG-NNN.md`，
并在当日 `docs/worklogs/` 中登记。

## 0. 前置条件

- Windows 11，Node v18.17+（本项目在 v22.19.0 验证）。
- Edge 浏览器。
- 项目根目录为 `F:\AI_worker\Edge-page-ai`。

## 1. 自动化测试（1 分钟）

```powershell
cd F:\AI_worker\Edge-page-ai
npm test
```

预期：`pass 18 / fail 0`。该套件覆盖占位符保护、文本收集与回填、协议校验、
网关 v1 端点与静态资源分发。

## 2. 网关冒烟测试（1 分钟）

```powershell
npm start
```

终端会打印类似：

```text
[edge-page-ai] gateway v1 listening on http://127.0.0.1:8787
[edge-page-ai] provider: mock
[edge-page-ai] bookmarklet page: http://127.0.0.1:8787/v1/bookmarklet?token=<32位token>
```

验证（新开一个 PowerShell 窗口）：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/v1/health
```

预期返回：

```json
{"protocol":1,"ok":true,"status":"up","time":"..."}
```

token 两个来源：终端打印的 URL，或 `config.local.json` 的 `gateway.token`（该文件已被 git 忽略）。

## 3. 测试用示例页面

`tests/fixtures/sample-page.html` 包含了翻译必须保留的内容：
行内加粗/斜体、链接、邮箱、数字与单位、code/pre、输入框 value、可点击按钮、动态新增文本。

在项目根目录启动静态服务：

```powershell
python -m http.server 8000 --directory tests/fixtures
```

Edge 打开 `http://127.0.0.1:8000/sample-page.html`。

> 不要用 `file://` 打开：薄壳扩展只匹配 http/https，且 file 页面可能触发更严的本地文件限制。

## 4. 书签模式测试（mock，无需 API key）

1. 保持 `npm start` 运行。
2. Edge 打开 `http://127.0.0.1:8787/v1/bookmarklet?token=<token>`。
3. 按 `Ctrl+Shift+B` 显示书签栏。
4. 推荐方式 A：按住「DSH 整页翻译」链接拖到书签栏（不要用 `Ctrl+D` 收藏本页）。
   方式 B：点「复制书签代码」→ 在任意页面 `Ctrl+D` 新建收藏夹 → 右键该收藏夹 →
   「编辑」→ 把地址整体替换为刚复制的代码 → 保存。
5. 右键检查该收藏夹地址，**必须以 `javascript:` 开头**。若地址是
   `http://127.0.0.1:8787/v1/bookmarklet...`，说明收藏错了，按方式 B 修正。
6. 打开 `http://127.0.0.1:8000/sample-page.html`，点击该书签。
7. 右下角出现「DSH 页面助手」面板，状态为“就绪：mock-model（协议 v1）”。
8. 点击「整页翻译」。

预期（mock 模式）：

- 正文每个文本单元变成 `【译】<原文>`；
- 链接 `href`、邮箱、`42.5 USD` 原样保留；
- `code`、`pre`、输入框 value 未被翻译；
- 页面元素个数、布局不变（面板本身除外）；
- 点击「Click me」仍能变为 `clicked`。

> `【译】` 是 mock 模式的**演示标记**，表示翻译请求和回填链路已跑通，不是真实译文。
> 要看到中文译文，按第 6 节切换为真实模型。

再点击「还原原文」，整页回到英文。翻译完成后点书签再次注入会提示“panel already injected”。

### 已知预期失败

- 严格 CSP 页面会拦截注入（BUG-005）。
- 点击「Add dynamic text」新增的文本，当前 MVP 不会自动翻译（MutationObserver 增量翻译在 Phase 2）。

### 书签点击无反应时的排查

1. 新版书签代码：面板已存在（即使被 × 关闭而隐藏）时会直接重新显示；无需刷新页面（BUG-008）。
2. 修复后若网关未启动，点击书签会弹出“无法连接 DSH 网关”提示；无弹窗说明书签代码可能还是旧的，请重新复制。
3. 按 F12 打开 Console，点书签，查看红色报错并记录到缺陷文件。
4. 确认右键书签 →「编辑」中的地址以 `javascript:` 开头，且包含 `v1/bootstrap.js`。
5. 关闭按钮现在只是隐藏面板（不再从 DOM 移除），这是刻意的，用于支持同页再次打开。

## 5. Edge 薄壳扩展测试（mock）

1. Edge 打开 `edge://extensions`。
2. 打开左下角「开发人员模式」。
3. 点「加载解压缩的扩展」，选择 `F:\AI_worker\Edge-page-ai\src\edge-bridge`。
4. 首次安装会自动打开设置页；也可点扩展图标 →「扩展选项」。
5. 设置页填写：
   - 网关地址：`http://127.0.0.1:8787`
   - 网关 token：终端打印的 32 位 token
6. 点「测试连接」，预期显示“连接成功：edge-page-ai v0.1.0，模型 mock-model”。
7. 保存后**刷新**已打开的示例页面。
8. 页面加载后右下角自动出现面板；点击工具栏图标或按 `Alt+Shift+D` 可显示/隐藏。
   （快捷键若冲突，在 `edge://extensions/shortcuts` 重新分配。）

预期与书签模式一致。

## 6. 真实模型测试（需要 BYOK）

1. 停止网关：在 `npm start` 窗口按 `Ctrl+C`。
2. 编辑 `config.local.json`，例如：

```json
{
  "gateway": { "host": "127.0.0.1", "port": 8787, "token": "<保持现有token不变>" },
  "model": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "<你的key>",
    "model": "gpt-4o-mini",
    "timeoutMs": 30000,
    "jsonMode": false
  }
}
```

3. 重新 `npm start`，刷新测试页面，点击「整页翻译」。
4. 预期：正文变为中文，链接/邮箱/数字保留，页面结构不变。

### 真实模型排错

| 现象 | 检查 |
| --- | --- |
| 面板提示“模型未配置或不可用” | `apiKey` 为空、`baseUrl` 错误、网关未联网 |
| 面板提示“模型返回异常” | 模型不兼容 `response_format` 时把 `jsonMode` 设为 `false`；确认模型支持 JSON 输出能力 |
| 部分条目保留英文且状态栏显示失败数 | 模型漏项或占位符不匹配，触发安全回退，这是预期保护行为；可重试一次 |
| token 失效/书签不可用 | 重启网关后 token 已持久化到 `config.local.json`，书签中的旧 token 仅在文件被删改时才失效 |

## 7. “只变文字、不变格式”验收清单

翻译后打开 DevTools（F12），逐项检查：

- [ ] `document.body.children.length` 与翻译前一致（面板是 `document.documentElement` 的最后一个子元素，允许 +1）。
- [ ] 所有 `<a>` 的 `href` 不变，点击可跳转。
- [ ] 输入框 value、placeholder 不变。
- [ ] `<script>`、`<style>`、`<code>`、`<pre>` 内容不变。
- [ ] 按钮、折叠面板等交互仍正常。
- [ ] 翻译节点有 `data-dsh-tr="1"` 标记，重复点击「整页翻译」不会重复叠加 `【译】`。
- [ ] 点击「还原原文」后文本完全回到原文。
- [ ] 还原后再次点击「整页翻译」仍可生效（BUG-009）。

## 8. 测试记录要求

1. 每轮测试结果写入当日 `docs/worklogs/YYYY-MM-DD.md` 的“测试与验证”表。
2. 失败项按 PM-04 新建缺陷，修复后回填“验证记录”并关闭。
3. 涉及协议/行为变化的更新写入 `CHANGELOG.md`。
