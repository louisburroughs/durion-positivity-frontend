/**
 * Markdown → token tree
 * ---------------------
 * Assistant answers arrive as markdown. Rather than sanitising HTML and handing it
 * to `[innerHTML]`, this parser produces a TYPED TOKEN TREE that the renderer walks
 * with ordinary Angular templates: no HTML is ever constructed, so there is no
 * injection surface to sanitise in the first place (ADR-0065 §1).
 *
 * The supported subset is what the MCP server actually emits: ATX headings,
 * paragraphs, unordered/ordered lists, block quotes, thematic breaks, and the
 * inline set strong / emphasis / code / link / image. Fenced code and GFM tables
 * are split out upstream by `chat-response.mapper.ts` and become their own blocks,
 * so they never reach this parser.
 */

export type MdInline =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'code'; readonly value: string }
  | { readonly type: 'image'; readonly src: string; readonly alt: string }
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
 * Inline delimiters, matched in one pass so the earliest opener wins. The image
 * rule leads the link rule, since `![alt](src)` also matches `[alt](src)`.
 *
 * Group map: 2 = code, 3/4 = image alt/src, 5/6 = link text/href, 7/8 = strong,
 * 9/10 = emphasis.
 *
 * Emphasis with `_` requires a non-word character either side, so an identifier
 * such as `order_line_id` keeps its underscores instead of turning into emphasis.
 */
const INLINE_RE =
  /(\x60+)([^\x60]+?)\1|!\[([^\]]*)\]\(([^)\s]*)\)|\[([^\]]*)\]\(([^)\s]*)\)|\*\*([\s\S]+?)\*\*|(?<![A-Za-z0-9])__([\s\S]+?)__(?![A-Za-z0-9])|\*([^*\n]+?)\*|(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g;

/** Schemes an anchor may carry. Anything else renders as inert text. */
const SAFE_SCHEME_RE = /^(?:https?:|mailto:)/i;
/**
 * Schemes something the browser FETCHES may carry — an image source, a file
 * download. Narrower than the anchor set on purpose: `mailto:` is a navigation
 * target, never a fetchable resource, so accepting it on an `[src]`/download URL
 * would be an allowlist that does not describe what the value is used for.
 */
const FETCHABLE_SCHEME_RE = /^https?:/i;
/** A scheme-looking prefix, used to tell `javascript:x` from a bare relative path. */
const ANY_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
/**
 * `//host/path` and `\\host\path` carry no scheme but still resolve to another
 * origin, so a scheme check alone would wave them through.
 */
const ORIGIN_RELATIVE_RE = /^[/\\]{2}/;

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

/**
 * How deep emphasis, strong and link labels may nest before the rest is kept as
 * literal text. A DEFENSIVE bound on recursion from model output, with no known
 * input that reaches it: the inline pattern matches lazily, so nested runs of
 * `***…***` collapse into one level per delimiter pair rather than one per
 * character, and a mutation audit could not craft a source that recurses eight
 * deep. It stays because the depth is decided by untrusted output and a future
 * pattern change could make deeper nesting reachable — each level is one more
 * JavaScript stack frame, and overflowing takes the whole thread render with it.
 */
const MAX_INLINE_DEPTH = 8;

/** Parse the inline span syntax inside one block. */
export function parseInline(source: string, depth = 0): readonly MdInline[] {
  if (source.length === 0) return [];
  // Degrade to literal text rather than throw: the label still reads, the syntax
  // simply stops being interpreted past this depth.
  if (depth >= MAX_INLINE_DEPTH) return [{ type: 'text', value: source }];

  const nodes: MdInline[] = [];
  const regex = new RegExp(INLINE_RE.source, 'g');
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    if (match.index > cursor) {
      pushText(nodes, source.slice(cursor, match.index));
    }

    const [
      ,
      ,
      code,
      imageAlt,
      imageSrc,
      linkText,
      href,
      strongStars,
      strongUnderscores,
      emStar,
      emUnderscore,
    ] = match;

    if (code !== undefined) {
      nodes.push({ type: 'code', value: code });
    } else if (imageSrc !== undefined) {
      nodes.push(buildImage(imageAlt ?? '', imageSrc));
    } else if (href !== undefined) {
      nodes.push(buildLink(linkText ?? '', href, depth));
    } else if (strongStars !== undefined || strongUnderscores !== undefined) {
      nodes.push({ type: 'strong', children: parseInline(strongStars ?? strongUnderscores, depth + 1) });
    } else if (emStar !== undefined || emUnderscore !== undefined) {
      nodes.push({ type: 'em', children: parseInline(emStar ?? emUnderscore, depth + 1) });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    pushText(nodes, source.slice(cursor));
  }

  return nodes;
}

/**
 * Browsers strip ASCII whitespace and control characters out of a URL before
 * resolving it, so `java\tscript:alert(1)` runs as `javascript:`. Validate — and
 * render — what the browser will actually see, never the raw source.
 */
export function normaliseHref(href: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  return href.replace(/[\u0000-\u0020\u007f]/g, '');
}

/**
 * True when `href` may be used as an anchor target: an http(s)/mailto URL, or a
 * path relative to this app that carries no scheme and no other origin.
 * Everything else — `javascript:`, `data:`, `vbscript:`, `//evil.example` — is
 * rejected. Call it on the value returned by {@link normaliseHref}.
 */
export function isSafeHref(href: string): boolean {
  const candidate = normaliseHref(href);
  if (candidate.length === 0) return false;
  if (ORIGIN_RELATIVE_RE.test(candidate)) return false;
  if (SAFE_SCHEME_RE.test(candidate)) return true;
  return !ANY_SCHEME_RE.test(candidate);
}

/**
 * True when `href` may be FETCHED by the app: an http(s) URL, or a path relative
 * to this app. Use for anything bound to `[src]` or downloaded; anchors use
 * {@link isSafeHref}. Call it on a raw value — it normalises first.
 */
export function isFetchableHref(href: string): boolean {
  const candidate = normaliseHref(href);
  if (!isSafeHref(candidate)) return false;
  return FETCHABLE_SCHEME_RE.test(candidate) || !ANY_SCHEME_RE.test(candidate);
}

function buildLink(text: string, href: string, depth = 0): MdInline {
  const children = parseInline(text.length > 0 ? text : href, depth + 1);
  if (!isSafeHref(href)) {
    // Keep the label, drop the anchor: an unsafe target is never rendered.
    return { type: 'text', value: flattenInline(children) };
  }
  // Render the normalised target, so what was validated is what the browser gets.
  const target = normaliseHref(href);
  return {
    type: 'link',
    href: target,
    external: SAFE_SCHEME_RE.test(target),
    children,
  };
}

/**
 * An image whose source fails the same safety check a link target does renders as
 * its alt text — never as a broken or attacker-chosen `<img>`.
 */
function buildImage(alt: string, src: string): MdInline {
  if (!isFetchableHref(src)) {
    return { type: 'text', value: alt };
  }
  return { type: 'image', src: normaliseHref(src), alt };
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
        case 'image':
          return node.alt;
        default:
          return flattenInline(node.children);
      }
    })
    .join('');
}
