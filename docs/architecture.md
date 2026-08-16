# 架构说明

- 文档编号: SPEC-002
- 版本: 1.0.0
- 生效日期: 2026-08-16

## 1. 总览

```text
Edge 页面
   ├── 书签模式：bookmarklet 注入 src/gateway/client/injected-page.mjs（来自网关）
   └── 薄壳模式：src/edge-bridge/content.js 注入同一套翻译核心

        │  HTTP (127.0.0.1:8787, X-DSH-Token)
        ▼
本地网关 src/gateway/server.js
   ├── 路由 /v1/*（协议见 docs/specs/gateway-protocol-v1.md）
   ├── 鉴权（随机 token）
   ├── 模型适配器（OpenAI 兼容 BYOK）
   └── 书签说明页 + bootstrap.js 分发

        │  HTTPS (BYOK)
        ▼
用户配置的模型端点（OpenAI 兼容 API）
```

## 2. 组件职责

| 组件 | 路径 | 职责 |
| --- | --- | --- |
| 翻译核心 | `src/core/` | 页面内 DOM 文本收集、分段、占位符保护、译文回填；纯函数，可测试 |
| 本地网关 | `src/gateway/` | 协议路由、鉴权、CORS、模型调用、书签分发 |
| 书签注入脚本 | `src/gateway/client/injected-page.mjs` | 页面内 UI、调用翻译核心、访问网关 |
| Edge 薄壳扩展 | `src/edge-bridge/` | 注入悬浮按钮，转发到网关；不含模型密钥与翻译逻辑 |
| 共享常量 | `src/shared/protocol.js` | 协议常量与请求构造，供测试/脚本复用 |

## 3. 整页翻译流水线（页面内）

```text
1. TreeWalker 遍历 body 文本节点
2. 跳过 script/style/code/pre/textarea/已翻译节点/空文本
3. 以块级元素为边界聚合文本（blockId 保持映射）
4. 占位符保护：链接、数字、邮箱、单位等替换为 {0} {1} ...
5. 组装 /v1/translate 请求（分批，每批 ≤ 200 项）
6. 网关返回译文 → 校验 id 与占位符
7. 还原占位符 → 仅写入 textNode.nodeValue，不改变元素结构
8. MutationObserver 增量翻译新增节点（MVP 预留，阶段 2 启用）
```

## 4. 关键不变式

1. **不重写 innerHTML**，只替换文本节点值；不增删元素。
2. 回填前校验：译文数量、id 一一对应、占位符集合一致；失败保留原文。
3. 同一节点只翻译一次，以 `data-dsh-tr` 标记。
4. 网关请求失败时页面提示明确错误，不吞异常。

## 5. 部署形态

- 本机：`npm start`，浏览器侧连接 `127.0.0.1:8787`。
- 换机：重装 DSH 插件 + 导入 `config.local.json` + 重新加载薄壳扩展（书签模式只需重新拖拽书签）。
- DSH 更新：协议冻结，网关随 DSH 发布但独立版本号；不兼容时握手阶段明确提示。
