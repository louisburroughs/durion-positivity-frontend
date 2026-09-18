import {
  ChatBlock,
  ChatChartDatum,
  ChatTableAlign,
  ChatTableColumn,
} from '../models/chat.model';

/**
 * Backend answer → typed blocks
 * -----------------------------
 * The MCP server answers with `{ response: string }`: one markdown blob. Until it
 * returns a typed `blocks` array of its own, this mapper derives the structure the
 * renderer needs — fenced code and GFM tables become their own blocks, and what is
 * left stays markdown.
 *
 * `mapAnswerPayload` already accepts a structured `blocks` array, so the day the
 * backend starts sending one the client stops guessing with no renderer change.
 */

/**
 * A fenced code block. The fence delimiter (three backticks) is written as an
 * escape so the source carries no stray backtick for tooling to trip over.
 */
const FENCE_RE = /(?:^|\n)[ \t]*\x60{3}([^\n\x60]*)\n([\s\S]*?)(?:\n[ \t]*\x60{3}|$)/;
/** A table body row: at least one pipe with content either side. */
const TABLE_ROW_RE = /^\s*\|(.+)\|\s*$/;
/** A table delimiter row: |---|:--:|---:| */
const TABLE_DELIMITER_RE = /^\s*\|[\s:|-]+\|\s*$/;
/** A delimiter cell ending — but not starting — in a colon is right-aligned. */
const ALIGN_END_RE = /^-+:$/;

/** Shape of a structured block as it may arrive from the backend. */
interface RawBlock {
  readonly kind?: unknown;
  readonly [key: string]: unknown;
}

/** Map a chat answer payload to renderable blocks. */
export function mapAnswerPayload(payload: { response?: unknown; blocks?: unknown }): readonly ChatBlock[] {
  if (Array.isArray(payload.blocks)) {
    const coerced = coerceBlocks(payload.blocks);
    if (coerced.length > 0) return coerced;
  }
  return parseAnswerText(typeof payload.response === 'string' ? payload.response : '');
}

/** Split a markdown answer into code, table and markdown blocks, in source order. */
export function parseAnswerText(raw: string): readonly ChatBlock[] {
  const source = raw.replace(/\r\n?/g, '\n').trim();
  if (source.length === 0) return [];

  const blocks: ChatBlock[] = [];
  let rest = source;

  while (rest.length > 0) {
    const fence = FENCE_RE.exec(rest);
    if (!fence) {
      blocks.push(...splitTables(rest));
      break;
    }

    const before = rest.slice(0, fence.index);
    if (before.trim().length > 0) {
      blocks.push(...splitTables(before));
    }

    const language = fence[1].trim().toLowerCase();
    blocks.push({
      kind: 'code',
      language: language.length > 0 ? language : null,
      code: fence[2].replace(/\n+$/, ''),
    });

    rest = rest.slice(fence.index + fence[0].length);
  }

  return blocks;
}

