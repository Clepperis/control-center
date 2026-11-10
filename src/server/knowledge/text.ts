import { createHash } from "node:crypto";
import { DomainError } from "../orchestration/store";

export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export function validateText(text: string) {
  if (
    Buffer.byteLength(text, "utf8") > 24000 ||
    text.includes("\0") ||
    text.includes("\uFFFD")
  )
    throw new DomainError(400, "import_limit");
}
export function rejectSecrets(text: string) {
  if (
    /-----BEGIN .*PRIVATE KEY|\b(?:sk|pcp_board)_[a-z\d_-]{12,}|\bsk-[a-z\d_-]{12,}|\b(?:api[_ -]?key|password|slaptažodis|token|secret)\s*[:=]\s*\S{6,}|\bBearer\s+[a-z\d._-]{10,}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i.test(
      text,
    )
  )
    throw new DomainError(400, "secret_content");
}
// Unicode normalization is shared by index and query. A deliberately small LT
// suffix fallback improves common inflections; it is not a Lithuanian stemmer.
export function lexemes(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}_-]+/gu) ?? []
  );
}
const stop = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "what",
  "which",
  "how",
  "for",
  "of",
  "in",
  "to",
  "and",
  "or",
  "do",
  "does",
  "we",
  "our",
  "koks",
  "kokia",
  "kokie",
  "kaip",
  "kas",
  "yra",
  "ar",
  "ir",
  "su",
  "i",
  "del",
  "apie",
  "kur",
  "kada",
]);
export function searchTerms(text: string) {
  return [...new Set(lexemes(text).filter((t) => t.length > 1 && !stop.has(t)))]
    .slice(0, 12)
    .map((t) => {
      const stem =
        t.length > 5
          ? t.replace(
              /(?:uose|omis|ams|ais|iai|iu|us|as|is|os|es|ai|a|e|u)$/,
              "",
            )
          : t;
      return `'${stem}':*`;
    });
}
export function searchQuery(text: string) {
  return searchTerms(text).join(" & ");
}
// Short queries must match every term. Longer natural questions may omit up
// to a third of their words, which still excludes passages sharing only
// generic vocabulary with the question.
export function requiredMatches(terms: number) {
  return terms <= 2 ? terms : Math.ceil((terms * 2) / 3);
}
export interface Chunk {
  passage: number;
  heading: string;
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  content: string;
}
export function chunks(body: string): Chunk[] {
  const lines = body.split("\n");
  const out: Chunk[] = [];
  let offset = 0,
    start = 0,
    startLine = 1,
    heading = "",
    fence = false;
  const flush = (end: number, line: number) => {
    if (body.slice(start, end).trim())
      out.push({
        passage: out.length + 1,
        heading,
        start,
        end,
        startLine,
        endLine: line,
        content: body.slice(start, end),
      });
    start = end;
    startLine = line + 1;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence && /^#{1,6}\s+/.test(line)) {
      flush(offset, i);
      startLine = i + 1;
      heading = line.replace(/^#+\s+/, "").slice(0, 200);
    }
    // Bound every passage to <= 1800 UTF-16 characters, prefer paragraph breaks.
    const end = Math.min(body.length, offset + line.length + 1);
    if (end - start > 1800) {
      while (end - start > 1800) {
        const cut = start + 1800;
        flush(cut, i + 1);
        startLine = i + 1;
      }
    }
    offset = end;
    if (!fence && !line.trim() && offset - start >= 900) flush(offset, i + 1);
  }
  flush(body.length, lines.length);
  // Offsets are authoritative; recompute line locators also for long-line splits.
  return out.map((c) => ({
    ...c,
    startLine: body.slice(0, c.start).split("\n").length,
    endLine: body.slice(0, c.end).split("\n").length,
  }));
}
