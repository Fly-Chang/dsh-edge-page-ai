# 02 文件命名与存放规范

- 文档编号: PM-02
- 版本: 1.0.0
- 状态: 生效
- 生效日期: 2026-08-16

## 1. 适用范围

仓库内所有新增、移动、重命名的文件与目录。历史遗留文件在改动时同步整改。

## 2. 通用命名规则

1. 文件名与目录名一律使用 **kebab-case**（小写 ASCII，连字符分隔）。
   - 正确：`text-collector.js`、`edge-bridge/`
   - 错误：`TextCollector.js`、`edge_bridge/`、`edge bridge/`
2. 禁止使用空格、中文、特殊符号（`@ # % & * ( ) + = [ ]` 等）。
3. 禁止以数字开头（`BUG-NNN.md` 属于编码编号，例外）。
4. 命名要见名知义，长度 3–40 字符为宜。
5. 同一概念在文档、代码、协议中保持同一英文命名，避免混用同义词。

## 3. 按用途分类的命名规则

| 类型 | 规则 | 示例 |
| --- | --- | --- |
| 普通源文件 | `kebab-case.js/mjs/json/css/md` | `placeholder-protector.js` |
| 测试文件 | 与源文件同名 + `.test.js` 后缀 | `placeholder-protector.test.js` |
| 工作日志 | `YYYY-MM-DD.md`，存 `docs/worklogs/` | `2026-08-16.md` |
| 缺陷记录 | `BUG-NNN.md`（NNN 为三位递增编号），存 `docs/bugs/` | `BUG-001.md` |
| 需求/设计文档 | `docs/pm/`、`docs/specs/`，kebab-case | `protocol-v1.md` |
| 变更日志 | 仓库根目录唯一 `CHANGELOG.md` | `CHANGELOG.md` |
| 构建产物 | 一律进 `dist/`，由脚本生成，不手工编辑 | `dist/edge-bridge.zip` |
| 脚本 | `scripts/` 下 kebab-case，标明用途 | `start-gateway.mjs` |
| 配置文件 | 根目录或组件目录，kebab-case | `config.example.json` |
| 密钥/本地配置 | 名称含 `local` 或 `.local`，且必须被 `.gitignore` 忽略 | `config.local.json` |

## 4. 目录结构与职责

```text
edge-page-ai/
├── docs/                    # 全部项目文档
│   ├── pm/                  # 项目管理规范与模板（只读性约定）
│   ├── specs/               # 协议与接口规格
│   ├── worklogs/            # 工作日志（按日）
│   └── bugs/                # 缺陷记录
├── src/                     # 源代码（不存放文档与构建产物）
│   ├── core/                # 共享翻译核心（纯函数为主）
│   ├── gateway/             # 本地网关服务
│   ├── edge-bridge/         # Edge MV3 薄壳扩展
│   └── shared/              # 跨组件共享常量/工具
├── tests/                   # 测试代码，目录镜像 src/
├── scripts/                 # 开发/构建/启动脚本
├── dist/                    # 构建产物（不提交）
├── package.json
├── README.md
├── CHANGELOG.md
└── .gitignore
```

## 5. 时间与编号规则

1. 日期一律 **ISO 8601**：`YYYY-MM-DD`；带时间时使用 `YYYY-MM-DD HH:MM +08:00`。
2. 工作日志一个自然日一个文件；跨日工作必须拆分为两个文件。
3. 缺陷编号全局递增、永久唯一；缺陷关闭后编号不复用。
4. 协议版本采用 `v<major>`；破坏性变更必须升级主版本并写迁移说明。

## 6. 存放原则

1. 一个文件只承担一种职责；文档不混入 `src/`。
2. 与组件强相关的配置放在组件目录，跨组件配置放根目录。
3. 模板文件必须带 `template` 标识；复制使用后删除该标识内容（见各模板）。
4. 严禁把 `.log`、`node_modules/`、密钥文件提交进版本库。

## 7. 违规处理

1. 评审/合并时发现命名违规，退回修改，不进入主分支。
2. 密钥文件一旦误提交，视为安全事件，立即轮换密钥并清理历史。