/** Pull GFM tables out of a markdown run, leaving the prose as markdown blocks. */
function splitTables(segment: string): readonly ChatBlock[] {
  const lines = segment.split('\n');
  const blocks: ChatBlock[] = [];
  let pending: string[] = [];

  const flushPending = (): void => {
    const markdown = pending.join('\n').trim();
    pending = [];
    if (markdown.length > 0) {
      blocks.push({ kind: 'markdown', markdown });
    }
  };

  let index = 0;
  while (index < lines.length) {
    const isTableStart =
      TABLE_ROW_RE.test(lines[index]) &&
      index + 1 < lines.length &&
      TABLE_DELIMITER_RE.test(lines[index + 1]);

    if (!isTableStart) {
      pending.push(lines[index]);
      index += 1;
      continue;
    }

    flushPending();

    const columns = buildColumns(splitRow(lines[index]), splitRow(lines[index + 1]));
    index += 2;

    const rows: string[][] = [];
    while (index < lines.length && TABLE_ROW_RE.test(lines[index])) {
      rows.push(normaliseRow(splitRow(lines[index]), columns.length));
      index += 1;
    }

    blocks.push({ kind: 'table', title: null, columns, rows });
  }

  flushPending();
  return blocks;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function buildColumns(headerCells: string[], delimiterCells: string[]): ChatTableColumn[] {
  return headerCells.map((label, position) => ({
    label,
    align: alignmentOf(delimiterCells[position] ?? ''),
  }));
}

function alignmentOf(delimiterCell: string): ChatTableAlign {
  return ALIGN_END_RE.test(delimiterCell.trim()) ? 'end' : 'start';
}

function normaliseRow(cells: string[], width: number): string[] {
  const row = cells.slice(0, width);
  while (row.length < width) row.push('');
  return row;
}

/**
 * Validate a structured `blocks` array from the backend. An entry whose `kind` is
 * unknown, or whose payload is malformed, degrades to its text content when it has
 * one and is dropped otherwise — raw JSON never reaches the thread.
 */
export function coerceBlocks(raw: readonly unknown[]): readonly ChatBlock[] {
  const blocks: ChatBlock[] = [];
  for (const entry of raw) {
    const block = coerceBlock(entry);
    if (block) blocks.push(block);
  }
  return blocks;
}

function coerceBlock(entry: unknown): ChatBlock | null {
  if (!entry || typeof entry !== 'object') return null;
  const raw = entry as RawBlock;

  switch (raw.kind) {
    case 'text':
      return asString(raw['text']) ? { kind: 'text', text: raw['text'] as string } : null;
    case 'markdown':
      return asString(raw['markdown']) ? { kind: 'markdown', markdown: raw['markdown'] as string } : null;
    case 'code':
      return asString(raw['code'])
        ? {
            kind: 'code',
            language: asString(raw['language']) ? (raw['language'] as string).toLowerCase() : null,
            code: raw['code'] as string,
          }
        : null;
    case 'table':
      return coerceTable(raw);
    case 'chart':
      return coerceChart(raw);
    case 'image':
      return asString(raw['url']) && asString(raw['alt'])
        ? {
            kind: 'image',
            url: raw['url'] as string,
            alt: raw['alt'] as string,
            caption: asString(raw['caption']) ? (raw['caption'] as string) : null,
          }
        : null;
    case 'file':
      return asString(raw['name'])
        ? {
            kind: 'file',
            name: raw['name'] as string,
            sizeBytes: typeof raw['sizeBytes'] === 'number' ? raw['sizeBytes'] : null,
            mimeType: asString(raw['mimeType']) ? (raw['mimeType'] as string) : null,
            url: asString(raw['url']) ? (raw['url'] as string) : null,
          }
        : null;
    default:
      return fallbackText(raw);
  }
}

function coerceTable(raw: RawBlock): ChatBlock | null {
  const rawColumns = raw['columns'];
  const rawRows = raw['rows'];
  if (!Array.isArray(rawColumns) || !Array.isArray(rawRows)) return null;

  const columns: ChatTableColumn[] = rawColumns
    .map(column => {
      if (asString(column)) return { label: column as string, align: 'start' as ChatTableAlign };
      if (column && typeof column === 'object' && asString((column as RawBlock)['label'])) {
        const label = (column as RawBlock)['label'] as string;
        const align = (column as RawBlock)['align'] === 'end' ? 'end' : 'start';
        return { label, align: align as ChatTableAlign };
      }
      return null;
    })
    .filter((column): column is ChatTableColumn => column !== null);

  if (columns.length === 0) return null;

  const rows = rawRows
    .filter(Array.isArray)
    .map(row => normaliseRow((row as unknown[]).map(cell => String(cell ?? '')), columns.length));

  return {
    kind: 'table',
    title: asString(raw['title']) ? (raw['title'] as string) : null,
    columns,
    rows,
  };
}

function coerceChart(raw: RawBlock): ChatBlock | null {
  const rawSeries = raw['series'];
  if (!Array.isArray(rawSeries)) return null;

  const series = rawSeries
    .map(datum => {
      if (!datum || typeof datum !== 'object') return null;
      const label = (datum as RawBlock)['label'];
      const value = (datum as RawBlock)['value'];
      if (!asString(label) || typeof value !== 'number' || !Number.isFinite(value)) return null;
      return { label: label as string, value } satisfies ChatChartDatum;
    })
    .filter((datum): datum is ChatChartDatum => datum !== null);

  if (series.length === 0) return null;

  return {
    kind: 'chart',
    title: asString(raw['title']) ? (raw['title'] as string) : null,
    series,
  };
}

/** Last resort for an unrecognised block: keep whatever readable text it carries. */
function fallbackText(raw: RawBlock): ChatBlock | null {
  for (const key of ['text', 'markdown', 'content', 'value']) {
    if (asString(raw[key])) {
      return { kind: 'text', text: raw[key] as string };
    }
  }
  return null;
}

function asString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
