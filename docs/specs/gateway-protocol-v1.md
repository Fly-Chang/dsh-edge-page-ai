# gateway-protocol-v1

- 文档编号: SPEC-001
- 协议名称: `gateway-protocol-v1`
- 版本: v1
- 状态: Frozen（冻结；破坏性变更必须升级为 v2 并提供迁移说明）
- 生效日期: 2026-08-16
- 传输: HTTP/1.1 over loopback（默认 `127.0.0.1:8787`）

## 1. 设计目标

浏览器侧（书签 / 薄壳扩展）只依赖本协议与 DSH 本地网关通信。DSH 内部实现可任意演进，
只要保持本协议兼容即可。

## 2. 鉴权

- 所有业务端点（除 `GET /v1/health`）必须携带请求头：
  `X-DSH-Token: <token>`。
- token 由网关生成/读取自本地配置，随机 32 字节 hex，仅监听 loopback。
- 鉴权失败统一返回：

```json
HTTP 401
{ "protocol": 1, "ok": false, "error": { "code": "UNAUTHORIZED", "message": "invalid or missing token" } }
```

## 3. 通用约定

- 请求与响应体均为 `application/json; charset=utf-8`。
- 业务成功响应必须包含 `"ok": true`；业务失败返回 4xx/5xx 并带 `"ok": false`。
- 所有时间使用 ISO 8601。
- 端点前缀：`/v1/`。

## 4. 端点

### 4.1 健康检查

`GET /v1/health`（免鉴权）

响应 `200`：

```json
{ "protocol": 1, "ok": true, "status": "up", "time": "2026-08-16T20:00:00+08:00" }
```

### 4.2 握手

`GET /v1/handshake`

响应 `200`：

```json
{
  "protocol": 1,
  "ok": true,
  "name": "edge-page-ai",
  "version": "0.1.0",
  "model": { "id": "gpt-4o-mini", "endpoint": "https://api.openai.com/v1" },
  "capabilities": { "translate": true, "chat": true, "bookmarklet": true },
  "minClientProtocol": 1,
  "maxClientProtocol": 1
}
```

浏览器侧在每次会话开始时握手；`minClientProtocol > 1` 时提示“请升级浏览器侧入口”。

### 4.3 整页翻译

`POST /v1/translate`

请求：

```json
{
  "protocol": 1,
  "sourceLang": "en",
  "targetLang": "zh-CN",
  "items": [
    {
      "id": "b1",
      "text": "This is a whole sentence.",
      "contextBefore": "Previous sentence.",
      "contextAfter": "Next sentence."
    }
  ]
}
```

约束：

- `items` 数量 1–200；
- 单个 `text` 长度 1–5000 字符（超限由浏览器侧先分段）；
- `id` 必须唯一且为 1–64 字符字符串；
- `contextBefore` / `contextAfter` 为可选字段，仅用于帮助模型理解上下文，**不作为翻译对象**，模型返回时不得出现。

响应 `200`：

```json
{
  "protocol": 1,
  "ok": true,
  "items": [
    { "id": "b1", "text": "这是一个完整的句子。" }
  ]
}
```

失败示例：

```json
HTTP 422
{ "protocol": 1, "ok": false, "error": { "code": "VALIDATION_FAILED", "message": "..." } }
```

### 4.4 随呼对话

`POST /v1/chat`

请求：

```json
{
  "protocol": 1,
  "messages": [
    { "role": "system", "content": "你是随呼助手。" },
    { "role": "user", "content": "总结当前页面要点" }
  ],
  "context": { "url": "https://example.com", "title": "Example" }
}
```

响应 `200`：

```json
{ "protocol": 1, "ok": true, "text": "..." }
```

### 4.5 书签模式分发

`GET /v1/bookmarklet`（鉴权，允许 `?token=` 查询参数）

- 无 `Accept` 协商时返回面向用户的说明页（HTML），展示可拖拽的书签链接与使用说明。
- 书签链接指向 `http://127.0.0.1:8787/v1/bootstrap.js?token=<token>`，
  点击书签会注入该脚本到当前页面。
- 响应头禁止缓存：`Cache-Control: no-store`。

`GET /v1/bootstrap.js`（鉴权，允许 `?token=` 查询参数）

- 返回经典脚本，在页面中追加 `<script type="module" src="/v1/client.mjs?token=...">`。
- `Cache-Control: no-store`。

`GET /v1/client.mjs` 及 `/core/*.js`、`/shared/*.js`（免鉴权，开放 CORS）

- 页面内 ES 模块与纯前端依赖，不含密钥；供浏览器模块导入使用。
- 路径映射：`/core/x.js → src/core/x.js`，`/shared/x.js → src/shared/x.js`，
  `/v1/client.mjs → src/gateway/client/injected-page.mjs`。
- 只允许 `[a-z0-9-]+.js` 文件名，拒绝路径穿越。

## 5. 错误码

| code | HTTP | 含义 |
| --- | --- | --- |
| `UNAUTHORIZED` | 401 | token 缺失/无效 |
| `VALIDATION_FAILED` | 422 | 请求体不合法 |
| `MODEL_UNAVAILABLE` | 502 | 模型端点不可用/未配置 |
| `MODEL_ERROR` | 502 | 模型返回异常（超限/超时/格式错误） |
| `RATE_LIMITED` | 429 | 请求过频 |
| `NOT_FOUND` | 404 | 端点/资源不存在 |
| `INTERNAL_ERROR` | 500 | 网关内部错误 |

## 6. CORS 策略（书签模式需要）

- 网关对所有 `/v1/` 响应统一返回：
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Headers: Content-Type, X-DSH-Token`
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS`
  - `Access-Control-Max-Age: 600`
- 预检 `OPTIONS` 返回 `204`，不执行业务逻辑。
- CORS 只解决浏览器跨域读取；业务端点仍必须通过 token 鉴权。
- 静态模块（`/v1/client.mjs`、`/core/*.js`、`/shared/*.js`）不含密钥，免鉴权开放。
- 已知风险与规避见 `docs/bugs/BUG-005.md`。

## 7. 版本兼容规则

1. 网关必须始终实现 `v1`，直到发布 `v2` 后的两个大版本发布周期为止。
2. 破坏性变更 = 删除/改名端点、修改字段语义、修改鉴权方式。
3. 新增可选字段不属于破坏性变更。
