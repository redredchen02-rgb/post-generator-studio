import { describe, expect, it } from "vitest";
import { parseSSEStream } from "@/lib/sse";

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<{ event?: string; data: string }[]> {
  const messages: { event?: string; data: string }[] = [];
  for await (const msg of parseSSEStream(stream)) {
    messages.push(msg);
  }
  return messages;
}

describe("parseSSEStream", () => {
  it("parses a single data message", async () => {
    const messages = await collect(streamFromText("data: hello world\n\n"));
    expect(messages).toEqual([{ data: "hello world" }]);
  });

  it("parses multiple data messages", async () => {
    const messages = await collect(streamFromText("data: first\n\ndata: second\n\n"));
    expect(messages).toEqual([{ data: "first" }, { data: "second" }]);
  });

  it("parses event type with data", async () => {
    const messages = await collect(streamFromText("event: token\ndata: some content\n\n"));
    expect(messages).toEqual([{ event: "token", data: "some content" }]);
  });

  it("handles data split across multiple chunks", async () => {
    const messages = await collect(
      streamFromChunks(["data: hel", "lo world\n\n"]),
    );
    expect(messages).toEqual([{ data: "hello world" }]);
  });

  it("handles message split across chunk boundary", async () => {
    const messages = await collect(
      streamFromChunks(["data: first\n\nda", "ta: second\n\n"]),
    );
    expect(messages).toEqual([{ data: "first" }, { data: "second" }]);
  });

  it("handles empty stream", async () => {
    const messages = await collect(streamFromText(""));
    expect(messages).toEqual([]);
  });

  it("handlines data with trailing newline in chunk", async () => {
    const messages = await collect(streamFromText("data: value\n\n"));
    expect(messages).toEqual([{ data: "value" }]);
  });

  it("ignores lines without data: prefix", async () => {
    const messages = await collect(streamFromText(":comment\ndata: real\n\n"));
    expect(messages).toEqual([{ data: "real" }]);
  });

  it("parses data with leading whitespace", async () => {
    const messages = await collect(streamFromText("data:   spaced value\n\n"));
    expect(messages).toEqual([{ data: "spaced value" }]);
  });

  it("parses data from incomplete final chunk", async () => {
    const messages = await collect(streamFromText("data: final\n"));
    expect(messages).toEqual([{ data: "final" }]);
  });
});
