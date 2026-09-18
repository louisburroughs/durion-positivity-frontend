/**
 * Chat domain model
 * -----------------
 * An assistant turn is a LIST OF TYPED BLOCKS, not one string. The renderer maps
 * each block to a component; an unknown `kind` degrades to plain text rather than
 * leaking raw JSON into the thread.
 *
 * The backend currently answers with `{ response: string }` only — see
 * `chat-response.mapper.ts`, which derives blocks client-side until the MCP server
 * returns them directly (tracked as a backend issue).
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

/** The plain-text projection of a turn, used for copy-to-clipboard and previews. */
export function blocksToPlainText(blocks: readonly ChatBlock[]): string {
  return blocks
    .map(block => blockToPlainText(block))
    .filter(part => part.length > 0)
    .join('\n\n');
}

function blockToPlainText(block: ChatBlock): string {
  switch (block.kind) {
    case 'text':
      return block.text;
    case 'markdown':
      return block.markdown;
    case 'code':
      return block.code;
    case 'table':
      return [
        block.columns.map(column => column.label).join('\t'),
        ...block.rows.map(row => row.join('\t')),
      ].join('\n');
    case 'chart':
      return block.series.map(datum => `${datum.label}\t${datum.value}`).join('\n');
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
