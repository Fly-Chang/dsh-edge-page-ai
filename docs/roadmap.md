# 项目路线图

- 文档编号: PM-06
- 版本: 0.1.0
- 更新日期: 2026-08-16
- 维护人: 项目所有者

## 1. 当前状态（2026-08-17）

- MVP 已跑通：本地网关 + 书签模式 + Edge 薄壳扩展（已真机验证）。
- 测试：34/34 通过；另有 Edge headless/CDP 冒烟覆盖注入、关闭/重开、翻译/还原、扩展调出。
- 缺陷：BUG-001 ~ BUG-004、BUG-006 ~ BUG-016 已关闭；**BUG-005（严格 CSP 书签限制）in-progress**。
- 模型：支持 `DSH_*` 环境变量绑定 + `config.local.json` 降级；
  已预置 DeepSeek `deepseek-v4-flash` 低思考模式。
- 性能：逐批立即回填 + 翻译关闭思考 + 小批 30 条/并发 3（2026-08-16 已实施）。
- 启动：Phase 1 伴随浏览器启动器（DSH Edge 桌面快捷方式）已实施；Phase 2 Native Messaging 已实施（`npm run native:install`）。

## 2. 优先级总览

| 优先级 | 编号 | 事项 | 前置条件 |
| --- | --- | --- | --- |
| 现在 | R-01 | DeepSeek 真实模型真机翻译验证 | 用户提供/配置 API key |
| 现在 | R-02 | Edge 薄壳扩展真机验证 | R-01 通过后 |
| P0 | P2-01 | 严格 CSP 页面支持（BUG-005） | R-02 通过后 |
| P0 | P2-02 | 动态内容增量翻译（MutationObserver） | R-01 通过后 |
| P1 | P2-03 | 配置导出/导入与换机流程 | R-01 通过后 |
| P1 | P2-04 | DSH 插件封装适配层 | 需要 DSH 插件体系文档/示例 |
| P1 | P2-05 | 翻译缓存与站点白名单/黑名单 | R-01 通过后 |
| P2 | P3-01 | v0.1.0 发布基线（tag、发布说明、打包） | R-01、R-02 通过 |
| P2 | P3-02 | 自动化浏览器测试纳入 CI | P3-01 |
| 暂缓 | P3-03 | Edge 商店私有分发 / 更新服务器 | 小范围交流需求确认后 |

## 3. 近期任务（本周）

### R-01 DeepSeek 真实模型真机翻译验证

- 目标：`deepseek-v4-flash` + `reasoning_effort=low` 完成整页翻译，输出自然中文。
- 步骤：
  1. `scripts/set-dsh-model-env.ps1 -ApiKey "sk-..."` 绑定 `DSH_MODEL_API_KEY`；
  2. `npm run env:check` 确认；
  3. 重启终端后 `npm start`；
  4. 示例页执行翻译/还原/再翻译。
- 验收：正文为中文；链接、邮箱、数字、code/pre、输入框保持；无模型错误提示。

### R-02 Edge 薄壳扩展真机验证

- 目标：验证薄壳扩展作为日常入口可用。
- 步骤：`edge://extensions` 开发者模式加载 `src/edge-bridge`；
  填写网关地址与 token；验证自动注入、工具栏图标、`Alt+Shift+D` 显隐。
- 验收：刷新任意 http/https 页面面板自动出现；切换/关闭/重开正常；
  快捷键无冲突（冲突时在 `edge://extensions/shortcuts` 调整）。

## 4. Phase 2 任务清单

### P2-01 严格 CSP 页面支持（BUG-005）

- 状态：已实现隔离世界方案，待真机验证（2026-08-16）。
- 问题：书签与薄壳都通过向页面插入 `<script src="http://127.0.0.1">` 工作，
  被严格 CSP 站点拦截。
- 方案：薄壳扩展 content script 在隔离世界直接调用翻译核心操作 DOM（无需页面 script）；
  书签模式受浏览器硬边界限制，改为明确报错提示。
- 技术点：
  - 将 `src/core` 打平为无 import 的 IIFE 或使用 MV3 动态 import（`web_accessible_resources`）；
  - content script 通过 `host_permissions` 访问 `127.0.0.1`，绕开页面 CSP；
  - 保留书签模式作为零安装试用入口。
- 验收：带 `<meta http-equiv="Content-Security-Policy" content="script-src 'self'">`
  的测试页可用薄壳扩展翻译。

### P2-02 动态内容增量翻译

- 问题：翻译完成后新插入的文本（SPA 路由、无限滚动、按钮新增节点）不会被翻译。
- 方案：`MutationObserver` 监听 `document.body` 新增节点；只收集新增且未标记的文本单元；
  复用现有分批翻译与回填逻辑；避免重复观察自身写入。
- 技术点：观察器在回填期间暂停；节流 500ms；`data-dsh-tr` 标记保持幂等。
- 验收：示例页点击「Add dynamic text」后，新文本自动变为译文；
  反复翻译/还原不产生重复处理。

### P2-03 配置导出/导入与换机流程

- 内容：导出 `DSH_*` 模型配置（密钥可选择是否导出）+ 网关 token + 站点偏好；
  导入后一键重建书签链接。
- 验收：两台电脑上按导出文件操作，5 分钟内恢复全部功能。

### P2-04 DSH 插件封装适配层

- 内容：把 `src/gateway` 包装为 DSH 插件标准形态（清单/入口/启停/状态页）。
- 前置：需要 DSH 插件开发文档或参考插件；当前网关本身已保持独立可运行。

### P2-05 翻译缓存与站点偏好

- 内容：文本哈希 → 译文缓存（扩展 storage / 网关内存 + 本地文件）；
  站点黑名单（银行/邮箱默认不自动翻译）与白名单。
- 验收：同一文本二次翻译不重复调用模型；黑名单站点不出现自动注入。

## 5. Phase 3（小范围交流前）

- P3-01 v0.1.0 基线：`git tag v0.1.0`、发布说明、`dist/edge-bridge.zip` 校验。
- P3-02 CI：自动化单测 + headless Edge 冒烟（当前冒烟脚本为手工执行，需固化为
  `scripts/smoke-edge-headless.mjs`）。
- P3-03 分发：Edge 商店非公开版或组策略私有分发；确认小范围用户规模后再启动。

## 6. 已明确不做（当前版本）

- 图片 OCR 翻译；
- 云端多租户服务；
- `edge://*` 等浏览器保留页面支持。
