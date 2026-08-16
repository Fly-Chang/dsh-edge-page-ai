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

### Fixed

- 测试脚本无法发现 `tests/` 目录（BUG-001）：改用 `node --test "tests/**/*.test.js"`。
- 占位符保护生成嵌套 token（BUG-002）：改为单次合并正则替换。
- `/v1/client.mjs` 与 `/core`、`/shared` 静态路由返回 404（BUG-003）：改用 `fs/promises`。
- `npm run build:edge-bridge` 找不到 `pwsh`（BUG-004）：改用 Windows PowerShell 5.1。

### Known Issues

- 严格 CSP 页面会拦截书签/薄壳注入的外部脚本，面板不可用（BUG-005，计划 Phase 2 用隔离世界方案修复）。
