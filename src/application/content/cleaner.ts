const SELF_REFERENTIAL_PATTERNS = [
  /作为(?:一个|一名)?\s*AI(?:\s*模型|助手)?[^\n。]*[。.]?/gi,
  /我(?:是|作为)(?:一个|一名)?\s*AI[^\n。]*[。.]?/gi,
  /I am an AI[^\n.]*[.]?/gi,
  /As an AI(?: language model)?[^\n.]*[.]?/gi,
];

export function cleanGeneratedContent(content: string, title?: string): string {
  let cleaned = content.replace(/\r\n/g, "\n").trim();

  for (const pattern of SELF_REFERENTIAL_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  cleaned = cleaned
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  if (title) {
    const lines = cleaned.split("\n");
    const normalizedTitle = title.replace(/^#+\s*/, "").trim();
    let seenTitle = false;
    cleaned = lines
      .filter((line) => {
        const normalizedLine = line.replace(/^#+\s*/, "").trim();
        if (normalizedLine === normalizedTitle) {
          if (seenTitle) {
            return false;
          }
          seenTitle = true;
        }
        return true;
      })
      .join("\n");
  }

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

export function formatOutput(content: string, format: "markdown" | "plain_text" | "html"): string {
  if (format === "plain_text") {
    return content.replace(/^#{1,6}\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").trim();
  }
  if (format === "html") {
    return content
      .split(/\n{2,}/)
      .map((block) => {
        if (block.startsWith("# ")) {
          return `<h1>${escapeHtml(block.slice(2))}</h1>`;
        }
        if (block.startsWith("## ")) {
          return `<h2>${escapeHtml(block.slice(3))}</h2>`;
        }
        return `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`;
      })
      .join("\n");
  }
  return content;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

