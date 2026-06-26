# Post Generator Studio

本地优先的 AI 内容生成引擎。输入主题和事件摘要，通过配置的 LLM Provider 流式生成文章。

## 快速开始

### 环境要求

- Node.js >= 22
- pnpm >= 10

### 安装

```bash
# 克隆仓库
git clone https://github.com/redredchen02-rgb/post-generator-studio.git
cd post-generator-studio

# 安装依赖
pnpm install

# 配置环境变量（可选，使用默认值即可）
cp .env.example .env.local

# 初始化数据库
pnpm db:migrate

# 填充默认数据（Provider 模板、Prompt 模板、预设）
pnpm db:seed

# 启动开发服务器
pnpm dev
```

打开 http://localhost:3000。

### 首次使用

1. 进入 **Settings** 页面
2. 配置一个 Provider Profile（Ollama 本地已预配置）
3. 如果使用云端 Provider（OpenAI / Anthropic / Gemini），填入 API Key
4. 回到 **Generate** 页面，输入标题和事件摘要，点击 Generate

## 功能

- **流式生成** — SSE 实时输出，支持取消，Token 批量渲染优化
- **多 Provider** — OpenAI、Anthropic、Gemini、Ollama、OpenRouter、自定义兼容 API
- **Prompt 模板** — 版本化管理，支持 `{{TITLE}}`、`{{EVENT_SUMMARY}}`、`{{DATE}}`、`{{TIME}}`、`{{LOCALE}}` 变量 + 自定义变量
- **生成预设** — 组合 Provider + 模板 + 参数 + Pipeline 步骤
- **大纲生成** — 先生成可编辑大纲，确认后再展开全文
- **CodeMirror 编辑器** — 内置 Markdown 编辑器，支持选择改写 / 扩写 / 精简 / 调整语气
- **生成草稿** — 自动保存工作草稿，支持版本快照
- **质量评分** — LLM-as-Judge 五维评分（相关性 / 连贯性 / 事实性 / 风格 / 完整性）
- **生成历史** — 查看、导出（Markdown / 纯文本）
- **API Key 加密** — AES-256-GCM 加密存储，前端只看到掩码
- **多语言界面** — 支持英文 / 简体中文切换；`NEXT_LOCALE` cookie 持久化，深色模式下无首屏闪烁
- **实时文本指标** — 输出面板实时显示字数、预估阅读时间，以及英文内容的 ARI（Automated Readability Index）可读性评分

## 配置

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `POST_GENERATOR_HOME` | 数据根目录 | `~/.post-generator` |
| `POST_GENERATOR_SECRET_KEY` | 加密密钥（64 字符 hex） | 自动派生 |
| `POST_GENERATOR_DB_PATH` | 数据库路径 | `{HOME}/post-generator.db` |
| `POST_GENERATOR_PROVIDER_TIMEOUT_MS` | Provider 请求超时（毫秒） | `120000` |
| `POST_GENERATOR_COMPLETION_TIMEOUT_MS` | 一次性补全超时（毫秒） | `60000` |
| `NEXT_PUBLIC_APP_URL` | 应用 URL（用于 OpenRouter Referer） | `http://localhost:3000` |

### Provider 配置

在 Settings 页面配置 Provider Profile。Ollama 默认启用，云端 Provider 默认禁用，配置 API Key 后启用。

API Key 加密存储在 `~/.post-generator/secrets/`，浏览器只接收掩码标签。

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript 5 (strict) |
| UI | React 19 + Tailwind CSS + Radix UI + CodeMirror 6 |
| 状态 | Zustand (with persist) |
| 数据库 | SQLite (better-sqlite3) + WAL 模式 |
| ORM | Drizzle ORM |
| 国际化 | next-intl (EN / zh-CN) |
| 安全 | AES-256-GCM 加密 + 安全响应头 + 日志脱敏 |
| 测试 | Vitest (unit + integration) + Playwright (e2e) |
| 包管理 | pnpm |

