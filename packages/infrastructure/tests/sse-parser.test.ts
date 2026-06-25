import { describe, expect, it } from "vitest";
import { parseSSEStream } from "@postgen/sdk";

describe("SSE parser", () => {
  it("parses SSE events from a stream", async () => {
    const data = [
      'event: message\ndata: {"text":"hello"}',
      "",
      'data: {"text":"world"}',
      "",
    ].join("\n");

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(data));
        controller.close();
      },
    });

    const messages = [];
    for await (const msg of parseSSEStream(stream)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(2);
    expect(messages[0].data).toBe('{"text":"hello"}');
    expect(messages[0].event).toBe("message");
    expect(messages[1].data).toBe('{"text":"world"}');
    expect(messages[1].event).toBeUndefined();
  });

  it("handles empty stream", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    const messages = [];
    for await (const msg of parseSSEStream(stream)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(0);
  });

  it("handles null body", async () => {
    const response = new Response(null);
    const messages = [];
    for await (const msg of parseSSEStream(response.body!)) {
      messages.push(msg);
    }
    expect(messages).toHaveLength(0);
  });
});
