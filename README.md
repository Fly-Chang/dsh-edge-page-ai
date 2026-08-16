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
# 1. 把模型密钥绑定到 DSH_* 环境变量（仅一次；重启终端后生效）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/set-dsh-model-env.ps1 -ApiKey "sk-你的DeepSeek密钥"

# 2. 检查环境变量（密钥只显示前4位/后4位）
npm run env:check

# 3. 启动本地网关（推荐：双击 scripts\start-gateway.bat；或命令行 npm start）
#    静默后台方式：双击 scripts\start-gateway-silent.vbs（日志在 logs\gateway.log）
#    停止：双击 scripts\stop-gateway.bat

# 4. 浏览器安装入口（二选一）
#    a) 书签模式：打开 http://127.0.0.1:8787/v1/bookmarklet ，按页面说明使用
#    b) 薄壳扩展：edge://extensions → 开发者模式 → 加载 src/edge-bridge
```

> 密钥不写入 `config.local.json`。环境变量名与覆盖规则见
> `src/gateway/config.js`；支持 `DSH_MODEL_API_KEY`、`DSH_MODEL_PROVIDER`、
> `DSH_MODEL_BASE_URL`、`DSH_MODEL_NAME`、`DSH_MODEL_TIMEOUT_MS`、
> `DSH_MODEL_JSON_MODE`、`DSH_MODEL_EXTRA_BODY`。

## 测试

```powershell
npm test
```

## 文档入口

- 项目章程：`docs/pm/project-charter.md`
- 协议规格：`docs/specs/gateway-protocol-v1.md`
- 架构说明：`docs/architecture.md`
- 测试指南：`docs/testing-guide.md`
- 后续路线：`docs/roadmap.md`
- 变更日志：`CHANGELOG.md`
