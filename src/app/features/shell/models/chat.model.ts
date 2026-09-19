/**
 * Chat domain model
 * -----------------
 * An assistant turn is a LIST OF TYPED BLOCKS, not one string. The renderer maps
 * each block to a component; an unknown `kind` degrades to plain text rather than
 * leaking raw JSON into the thread.
 *
 * The backend currently answers with `{ response: string }` only — see
 * `chat-response.mapper.ts`, which derives blocks client-side until the MCP server
 * returns them directly (backend #2072).
 */

/** Who produced a turn. */
export type ChatRole = 'user' | 'assistant';

/** Plain prose with no markdown syntax to interpret. */
export interface ChatTextBlock {
  readonly kind: 'text';
  readonly text: string;
}

/** Markdown source, parsed to a token tree by `markdown.util.ts` before rendering. */
export interface ChatMarkdownBlock {
  readonly kind: 'markdown';
  readonly markdown: string;
}

/** Column alignment as the renderer applies it (numeric columns align to the end). */
export type ChatTableAlign = 'start' | 'end';

export interface ChatTableColumn {
  readonly label: string;
  readonly align: ChatTableAlign;
}

export interface ChatTableBlock {
  readonly kind: 'table';
  readonly title: string | null;
  readonly columns: readonly ChatTableColumn[];
  readonly rows: readonly (readonly string[])[];
}

export interface ChatCodeBlock {
  readonly kind: 'code';
  /** Fence info string, lower-cased, or null when the fence carried none. */
  readonly language: string | null;
  readonly code: string;
}

export interface ChatChartDatum {
  readonly label: string;
  readonly value: number;
}

/** A single-series bar chart — the only chart shape the assistant returns today. */
export interface ChatChartBlock {
  readonly kind: 'chart';
  readonly title: string | null;
  readonly series: readonly ChatChartDatum[];
}

export interface ChatImageBlock {
  readonly kind: 'image';
  readonly url: string;
  /** Always present: the renderer never emits an image without a text alternative. */
  readonly alt: string;
  readonly caption: string | null;
}

export interface ChatFileBlock {
  readonly kind: 'file';
  readonly name: string;
  readonly sizeBytes: number | null;
  readonly mimeType: string | null;
  readonly url: string | null;
}

/**
 * A failed turn. Carries translation KEYS, never rendered prose, so the message
 * follows the active locale rather than the locale the request was made in.
 */
export interface ChatErrorBlock {
  readonly kind: 'error';
  readonly messageKey: string;
  readonly detailKey: string | null;
  readonly detailParams: Readonly<Record<string, string | number>> | null;
  readonly correlationId: string | null;
  readonly retryable: boolean;
}

export type ChatBlock =
  | ChatTextBlock
  | ChatMarkdownBlock
  | ChatTableBlock
  | ChatCodeBlock
  | ChatChartBlock
  | ChatImageBlock
  | ChatFileBlock
  | ChatErrorBlock;

export interface ChatMessage {
  readonly id: string;
  readonly role: ChatRole;
  readonly blocks: readonly ChatBlock[];
  readonly timestamp: Date;
  /** True while the assistant turn is still in flight (renders the typing state). */
  readonly pending: boolean;
}

export interface ChatConversation {
  readonly id: string;
  /** Derived from the first user message until the user renames it. */
  readonly title: string;
  /** First line of the latest assistant turn, for the history rail. */
  readonly preview: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly pinned: boolean;
}

/** Day bucket a conversation falls into in the history rail. */
export type ChatHistoryBucket = 'pinned' | 'today' | 'yesterday' | 'previous7Days' | 'older';

export interface ChatHistoryGroup {
  readonly bucket: ChatHistoryBucket;
  readonly conversations: readonly ChatConversation[];
}

/**
 * A value that opens with `=`, `+`, `-`, `@`, a tab or a line break is executed as
 * a FORMULA by Excel and Sheets. Leading whitespace is skipped before that test is
 * made, so ` =HYPERLINK(...)` is a formula too — the guard has to skip it as well.
 * RFC 4180 quoting stops delimiter injection, never evaluation.
 */
export const FORMULA_LEAD_RE = /^(?:\s*[=+\-@]|[\t\r\n])/;

