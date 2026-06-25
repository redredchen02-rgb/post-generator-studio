import { describe, expect, it, vi, beforeEach } from "vitest";

function mockRequest({ method, url, body }: { method: string; url: string; body?: unknown }): Request {
  return new Request(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

// --- Provider Profiles ---

describe("Provider Profiles API", () => {
  beforeEach(() => vi.clearAllMocks());

  vi.mock("@/application/providers/provider-service", () => ({
    listProviderProfiles: vi.fn().mockResolvedValue([{ id: "p1", name: "Test Provider" }]),
    getProviderProfile: vi.fn().mockResolvedValue({ id: "p1", name: "Test Provider" }),
    createProviderProfile: vi.fn().mockImplementation((input) =>
      Promise.resolve({ id: "p_new", ...input }),
    ),
    updateProviderProfile: vi.fn().mockImplementation((_id, input) =>
      Promise.resolve({ id: "p1", name: "Updated", ...input }),
    ),
    deleteProviderProfile: vi.fn().mockResolvedValue(undefined),
    testProviderProfile: vi.fn().mockResolvedValue({ ok: true, message: "OK" }),
  }));

  vi.mock("@/app/api/parse-body", () => ({
    parseBody: vi.fn().mockImplementation((req) => req.json()),
  }));

  it("GET /api/provider-profiles returns list", async () => {
    const { GET } = await import("@/app/api/provider-profiles/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("POST /api/provider-profiles creates provider", async () => {
    const { POST } = await import("@/app/api/provider-profiles/route");
    const res = await POST(mockRequest({
      method: "POST",
      url: "http://localhost/api/provider-profiles",
      body: { name: "New", providerKind: "openai-compatible", model: "m" },
    }));
    expect(res.status).toBe(201);
  });

  it("GET /api/provider-profiles/[id] returns provider", async () => {
    const { GET } = await import("@/app/api/provider-profiles/[id]/route");
    const res = await GET(new Request("http://localhost"), routeContext("p1"));
    expect(res.status).toBe(200);
  });

  it("PATCH /api/provider-profiles/[id] updates provider", async () => {
    const { PATCH } = await import("@/app/api/provider-profiles/[id]/route");
    const res = await PATCH(
      mockRequest({ method: "PATCH", url: "http://localhost", body: { name: "Updated" } }),
      routeContext("p1"),
    );
    expect(res.status).toBe(200);
  });

  it("DELETE /api/provider-profiles/[id] deletes provider", async () => {
    const { DELETE } = await import("@/app/api/provider-profiles/[id]/route");
    const res = await DELETE(new Request("http://localhost"), routeContext("p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("POST /api/provider-profiles/[id]/test tests provider", async () => {
    const { POST } = await import("@/app/api/provider-profiles/[id]/test/route");
    const res = await POST(new Request("http://localhost"), routeContext("p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// --- Prompt Templates ---

describe("Prompt Templates API", () => {
  beforeEach(() => vi.clearAllMocks());

  vi.mock("@/application/prompt/prompt-service", () => ({
    listPromptTemplates: vi.fn().mockResolvedValue([{ id: "t1", name: "Test Template" }]),
    getPromptTemplate: vi.fn().mockResolvedValue({ id: "t1", name: "Test Template" }),
    createPromptTemplate: vi.fn().mockImplementation((input) =>
      Promise.resolve({ id: "t_new", ...input }),
    ),
    updatePromptTemplate: vi.fn().mockImplementation((_id, input) =>
      Promise.resolve({ id: "t1", name: "Updated", ...input }),
    ),
    deletePromptTemplate: vi.fn().mockResolvedValue(undefined),
    previewPrompt: vi.fn().mockResolvedValue({ systemPrompt: "sys", userPrompt: "usr" }),
  }));

  vi.mock("@/app/api/parse-body", () => ({
    parseBody: vi.fn().mockImplementation((req) => req.json()),
  }));

  it("GET /api/prompt-templates returns list", async () => {
    const { GET } = await import("@/app/api/prompt-templates/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("POST /api/prompt-templates creates template", async () => {
    const { POST } = await import("@/app/api/prompt-templates/route");
    const res = await POST(mockRequest({
      method: "POST",
      url: "http://localhost/api/prompt-templates",
      body: { name: "New", systemPrompt: "s", userPromptTemplate: "u" },
    }));
    expect(res.status).toBe(201);
  });

  it("GET /api/prompt-templates/[id] returns template", async () => {
    const { GET } = await import("@/app/api/prompt-templates/[id]/route");
    const res = await GET(new Request("http://localhost"), routeContext("t1"));
    expect(res.status).toBe(200);
  });

  it("PATCH /api/prompt-templates/[id] updates template", async () => {
    const { PATCH } = await import("@/app/api/prompt-templates/[id]/route");
    const res = await PATCH(
      mockRequest({ method: "PATCH", url: "http://localhost", body: { name: "Updated" } }),
      routeContext("t1"),
    );
    expect(res.status).toBe(200);
  });

  it("DELETE /api/prompt-templates/[id] deletes template", async () => {
    const { DELETE } = await import("@/app/api/prompt-templates/[id]/route");
    const res = await DELETE(new Request("http://localhost"), routeContext("t1"));
    expect(res.status).toBe(200);
  });

  it("POST /api/prompt-templates/preview previews prompt", async () => {
    const { POST } = await import("@/app/api/prompt-templates/preview/route");
    const res = await POST(mockRequest({
      method: "POST",
      url: "http://localhost/api/prompt-templates/preview",
      body: { systemPrompt: "s", userPromptTemplate: "u", title: "t", eventSummary: "e" },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.systemPrompt).toBe("sys");
  });
});

// --- Generation Presets ---

describe("Generation Presets API", () => {
  beforeEach(() => vi.clearAllMocks());

  vi.mock("@/application/presets/preset-service", () => ({
    listGenerationPresets: vi.fn().mockResolvedValue([{ id: "g1", name: "Test Preset" }]),
    getGenerationPreset: vi.fn().mockResolvedValue({ id: "g1", name: "Test Preset" }),
    createGenerationPreset: vi.fn().mockImplementation((input) =>
      Promise.resolve({ id: "g_new", ...input }),
    ),
    updateGenerationPreset: vi.fn().mockImplementation((_id, input) =>
      Promise.resolve({ id: "g1", name: "Updated", ...input }),
    ),
    deleteGenerationPreset: vi.fn().mockResolvedValue(undefined),
  }));

  vi.mock("@/app/api/parse-body", () => ({
    parseBody: vi.fn().mockImplementation((req) => req.json()),
  }));

  it("GET /api/generation-presets returns list", async () => {
    const { GET } = await import("@/app/api/generation-presets/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("POST /api/generation-presets creates preset", async () => {
    const { POST } = await import("@/app/api/generation-presets/route");
    const res = await POST(mockRequest({
      method: "POST",
      url: "http://localhost/api/generation-presets",
      body: { name: "New", providerProfileId: "p", promptTemplateId: "t", locale: "zh-CN" },
    }));
    expect(res.status).toBe(201);
  });

  it("GET /api/generation-presets/[id] returns preset", async () => {
    const { GET } = await import("@/app/api/generation-presets/[id]/route");
    const res = await GET(new Request("http://localhost"), routeContext("g1"));
    expect(res.status).toBe(200);
  });

  it("PATCH /api/generation-presets/[id] updates preset", async () => {
    const { PATCH } = await import("@/app/api/generation-presets/[id]/route");
    const res = await PATCH(
      mockRequest({ method: "PATCH", url: "http://localhost", body: { name: "Updated" } }),
      routeContext("g1"),
    );
    expect(res.status).toBe(200);
  });

  it("DELETE /api/generation-presets/[id] deletes preset", async () => {
    const { DELETE } = await import("@/app/api/generation-presets/[id]/route");
    const res = await DELETE(new Request("http://localhost"), routeContext("g1"));
    expect(res.status).toBe(200);
  });
});

// --- Generations ---

describe("Generations API", () => {
  beforeEach(() => vi.clearAllMocks());

  vi.mock("@/application/generation/generation-service", () => ({
    listGenerations: vi.fn().mockResolvedValue([]),
    getGeneration: vi.fn().mockResolvedValue({
      id: "gen_1",
      title: "Test",
      status: "completed",
      outputContent: "# Hello",
    }),
    cancelGeneration: vi.fn().mockResolvedValue({ cancelled: true }),
  }));

  it("GET /api/generations/[id] returns generation", async () => {
    const { GET } = await import("@/app/api/generations/[id]/route");
    const res = await GET(new Request("http://localhost"), routeContext("gen_1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("gen_1");
  });

  it("POST /api/generations/[id]/cancel cancels generation", async () => {
    const { POST } = await import("@/app/api/generations/[id]/cancel/route");
    const res = await POST(new Request("http://localhost"), routeContext("gen_1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cancelled).toBe(true);
  });
});
