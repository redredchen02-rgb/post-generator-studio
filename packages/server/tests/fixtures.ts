import { vi } from "vitest";

export function mockFetchSSE(chunks: string[]) {
  const sseBody = chunks.join("\n\n") + "\n\n";
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(sseBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
  );
}

export function mockFetchError(status: number, message: string) {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: { message } }), { status }),
  );
}
