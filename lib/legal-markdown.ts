/**
 * Minimal parser for the published policy text. The legal documents are stored
 * as Markdown because that is what a reviewer edits; the site only needs
 * headings, paragraphs, bullet and numbered lists, bold spans, inline code and
 * links. Anything else is treated as paragraph text rather than silently
 * dropped, so an unsupported construct shows up in review instead of vanishing
 * from a legal page.
 */

export type InlineSegment =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; value: string; href: string };

export type PolicyBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; segments: InlineSegment[] }
  | { kind: "list"; ordered: boolean; items: InlineSegment[][] };

const INLINE_SOURCE =
  "\\[([^\\]]+)\\]\\(([^)\\s]+)\\)|\\*\\*([^*]+)\\*\\*|`([^`]+)`";

export function parseInline(source: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = new RegExp(INLINE_SOURCE, "g");
  let index = 0;
  let match = pattern.exec(source);

  while (match !== null) {
    const at = match.index;

    if (at > index)
      segments.push({ kind: "text", value: source.slice(index, at) });

    if (match[1] !== undefined && match[2] !== undefined) {
      segments.push({ kind: "link", value: match[1], href: match[2] });
    } else if (match[3] !== undefined) {
      segments.push({ kind: "strong", value: match[3] });
    } else if (match[4] !== undefined) {
      segments.push({ kind: "code", value: match[4] });
    }

    index = at + match[0].length;
    match = pattern.exec(source);
  }

  if (index < source.length) {
    segments.push({ kind: "text", value: source.slice(index) });
  }

  return segments.length > 0 ? segments : [{ kind: "text", value: "" }];
}

export function parsePolicy(source: string): PolicyBlock[] {
  const blocks: PolicyBlock[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: InlineSegment[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;

    blocks.push({
      kind: "paragraph",
      segments: parseInline(paragraph.join(" ").trim()),
    });
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;

    blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    list = null;
  };

  for (const line of lines) {
    const text = line.trim();

    if (text === "") {
      flushParagraph();
      flushList();
      continue;
    }

    if (text.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", text: text.slice(3).trim() });
      continue;
    }

    const ordered = /^\d+\.\s+/.test(text);
    const bullet = text.startsWith("- ");

    if (ordered || bullet) {
      flushParagraph();

      const body = ordered ? text.replace(/^\d+\.\s+/, "") : text.slice(2);

      if (list && list.ordered !== ordered) flushList();

      list = list ?? { ordered, items: [] };
      list.items.push(parseInline(body.trim()));
      continue;
    }

    flushList();
    paragraph.push(text);
  }

  flushParagraph();
  flushList();

  return blocks;
}
