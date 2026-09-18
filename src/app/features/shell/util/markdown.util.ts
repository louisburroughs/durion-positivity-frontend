/**
 * Markdown → token tree
 * ---------------------
 * Assistant answers arrive as markdown. Rather than sanitising HTML and handing it
 * to `[innerHTML]`, this parser produces a TYPED TOKEN TREE that the renderer walks
 * with ordinary Angular templates: no HTML is ever constructed, so there is no
 * injection surface to sanitise in the first place (ADR-0033).
 *
 * The supported subset is what the MCP server actually emits: ATX headings,
 * paragraphs, unordered/ordered lists, block quotes, thematic breaks, and the
 * inline set strong / emphasis / code / link. Fenced code and GFM tables are split
 * out upstream by `chat-response.mapper.ts` and become their own blocks, so they
 * never reach this parser.
 */

export type MdInline =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'code'; readonly value: string }
  | { readonly type: 'strong'; readonly children: readonly MdInline[] }
  | { readonly type: 'em'; readonly children: readonly MdInline[] }
  | { readonly type: 'link'; readonly href: string; readonly external: boolean; readonly children: readonly MdInline[] };

export type MdHeadingLevel = 1 | 2 | 3 | 4;

export type MdBlock =
  | { readonly type: 'heading'; readonly level: MdHeadingLevel; readonly children: readonly MdInline[] }
  | { readonly type: 'paragraph'; readonly children: readonly MdInline[] }
  | { readonly type: 'quote'; readonly children: readonly MdInline[] }
  | { readonly type: 'list'; readonly ordered: boolean; readonly items: readonly (readonly MdInline[])[] }
  | { readonly type: 'rule' };

/** Markdown allows six levels; the thread renders at most four, so deeper ones clamp. */
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const UNORDERED_RE = /^[-*+]\s+(.*)$/;
const ORDERED_RE = /^\d+[.)]\s+(.*)$/;
const RULE_RE = /^(?:-{3,}|\*{3,}|_{3,})$/;

/**
 * Inline delimiters, matched in one pass so the earliest opener wins.
 * Group map: 2 = code, 3/4 = link text/href, 5/6 = strong, 7/8 = emphasis.
 */
const INLINE_RE =
  /(\x60+)([^\x60]+?)\1|\[([^\]]*)\]\(([^)\s]*)\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\n]+?)\*|_([^_\n]+?)_/g;

/** Schemes an anchor may carry. Anything else renders as inert text. */
const SAFE_SCHEME_RE = /^(?:https?:|mailto:)/i;
/** A scheme-looking prefix, used to tell `javascript:x` from a bare relative path. */
const ANY_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** Parse a markdown document into blocks. Never throws; unknown syntax stays literal. */
export function parseMarkdown(source: string): readonly MdBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (RULE_RE.test(line.trim())) {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: Math.min(heading[1].length, 4) as MdHeadingLevel,
        children: parseInline(heading[2]),
      });
      index += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && QUOTE_RE.test(lines[index])) {
        quoted.push(QUOTE_RE.exec(lines[index])![1]);
        index += 1;
      }
      blocks.push({ type: 'quote', children: parseInline(quoted.join(' ').trim()) });
      continue;
    }

    const listMatcher = UNORDERED_RE.test(line) ? UNORDERED_RE : ORDERED_RE.test(line) ? ORDERED_RE : null;
    if (listMatcher) {
      const items: (readonly MdInline[])[] = [];
      while (index < lines.length && listMatcher.test(lines[index])) {
        items.push(parseInline(listMatcher.exec(lines[index])![1]));
        index += 1;
      }
      blocks.push({ type: 'list', ordered: listMatcher === ORDERED_RE, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && !isBlockBoundary(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) });
  }

  return blocks;
}

/** Parse the inline span syntax inside one block. */
export function parseInline(source: string): readonly MdInline[] {
  if (source.length === 0) return [];

  const nodes: MdInline[] = [];
  const regex = new RegExp(INLINE_RE.source, 'g');
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    if (match.index > cursor) {
      pushText(nodes, source.slice(cursor, match.index));
    }

    const [, , code, linkText, href, strongStars, strongUnderscores, emStar, emUnderscore] = match;

    if (code !== undefined) {
      nodes.push({ type: 'code', value: code });
    } else if (href !== undefined) {
      nodes.push(buildLink(linkText ?? '', href));
    } else if (strongStars !== undefined || strongUnderscores !== undefined) {
      nodes.push({ type: 'strong', children: parseInline(strongStars ?? strongUnderscores) });
    } else if (emStar !== undefined || emUnderscore !== undefined) {
      nodes.push({ type: 'em', children: parseInline(emStar ?? emUnderscore) });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    pushText(nodes, source.slice(cursor));
  }

  return nodes;
}

/**
 * True when `href` may be used as an anchor target: an http(s)/mailto URL, or a
 * relative path that carries no scheme at all. Everything else — `javascript:`,
 * `data:`, `vbscript:` and friends — is rejected.
 */
export function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.length === 0) return false;
  if (SAFE_SCHEME_RE.test(trimmed)) return true;
  return !ANY_SCHEME_RE.test(trimmed);
}

function buildLink(text: string, href: string): MdInline {
  const children = parseInline(text.length > 0 ? text : href);
  if (!isSafeHref(href)) {
    // Keep the label, drop the anchor: an unsafe target is never rendered.
    return { type: 'text', value: flattenInline(children) };
  }
  return {
    type: 'link',
    href: href.trim(),
    external: SAFE_SCHEME_RE.test(href.trim()),
    children,
  };
}

function pushText(nodes: MdInline[], value: string): void {
  if (value.length === 0) return;
  nodes.push({ type: 'text', value });
}

function isBlockBoundary(line: string): boolean {
  if (line.trim().length === 0) return true;
  return (
    RULE_RE.test(line.trim()) ||
    HEADING_RE.test(line) ||
    QUOTE_RE.test(line) ||
    UNORDERED_RE.test(line) ||
    ORDERED_RE.test(line)
  );
}

/** Collapse an inline tree back to its text content. */
export function flattenInline(nodes: readonly MdInline[]): string {
  return nodes
    .map(node => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.value;
        default:
          return flattenInline(node.children);
      }
    })
    .join('');
}
