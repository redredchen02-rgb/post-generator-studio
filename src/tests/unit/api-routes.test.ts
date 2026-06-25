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

  it("returns aggregated bootstrap data", async () => {
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

  it("returns 500 when services fail", async () => {
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

  it("returns a list of generations", async () => {
    const fakeGenerations = [
      { id: "gen_1", title: "Test", status: "completed" },
    ] as Generation[];
    mockListGenerations.mockResolvedValue(fakeGenerations);

    const { GET } = await import("@/app/api/generations/route");
    const response = await GET(mockRequest({ method: "GET", url: "http://localhost/api/generations" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(fakeGenerations);
    expect(mockListGenerations).toHaveBeenCalledOnce();
  });

  it("respects limit query param", async () => {
    mockListGenerations.mockResolvedValue([] as Generation[]);
    const { GET } = await import("@/app/api/generations/route");
    await GET(mockRequest({ method: "GET", url: "http://localhost/api/generations?limit=5" }));
    expect(mockListGenerations).toHaveBeenCalledWith(5);
  });

  it("returns 400 for invalid query params", async () => {
    const { GET } = await import("@/app/api/generations/route");
    const response = await GET(mockRequest({ method: "GET", url: "http://localhost/api/generations?limit=-1" }));
    expect(response.status).toBe(400);
  });
});
