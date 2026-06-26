// HTTP header values are latin1-only, so a non-ASCII filename (e.g. Chinese) throws
// a ByteString error when set directly. RFC 6266: provide an ASCII fallback in
// `filename=` plus the real UTF-8 name in `filename*=`.
export function contentDisposition(filename: string, disposition: "attachment" | "inline" = "attachment"): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "download";
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
