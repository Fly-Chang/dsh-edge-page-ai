# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 约定，
版本号遵循 `MAJOR.MINOR.PATCH`（SemVer）。变更必须与 `docs/worklogs/` 和 `docs/bugs/` 对应。

## [Unreleased]

### Added

- 项目管理规范体系（PM-01 ~ PM-05）。
- 项目章程、文件命名与存放规范、工作日志/缺陷模板、开发流程。
- `gateway-protocol-v1` 协议规格与架构说明。
- 共享翻译核心：文本节点收集、块级分段、占位符保护、译文回填。
- 本地网关：健康检查、握手、翻译、书签分发端点（127.0.0.1 + token）。
- 书签模式（bookmarklet）最小可用版本。
- Edge MV3 薄壳扩展：悬浮按钮、整页翻译、面板与随呼入口。
- 单元测试：占位符保护、文本收集、回填与协议路由。
- 手动测试指南（`docs/testing-guide.md`）与示例页面（`tests/fixtures/sample-page.html`）。
- 模型请求 `extraBody` 透传，预置 DeepSeek V4 Flash 低思考模式配置（`reasoning_effort: "low"`）。
- `DSH_*` 模型环境变量绑定：设置/检查脚本（`scripts/set-dsh-model-env.ps1`、`scripts/check-dsh-model-env.ps1`），密钥不写入本地配置。
- 项目路线图（`docs/roadmap.md`）。
- 双击启动方式：前台 `start-gateway.bat`、静默后台 `start-gateway-silent.vbs`、停止 `stop-gateway.bat`、打开书签页 `open-bookmarklet.bat`。

### Fixed

- 测试脚本无法发现 `tests/` 目录（BUG-001）：改用 `node --test "tests/**/*.test.js"`。
- 占位符保护生成嵌套 token（BUG-002）：改为单次合并正则替换。
- `/v1/client.mjs` 与 `/core`、`/shared` 静态路由返回 404（BUG-003）：改用 `fs/promises`。
- `npm run build:edge-bridge` 找不到 `pwsh`（BUG-004）：改用 Windows PowerShell 5.1。
- 书签说明页代码缺少 `javascript:` 前缀、易被收藏成说明页地址（BUG-006）：补全前缀，增加复制按钮与纠错提示。
- 注入失败或面板关闭后 `__DSH_BOOTSTRAPPED__` 标志残留，再次点击书签无反应（BUG-007）：失败/关闭时清除标志、防重复判断改为“标志+面板存在”双重条件、增加可见错误提示。
- 面板关闭后同文档无法二次执行模块，再次点击书签不显示（BUG-008）：关闭改为隐藏、检测已有面板时直接显示、`client.mjs` 增加 `&r=Date.now()` 缓存破坏。
- 还原原文后 `data-dsh-tr` 标记未清除，再次翻译无效（BUG-009）：还原时清除相关父元素标记。
- 带 UTF-8 BOM 的 `config.local.json` 被误判为不存在并整文件覆盖（BUG-010）：解析前移除 BOM，损坏配置时拒绝覆盖并报错。
- 双击批处理脚本中文注释在 GBK 控制台被误解码导致执行失败（BUG-011）：启动/停止脚本改为纯 ASCII + CRLF。

### Known Issues

- 严格 CSP 页面会拦截书签/薄壳注入的外部脚本，面板不可用（BUG-005，计划 Phase 2 用隔离世界方案修复）。
