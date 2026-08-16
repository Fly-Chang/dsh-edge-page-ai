# edge-page-ai

Edge 页面 AI 翻译与随呼助手（工作代号）。主体为 DSH 插件（本地网关 + 翻译核心），
浏览器侧仅保留薄壳扩展或书签，实现在 Edge 页面随时调出 DSH/已配置模型，并对英文页面
执行“只替换文字、尽量保持版式”的整页翻译。

## 设计原则

- 浏览器侧不保存模型密钥、不包含业务智能。
- 浏览器侧只依赖冻结的本地协议 `gateway-protocol-v1`。
- DSH 未运行时提示明确；模型走 BYOK（OpenAI 兼容端点）。

## 目录结构

```text
docs/pm/          项目管理规范（章程、命名、日志/缺陷模板、流程）
docs/specs/       协议与接口规格
docs/worklogs/    工作日志（按日）
docs/bugs/        缺陷记录（BUG-NNN.md）
src/core/         共享翻译核心
src/gateway/      本地网关与书签模式入口
src/edge-bridge/  Edge MV3 薄壳扩展
tests/            测试
scripts/          启动/构建脚本
```

命名、存放、日志与缺陷管理规则见 `docs/pm/file-conventions.md`。

## 快速开始

```powershell
# 1. 复制配置并填写模型端点与密钥
Copy-Item config.example.json config.local.json

# 2. 启动本地网关
npm start

# 3. 浏览器安装入口（二选一）
#    a) 书签模式：打开 http://127.0.0.1:8787/v1/bookmarklet ，按页面说明使用
#    b) 薄壳扩展：edge://extensions → 开发者模式 → 加载 src/edge-bridge
```

## 测试

```powershell
npm test
```

## 文档入口

- 项目章程：`docs/pm/project-charter.md`
- 协议规格：`docs/specs/gateway-protocol-v1.md`
- 架构说明：`docs/architecture.md`
- 变更日志：`CHANGELOG.md`
