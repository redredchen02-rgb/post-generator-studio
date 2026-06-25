# Post Generator Studio

本地优先的 AI 内容生成引擎。输入主题和事件摘要，通过配置的 LLM Provider 流式生成文章。

## 快速开始

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm db:seed
pnpm dev
```

打开 http://localhost:3000。

## 功能

- **流式生成** — SSE 实时输出，支持取消
- **多 Provider** — OpenAI、Anthropic、Gemini、Ollama、OpenRouter、自定义兼容 API
- **Prompt 模板** — 版本化管理，支持 `{{TITLE}}`、`{{EVENT_SUMMARY}}`、`{{DATE}}`、`{{TIME}}`、`{{LOCALE}}` 变量
- **生成预设** — 组合 Provider + 模板 + 参数 + Pipeline 步骤
- **生成历史** — 查看、导出（Markdown / 纯文本）
- **API Key 加密** — AES-256-GCM 加密存储，前端只看到掩码

## 配置

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `POST_GENERATOR_HOME` | 数据根目录 | `~/.post-generator` |
| `POST_GENERATOR_SECRET_KEY` | 加密密钥（64 字符 hex） | 自动派生 |
| `POST_GENERATOR_DB_PATH` | 数据库路径 | `{HOME}/post-generator.db` |

### Provider 配置

在 Settings 页面配置 Provider Profile。Ollama 默认启用，云端 Provider 默认禁用，配置 API Key 后启用。

API Key 加密存储在 `~/.post-generator/secrets/`，浏览器只接收掩码标签。

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript 5 (strict) |
| UI | React 19 + Tailwind CSS + Radix UI |
| 状态 | Zustand |
| 数据库 | SQLite (better-sqlite3) |
| ORM | Drizzle ORM |
| 测试 | Vitest + Playwright |
| 包管理 | pnpm |

## 项目结构

```txt
src/
  app/                  Next.js 路由和 API handlers
    api/                REST API endpoints
  domain/               实体、Schema、端口（接口）
    schemas/            Zod schemas（按实体拆分）
    ports/              存储、Provider、Pipeline、Logger 接口
  application/          业务用例编排
    generation/         生成服务 + 取消注册
    presets/            预设 CRUD
    prompts/            模板 CRUD + 预览
    providers/          Provider CRUD + 测试连接
    export/             导出服务
    content/            内容清洗 + 格式化
    prompt/             模板渲染 + 变量解析
  infrastructure/       基础设施实现
    providers/          LLM Provider 适配器（BaseAdapter + 4 个实现）
    storage/            SQLite 存储（按 Repository 拆分）
    security/           AES-256-GCM 加解密
    logging/            日志（自动脱敏）
    config/             路径配置
  presentation/         React UI
    components/ui/      基础组件（Button、Input、Textarea、NativeSelect）
    generation/         生成工作区 + useGenerationStream hook
    history/            历史记录页
    settings/           设置页（按 Panel 拆分）
    lib/                API 客户端 + useApi hook
    store/              Zustand 状态
  plugins/pipeline/     Pipeline 步骤注册
  lib/                  共享工具（cn、createId、parseJson、SSE 解析）
  tests/                测试（unit / integration / e2e）
```

## 开发命令

```bash
pnpm dev              # 开发服务器
pnpm build            # 生产构建
pnpm start            # 生产服务器
pnpm lint             # ESLint 检查
pnpm typecheck        # TypeScript 类型检查
pnpm test             # 单元/集成测试（99 个）
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
pnpm test             # 99 个测试，覆盖所有 application + infrastructure 层
```

测试结构：
- `src/tests/unit/` — 单元测试（Schema、Provider、Pipeline、Service、API Routes）
- `src/tests/integration/` — 集成测试（生成服务完整流程）
- `src/tests/e2e/` — E2E 测试（Playwright）
- `src/tests/fixtures.ts` — 共享测试 fixture

## License

MIT
