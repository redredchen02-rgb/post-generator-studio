import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET as healthGet } from "@/app/api/health/route";
import type { Generation } from "@/domain/schemas";

// Mock all service dependencies
const mockListGenerations = vi.fn();
const mockStreamGeneration = vi.fn();
const mockListProviderProfiles = vi.fn();
const mockListPromptTemplates = vi.fn();
const mockListGenerationPresets = vi.fn();
const mockListPipelineSteps = vi.fn();
const mockParseBody = vi.fn();

vi.mock("@/application/generation/generation-service", () => ({
  listGenerations: (...args: unknown[]) => mockListGenerations(...args),
  streamGeneration: (...args: unknown[]) => mockStreamGeneration(...args),
}));

vi.mock("@/application/presets/preset-service", () => ({
  listGenerationPresets: (...args: unknown[]) => mockListGenerationPresets(...args),
}));

vi.mock("@/application/prompts/prompt-service", () => ({
  listPromptTemplates: (...args: unknown[]) => mockListPromptTemplates(...args),
}));

vi.mock("@/application/providers/provider-service", () => ({
  listProviderProfiles: (...args: unknown[]) => mockListProviderProfiles(...args),
}));

vi.mock("@/plugins/pipeline/registry", () => ({
  listPipelineSteps: (...args: unknown[]) => mockListPipelineSteps(...args),
}));

vi.mock("@/app/api/parse-body", () => ({
  parseBody: (...args: unknown[]) => mockParseBody(...args),
}));

function mockRequest({ method, url, body }: { method: string; url: string; body?: unknown }): Request {
  return new Request(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("GET /api/health", () => {
  it("returns { ok: true }", async () => {
    const response = await healthGet();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

describe("GET /api/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns aggregated bootstrap data", { timeout: 10_000 }, async () => {
    mockListProviderProfiles.mockResolvedValue([{ id: "p1", name: "Provider 1" }]);
    mockListPromptTemplates.mockResolvedValue([{ id: "t1", name: "Template 1" }]);
    mockListGenerationPresets.mockResolvedValue([{ id: "g1", name: "Preset 1", providerProfileId: "p1", promptTemplateId: "t1" }]);
    mockListPipelineSteps.mockReturnValue([{ id: "build-context", name: "Build Context" }]);

    const { GET: bootstrapGet } = await import("@/app/api/bootstrap/route");
    const response = await bootstrapGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerProfiles).toHaveLength(1);
    expect(body.promptTemplates).toHaveLength(1);
    expect(body.generationPresets).toHaveLength(1);
    expect(body.pipelineSteps).toEqual([{ id: "build-context", name: "Build Context" }]);
  });

  it("returns 500 when services fail", { timeout: 10_000 }, async () => {
    mockListProviderProfiles.mockRejectedValue(new Error("DB connection failed"));

    const { GET: bootstrapGet } = await import("@/app/api/bootstrap/route");
    const response = await bootstrapGet();
    expect(response.status).toBe(500);
  });
});

describe("GET /api/generations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a paginated list of generations", async () => {
    const fakeResult = { items: [{ id: "gen_1", title: "Test", status: "completed" }] as Generation[], total: 1 };
    mockListGenerations.mockResolvedValue(fakeResult);

    const { GET } = await import("@/app/api/generations/route");
    const response = await GET(mockRequest({ method: "GET", url: "http://localhost/api/generations" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(fakeResult);
    expect(mockListGenerations).toHaveBeenCalledOnce();
  });

  it("respects limit, offset, and search query params", async () => {
    mockListGenerations.mockResolvedValue({ items: [], total: 0 });
    const { GET } = await import("@/app/api/generations/route");
    await GET(mockRequest({ method: "GET", url: "http://localhost/api/generations?limit=5&offset=10&search=hello" }));
    expect(mockListGenerations).toHaveBeenCalledWith({ limit: 5, offset: 10, search: "hello" });
  });

  it("returns 400 for invalid query params", async () => {
    const { GET } = await import("@/app/api/generations/route");
    const response = await GET(mockRequest({ method: "GET", url: "http://localhost/api/generations?limit=-1" }));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/generations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a structured 400 (not a bare 500) when the body is malformed JSON", async () => {
    // Regression: parseBody threw outside any try/catch, so a malformed body
    // escaped the handler as a 500 instead of the structured 400 INVALID_BODY.
    const { AppErrorException } = await import("@/domain/schemas");
    mockParseBody.mockRejectedValue(
      new AppErrorException({ code: "INVALID_BODY", message: "请求体不是有效的 JSON" }),
    );

    const { POST } = await import("@/app/api/generations/route");
    const response = await POST(mockRequest({ method: "POST", url: "http://localhost/api/generations", body: {} }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_BODY");
    expect(mockStreamGeneration).not.toHaveBeenCalled();
  });
});