/**
 * Force a value to text. A leading apostrophe is the spreadsheet's text-prefix
 * operator: it is not displayed, and it stops the value being evaluated.
 *
 * Shared by EVERY projection of assistant output that can reach a spreadsheet —
 * the CSV export, the table clipboard copy, and the plain-text projection below
 * that backs "copy this answer" and "copy the whole conversation" — so none of
 * them can drift from the others (ADR-0065 §3).
 */
export function neutraliseFormula(value: string): string {
  return FORMULA_LEAD_RE.test(value) ? `'${value}` : value;
}

/**
 * One cell of a TAB-delimited projection: delimiters inside the value are
 * collapsed to a single space FIRST, then the value is neutralised.
 *
 * `neutraliseFormula` guards the START of a cell, and a cell is only ever what the
 * delimiters say it is. An untrusted value carrying a tab or a newline —
 * `x\t=HYPERLINK("http://evil","x")` — opened a SECOND cell whose own first
 * character was `=`: the guard had been applied to `x`, and the formula travelled
 * into the spreadsheet unguarded, adding a column or a row the table never
 * declared (ADR-0065 §3).
 *
 * Collapsing rather than quoting, deliberately: a paste target reads tab-delimited
 * text without RFC 4180 quoting, so a quote character would land in the cell as
 * text and the tab would still split it. The CSV export is the one projection that
 * IS read with those rules, and it keeps its quoting — see `csvCell` in
 * `chat-message.component.ts`, which neutralises inside the quotes.
 *
 * Shared by both tab-delimited projections (this file's `blocksToPlainText` and
 * the dedicated table copy) so the two cannot drift apart.
 */
export function tsvCell(value: string): string {
  return neutraliseFormula(value.replace(/[\t\r\n]+/g, ' '));
}

/**
 * The CLIPBOARD/EXPORT projection of a turn: what leaves the app as text.
 *
 * Tabular parts are tab-delimited, and tab-delimited text pasted into a
 * spreadsheet lands in cells exactly as the CSV export does — so table cells and
 * chart data points go through {@link tsvCell} here too, not only on the dedicated
 * table-copy and CSV paths (ADR-0065 §3).
 *
 * Use {@link blocksToDisplayText} for anything that is only ever RENDERED: the
 * text-prefix apostrophe is invisible in a spreadsheet but visible on screen.
 */
export function blocksToPlainText(blocks: readonly ChatBlock[]): string {
  return project(blocks, tsvCell);
}

/**
 * The same projection for text that is only shown, never copied or downloaded —
 * the history rail's conversation preview. Skipping the formula guard is the
 * whole point: nothing on this path can reach a spreadsheet, and a preview of an
 * answer whose first block is a totals table otherwise read `'=Total…`, showing
 * the user a guard that exists for Excel (ADR-0065 §3 scopes it to the
 * projections a download or a paste feeds).
 */
export function blocksToDisplayText(blocks: readonly ChatBlock[]): string {
  return project(blocks, value => value);
}

/**
 * Both projections differ ONLY in how a tabular cell is treated — delimiter-safe
 * and neutralised for the clipboard, verbatim for the screen — so they share one
 * walk of the block list: a second copy is how the CSV path and the clipboard path
 * drifted apart in the first place.
 */
function project(blocks: readonly ChatBlock[], cell: (value: string) => string): string {
  return blocks
    .map(block => blockToText(block, cell))
    .filter(part => part.length > 0)
    .join('\n\n');
}

function blockToText(block: ChatBlock, cell: (value: string) => string): string {
  switch (block.kind) {
    case 'text':
      return block.text;
    case 'markdown':
      return block.markdown;
    case 'code':
      return block.code;
    case 'table':
      return [
        block.columns.map(column => cell(column.label)).join('\t'),
        ...block.rows.map(row => row.map(cell).join('\t')),
      ].join('\n');
    case 'chart':
      return block.series
        .map(datum => `${cell(datum.label)}\t${cell(String(datum.value))}`)
        .join('\n');
    case 'image':
      return block.caption ?? block.alt;
    case 'file':
      return block.name;
    case 'error':
      return '';
    default:
      return '';
  }
}
