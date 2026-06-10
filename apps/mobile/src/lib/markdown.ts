// apps/mobile/src/lib/markdown.ts
// Markdown ligero para las respuestas del sous-chef (spec 2026-06-10).
// Tolerante a streaming: cualquier prefijo de un texto válido parsea sin
// throw; marcadores sin cerrar quedan como texto literal.

export type Span = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { type: "title"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; spans: Span[] }
  | { type: "list"; ordered: boolean; items: Span[][] };

// **bold** primero (no-greedy, sin * adentro), después *italic*.
// Énfasis anidado (**x *y* z**) NO forma negrita: trade-off intencional del [^*\n]+.
const INLINE_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  if (!text) return spans;
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) {
      spans.push({ text: tok.slice(2, -2), bold: true });
    } else {
      spans.push({ text: tok.slice(1, -1), italic: true });
    }
    last = m.index + tok.length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans;
}

const HEADING_RE = /^#{1,3}\s+(.*)$/;
const UL_RE = /^[-*]\s+(.*)$/;
const OL_RE = /^\d+\.\s+(.*)$/;

export function parseAssistantMarkdown(input: string): Block[] {
  const blocks: Block[] = [];
  if (!input || !input.trim()) return blocks;

  const lines = input.split(/\r?\n/);
  const hasMdHeading = lines.some((l) => HEADING_RE.test(l));

  // Heurística de título — paridad con la lógica vieja de asistente.tsx.
  let start = 0;
  const first = (lines[0] ?? "").trim();
  if (
    !hasMdHeading &&
    lines.length > 1 &&
    first.length > 0 &&
    first.length < 80 &&
    !/[.:]\s*$/.test(first) &&
    !UL_RE.test(first) &&
    !OL_RE.test(first)
  ) {
    blocks.push({ type: "title", text: first });
    start = 1;
  }

  let list: { ordered: boolean; items: Span[][] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    const text = para.join("\n").trim();
    if (text) blocks.push({ type: "paragraph", spans: parseInline(text) });
    para = [];
  };
  const flushList = () => {
    if (list && list.items.length > 0) {
      blocks.push({ type: "list", ordered: list.ordered, items: list.items });
    }
    list = null;
  };

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    const h = line.match(HEADING_RE);
    if (h) {
      flushPara();
      flushList();
      blocks.push({ type: "heading", text: h[1].trim() });
      continue;
    }

    const ul = line.match(UL_RE);
    const ol = line.match(OL_RE);
    if (ul || ol) {
      flushPara();
      const ordered = Boolean(ol);
      const itemText = (ol ? ol[1] : ul![1]).trim();
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(parseInline(itemText));
      continue;
    }

    if (line === "") {
      flushPara();
      flushList();
      continue;
    }

    flushList();
    para.push(raw);
  }
  flushPara();
  flushList();
  return blocks;
}
