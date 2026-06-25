# Architecture

Post Generator Studio 是一个模块化单体（modular monolith）。部署简单，但层次边界清晰，可随时拆分。

## 整体架构

```txt
┌─────────────────────────────────────────────────┐
│                 Presentation                     │
│  React UI · Zustand · Tailwind CSS              │
├─────────────────────────────────────────────────┤
│                 Application                      │
│  用例编排 · 服务函数 · Pipeline 步骤             │
├──────────────────────┬──────────────────────────┤
│       Domain         │      Infrastructure      │
│  Schema · 接口(端口) │  SQLite · Provider 适配器 │
│  业务规则            │  加密 · 日志 · 配置       │
└──────────────────────┴──────────────────────────┘
```

**依赖方向：**
```txt
Presentation → Application → Domain ← Infrastructure
```

React 组件不直接调用 LLM 或 SQLite。API routes 验证输入、调用 application service、返回标准化响应。

## 分层详解

### Domain 层 (`src/domain/`)

纯类型和业务规则，零外部依赖。

```
schemas/
  enums.ts          OutputFormat, ProviderKind, GenerationStatus
  error.ts          AppError, AppErrorException
  provider.ts       ProviderProfile, capabilities, validation
  template.ts       PromptTemplate, preview request
  generation.ts     Generation, Preset, Request, Event
  index.ts          统一 re-export
ports/
  storage.ts        Repository 接口（ProviderProfile, Template, Preset, Generation）
  provider.ts       LLMProviderAdapter 接口
  pipeline.ts       PipelineStep 接口 + PipelineContext
  logger.ts         Logger 接口
```

### Application 层 (`src/application/`)

业务用例编排，依赖 Domain 端口，不感知具体存储或 Provider 实现。

| 模块 | 职责 |
|------|------|
| `generation/` | 流式生成主逻辑 + 取消注册 |
| `presets/` | 生成预设 CRUD |
| `prompts/` | 提示词模板 CRUD + 预览 |
| `providers/` | Provider Profile CRUD + 测试连接 |
| `export/` | Markdown/TXT 导出 |
| `content/` | 内容清洗（去 AI 自我指涉）+ 格式化 |
| `prompt/` | 模板渲染 + 变量解析 |

### Infrastructure 层 (`src/infrastructure/`)

实现 Domain 端口，处理外部交互。

```
providers/
  base-adapter.ts       BaseAdapter 抽象类（validate → fetch → parse → yield）
  openai-compatible.ts  OpenAI / OpenRouter / 兼容 API
  anthropic.ts          Anthropic Claude
  gemini.ts             Google Gemini
  ollama.ts             Ollama 本地模型
  registry.ts           Provider 注册中心
  streaming.ts          SSE / JSON Lines 解析工具
storage/
  schema.ts             Drizzle 表定义
  db.ts                 SQLite 连接（WAL 模式）
  provider-profile-repo.ts
  prompt-template-repo.ts
  generation-preset-repo.ts
  generation-repo.ts
  migrations.ts         数据库迁移
  seeds.ts              默认数据
security/
  secrets.ts            AES-256-GCM 加解密
config/
  paths.ts              数据目录路径配置
logging/
  logger.ts             日志（自动脱敏 API Key）
```

### Presentation 层 (`src/presentation/`)

React UI，通过 API 客户端与后端交互。

```
components/ui/          Button, Input, Textarea, NativeSelect
generation/
  generator-workspace.tsx    生成主界面
  use-generation-stream.ts   流式生成 hook
history/
  history-workspace.tsx      历史记录页
settings/
  settings-workspace.tsx     设置页（Tab 切换）
  provider-profiles-panel.tsx
  prompt-templates-panel.tsx
  generation-presets-panel.tsx
  storage-panel.tsx
lib/
  api.ts              API 客户端（fetchJson, loadBootstrap）
  use-api.ts          通用数据获取 hook
store/
  ui-store.ts         Zustand UI 状态（编辑器模式、字号）
```

### Pipeline (`src/plugins/pipeline/`)

四步流水线，通过 `enabledPipelineSteps` 配置启用：

| 步骤 | 职责 |
|------|------|
| `build-context` | 解析输入变量（TITLE, EVENT_SUMMARY, DATE, TIME, LOCALE） |
| `render-prompt` | 渲染模板变量，生成 systemPrompt + userPrompt |
| `clean-content` | 清洗 AI 自我指涉、重复标题、尾部空格 |
| `format-output` | 按输出格式（markdown/plain_text/html）格式化 |

## 数据流

```txt
用户输入 (title + eventSummary)
  ↓
POST /api/generations
  ↓
streamGeneration()
  ├─ buildContextStep    → 变量解析
  ├─ renderPromptStep   → 模板渲染
  ├─ [LLM API 调用]     → SSE 流式输出
  ├─ cleanContentStep   → 内容清洗
  ├─ formatOutputStep   → 格式化
  └─ 持久化到 SQLite
  ↓
SSE 事件流 → 前端实时渲染
```

## 安全设计

- **API Key 加密** — AES-256-GCM 加密存储在本地文件系统
- **密钥派生** — 使用 `POST_GENERATOR_SECRET_KEY` 环境变量
- **日志脱敏** — 自动检测并替换 `sk-*`、`Bearer`、`apiKey` 等模式
- **前端隔离** — 浏览器只接收 `keyMasked` 掩码标签

## 测试策略

```txt
tests/
  unit/                 纯函数 + 模拟依赖
    schemas.test.ts     Zod schema 验证
    content-cleaner     内容清洗逻辑
    prompt-renderer     模板渲染
    secrets.test.ts     加解密
    provider-*          Provider 适配器
    pipeline-registry   Pipeline 步骤
    *-service.test.ts   Application 服务
    api-routes*.test.ts API Route handlers
  integration/          完整生成流程（mock fetch）
  e2e/                  Playwright 端到端
```

共 99 个测试，覆盖所有 Application + Infrastructure 层。

## 扩展点

| 要扩展 | 改哪里 |
|--------|--------|
| 新 Provider | 继承 `BaseAdapter`，实现 `buildRequest()` + `parseChunk()` |
| 新 Pipeline 步骤 | 在 `pipeline/registry.ts` 添加步骤 |
| 新 API endpoint | 在 `src/app/api/` 添加 route handler |
| 新 UI 页面 | 在 `src/app/` 添加 page.tsx + presentation 组件 |
