import { expect, test } from "@playwright/test";

const bootstrap = {
  providerProfiles: [
    {
      id: "provider_fixture",
      name: "Fixture Provider",
      providerKind: "openai-compatible",
      baseUrl: "http://fixture.local",
      model: "fixture-model",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  promptTemplates: [
    {
      id: "template_fixture",
      name: "新闻写作",
      systemPrompt: "规则",
      userPromptTemplate: "{{TITLE}} {{EVENT_SUMMARY}}",
      supportedVariables: ["TITLE", "EVENT_SUMMARY", "DATE", "TIME", "LOCALE"],
      outputFormat: "markdown",
      version: 1,
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  generationPresets: [
    {
      id: "preset_fixture",
      name: "新闻写作",
      providerProfileId: "provider_fixture",
      promptTemplateId: "template_fixture",
      temperature: 0.7,
      maxTokens: 3000,
      locale: "zh-CN",
      outputFormat: "markdown",
      enabledPipelineSteps: ["build-context", "render-prompt", "generate-content", "clean-content", "format-output", "persist-generation"],
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  pipelineSteps: [],
};

test("user generates, copies, exports, and views history", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/bootstrap", async (route) => {
    await route.fulfill({ json: bootstrap });
  });
  // handleGenerate runs a provider pre-flight check before streaming.
  await page.route("**/api/provider-profiles/*/test", async (route) => {
    await route.fulfill({ json: { ok: true, message: "OK" } });
  });
  await page.route("**/api/generations**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: [
          'event: generation\ndata: {"type":"generation","generation":{"id":"generation_fixture","title":"台湾男子连续30天挑战AI创业","eventSummary":"- 连续30天开发AI产品","providerProfileSnapshot":{},"promptTemplateSnapshot":{},"generationPresetSnapshot":{},"renderedSystemPrompt":"","renderedUserPrompt":"","status":"streaming","createdAt":"2026-06-24T00:00:00.000Z"}}',
          "",
          'event: token\ndata: {"type":"token","value":"# 台湾男子连续30天挑战AI创业\\n\\n"}',
          "",
          'event: token\ndata: {"type":"token","value":"这是一篇实时生成的文章。"}',
          "",
          'event: final\ndata: {"type":"final","content":"# 台湾男子连续30天挑战AI创业\\n\\n这是一篇实时生成的文章。","generation":{"id":"generation_fixture","title":"台湾男子连续30天挑战AI创业","eventSummary":"- 连续30天开发AI产品","providerProfileSnapshot":{},"promptTemplateSnapshot":{},"generationPresetSnapshot":{},"renderedSystemPrompt":"","renderedUserPrompt":"","outputContent":"# 台湾男子连续30天挑战AI创业\\n\\n这是一篇实时生成的文章。","status":"completed","createdAt":"2026-06-24T00:00:00.000Z"}}',
          "",
        ].join("\n"),
      });
      return;
    }
    // GET /api/generations -> PaginatedGenerations, honouring the `search` param
    // so the history search box can be exercised end to end.
    const url = new URL(route.request().url());
    const search = url.searchParams.get("search") ?? "";
    const record = {
      id: "generation_fixture",
      title: "台湾男子连续30天挑战AI创业",
      eventSummary: "- 连续30天开发AI产品",
      providerProfileSnapshot: {},
      promptTemplateSnapshot: {},
      generationPresetSnapshot: {},
      renderedSystemPrompt: "",
      renderedUserPrompt: "",
      outputContent: "# 台湾男子连续30天挑战AI创业\n\n这是一篇实时生成的文章。",
      status: "completed",
      createdAt: "2026-06-24T00:00:00.000Z",
    };
    const matches = !search || record.title.includes(search);
    const items = matches ? [record] : [];
    await route.fulfill({ json: { items, total: items.length } });
  });
  await page.route("**/api/generations/generation_fixture/export?format=md", async (route) => {
    await route.fulfill({ body: "# 台湾男子连续30天挑战AI创业\n\n这是一篇实时生成的文章。" });
  });
  // Restore-from-History (Unit 12): single-generation GET + active draft. The
  // draft body is deliberately distinct from outputContent so the assertion
  // proves the editor loaded the working draft, not the frozen output.
  await page.route("**/api/generations/generation_fixture/drafts", async (route) => {
    await route.fulfill({ json: { drafts: [], activeDraftId: null, effectiveContent: "草稿续写内容" } });
  });
  await page.route("**/api/generations/generation_fixture", async (route) => {
    await route.fulfill({
      json: {
        id: "generation_fixture",
        title: "台湾男子连续30天挑战AI创业",
        eventSummary: "- 连续30天开发AI产品",
        providerProfileSnapshot: {},
        promptTemplateSnapshot: {},
        generationPresetSnapshot: { id: "preset_fixture" },
        renderedSystemPrompt: "",
        renderedUserPrompt: "",
        outputContent: "# 台湾男子连续30天挑战AI创业\n\n这是一篇实时生成的文章。",
        status: "completed",
        createdAt: "2026-06-24T00:00:00.000Z",
      },
    });
  });

  await page.goto("/");
  await page.getByLabel("Title").fill("台湾男子连续30天挑战AI创业");
  await page.getByLabel("Event Summary").fill("- 连续30天开发AI产品\n- 每天公开开发日志");
  await page.getByRole("button", { name: /Generate/ }).click();
  await expect(page.getByText("这是一篇实时生成的文章。")).toBeVisible();
  await page.getByRole("button", { name: /Copy Markdown/ }).click();
  await expect(page.getByText("Markdown copied")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: ".md" }).click();
  await downloadPromise;

  await page.getByRole("link", { name: /History/ }).click();
  await expect(page.getByRole("button", { name: /台湾男子连续30天挑战AI创业/ })).toBeVisible();
  await expect(page.getByText("这是一篇实时生成的文章。")).toBeVisible();

  // Search wiring: a matching query keeps the record, a non-matching one clears it
  // (and the stale selection must not linger in the detail pane).
  await page.getByPlaceholder("Search titles...").fill("不存在的标题xyz");
  await expect(page.getByRole("button", { name: /台湾男子连续30天挑战AI创业/ })).toHaveCount(0);
  await page.getByPlaceholder("Search titles...").fill("台湾");
  await expect(page.getByRole("button", { name: /台湾男子连续30天挑战AI创业/ })).toBeVisible();

  // Continue editing: restore the generation + active draft into the editor (Unit 12).
  await page.getByRole("link", { name: /Continue editing|继续编辑/ }).click();
  await expect(page).toHaveURL(/generationId=generation_fixture/);
  await expect(page.getByText("草稿续写内容")).toBeVisible();
});

// NOTE: mid-stream cancel is verified at the unit level
// (src/tests/unit/use-generation-stream.test.ts) and integration level
// (src/tests/integration/generation-cancel.test.ts). A mocked SSE route cannot
// reliably hold the stream open long enough to drive the Cancel button in E2E.
