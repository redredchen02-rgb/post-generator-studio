export type SSEMessage = {
  event?: string;
  data: string;
};

export async function* parseSSEStream(body: ReadableStream<Uint8Array> | null): AsyncIterable<SSEMessage> {
  if (!body) {
    return;
  }
  const reader = body.getReader();
  try {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        const lines = chunk.split("\n").map((l) => l.trim());
        const eventLine = lines.find((l) => l.startsWith("event:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (dataLine) {
          yield {
            event: eventLine?.slice(6).trim(),
            data: dataLine.slice(5).trim(),
          };
        }
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split("\n").map((l) => l.trim());
      const eventLine = lines.find((l) => l.startsWith("event:"));
      const dataLine = lines.find((l) => l.startsWith("data:"));
      if (dataLine) {
        yield {
          event: eventLine?.slice(6).trim(),
          data: dataLine.slice(5).trim(),
        };
      }
    }
  } finally {
    // cancel() releases the lock AND signals the source to free the underlying
    // network connection on early exit (the consumer stops reading after the
    // terminal [DONE]/final event). A bare releaseLock() would pin the socket.
    await reader.cancel().catch(() => {});
  }
}
