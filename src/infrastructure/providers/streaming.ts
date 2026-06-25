import type { GenerationEvent } from "@/domain/schemas";
import { parseSSEStream } from "@/lib/sse";

export async function* parseServerSentEvents(response: Response): AsyncIterable<string> {
  if (!response.body) {
    return;
  }
  for await (const msg of parseSSEStream(response.body)) {
    yield msg.data;
  }
}

export async function* parseJsonLines(response: Response): AsyncIterable<unknown> {
  if (!response.body) {
    return;
  }
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      yield JSON.parse(trimmed) as unknown;
    }
  }
  if (buffer.trim()) {
    yield JSON.parse(buffer.trim()) as unknown;
  }
}

export function responseError(message: string, retryable = false): GenerationEvent {
  return { type: "error", message, retryable };
}

export async function providerFailure(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `Provider request failed with ${response.status}`;
  }
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return parsed.error?.message || parsed.message || `Provider request failed with ${response.status}`;
  } catch {
    return `Provider request failed with ${response.status}`;
  }
}

