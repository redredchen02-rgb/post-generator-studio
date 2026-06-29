export type SSEMessage = {
  event?: string;
  data: string;
};

function parseSSEChunk(chunk: string): SSEMessage | null {
  let event: string | undefined;
  let data: string | undefined;

  for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("event:")) {
      event = trimmed.slice(6).trim();
    } else if (trimmed.startsWith("data:")) {
      data = trimmed.slice(5).trim();
    }
  }

  return data !== undefined ? { event, data } : null;
}

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
        const message = parseSSEChunk(chunk);
        if (message) yield message;
      }
    }

    if (buffer.trim()) {
      const message = parseSSEChunk(buffer);
      if (message) yield message;
    }
  } finally {
    // cancel() releases the lock AND signals the source to free the underlying
    // network connection on early exit (the consumer stops reading after the
    // terminal [DONE]/final event). A bare releaseLock() would pin the socket.
    await reader.cancel().catch(() => {});
  }
}