## 项目结构

```txt
messages/               i18n 消息文件（en.json、zh-CN.json）
src/
  app/                  Next.js 路由和 API handlers
    api/                REST API endpoints（含 /score 质量评分）
  domain/               实体、Schema、端口（接口）
    schemas/            Zod schemas（按实体拆分，含 quality）
    ports/              存储、Provider、Pipeline、Logger 接口
    constants.ts        共享常量（默认温度、最大 Token 数）
  application/          业务用例编排
    generation/         生成服务 + 取消注册
    presets/            预设 CRUD
    prompt/             模板 CRUD + 预览 + 渲染 + 变量解析 + 控制项
    providers/          Provider CRUD + 测试连接
    export/             导出服务
    content/            内容清洗 + 格式化 + 非流式补全 + 草稿文档服务
    quality/            LLM-as-Judge 质量评分服务
  i18n/                 next-intl 请求配置（locale 解析）
  infrastructure/       基础设施实现
    providers/          LLM Provider 适配器（BaseAdapter + 4 个实现）
    storage/            SQLite 存储（按 Repository 拆分，含 DraftRepo）
    security/           AES-256-GCM 加解密
    logging/            日志（自动脱敏）
    config/             路径配置
  presentation/         React UI
    components/         通用组件（LanguageSwitcher 语言切换）
    components/ui/      基础组件（Button、Input、Textarea、NativeSelect）
    generation/         生成工作区 + useGenerationStream hook
    generation/editor/  CodeMirror 编辑器 + 选择工具栏 + 改写动作
    history/            历史记录页
    settings/           设置页（按 Panel 拆分）
    lib/                API 客户端 + useApi hook + Prompt 预览
    store/              Zustand 状态（含 locale 字段）
  plugins/pipeline/     Pipeline 步骤注册
  lib/                  共享工具（cn、createId、parseJson、SSE 解析、text-metrics 文字指标）
  tests/                测试（unit / integration / e2e）
```

## 开发命令

```bash
pnpm dev              # 开发服务器
pnpm build            # 生产构建
pnpm start            # 生产服务器
pnpm lint             # ESLint 检查
pnpm typecheck        # TypeScript 类型检查
pnpm test             # 单元/集成测试（279 个）
pnpm test:e2e         # E2E 测试
pnpm db:generate      # 生成 Drizzle migration
pnpm db:migrate       # 执行数据库迁移
pnpm db:seed          # 初始化默认数据
pnpm db:status        # 查看数据库状态
```

## 添加新 Provider

1. 在 `src/infrastructure/providers/` 创建适配器，继承 `BaseAdapter`
2. 实现 `buildRequest()` 和 `parseChunk()`
3. 在 `src/infrastructure/providers/registry.ts` 注册
4. 在 `src/domain/schemas/enums.ts` 的 `providerKindSchema` 添加枚举值
5. 添加测试

```typescript
// 示例：最小适配器
export class MyAdapter extends BaseAdapter {
  readonly id = "my-provider";

  protected async buildRequest(request, config, options) {
    return {
      url: `${config.baseUrl}/v1/chat`,
      init: { method: "POST", headers: { ... }, body: JSON.stringify({ ... }) },
    };
  }

  protected parseChunk(raw, request) {
    const chunk = raw as { text?: string };
    return { events: chunk.text ? [{ type: "token", value: chunk.text }] : [] };
  }
}
```

## 测试

```bash
pnpm test             # 279 个测试，覆盖所有 application + infrastructure 层
```

测试结构：
- `src/tests/unit/` — 单元测试（Schema、Provider、Pipeline、Service、API Routes、Quality、Editor）
- `src/tests/integration/` — 集成测试（生成服务完整流程、草稿、质量评分）
- `src/tests/e2e/` — E2E 测试（Playwright）
- `src/tests/fixtures.ts` — 共享测试 fixture

## 文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 分层架构、数据流、安全设计、测试策略

## License

MIT
