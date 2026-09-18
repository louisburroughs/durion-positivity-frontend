import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import {
  blocksToPlainText,
  ChatChartBlock,
  ChatFileBlock,
  ChatMessage,
  ChatTableBlock,
  neutraliseFormula,
} from '../../models/chat.model';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';
import { AuthedImageDirective } from '../../directives/authed-image.directive';
import { ChatBlobService } from '../../services/chat-blob.service';
import { MarkdownViewComponent } from '../markdown-view/markdown-view.component';

/** How long the copy button shows its confirmed state. */
const COPY_FEEDBACK_MS = 2000;

/**
 * ChatMessageComponent
 * --------------------
 * One turn in the thread. A user turn is a bubble; an assistant turn is a list of
 * typed blocks, each with its own renderer — markdown, table, code, chart, image,
 * file, or an error with a retry.
 *
 * A block kind the renderer does not know never reaches here: the mapper degrades
 * it to text first, so the thread cannot end up showing raw JSON.
 */
@Component({
  selector: 'app-chat-message',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    TranslatePipe,
    MaterialSymbolPipe,
    MarkdownViewComponent,
    AuthedImageDirective,
  ],
  templateUrl: './chat-message.component.html',
  styleUrl: './chat-message.component.css',
})
export class ChatMessageComponent {
  private readonly blobs = inject(ChatBlobService);
  private readonly destroyRef = inject(DestroyRef);

  /** Source URL of the file currently being fetched, so its button can disable. */
  readonly downloading = signal<string | null>(null);
  /**
   * Source URL of the file whose last download failed. Rendered next to that
   * block, so a failure is visible instead of a button that silently does
   * nothing; the button stays enabled so the fetch can be retried.
   */
  readonly downloadFailed = signal<string | null>(null);
  readonly message = input.required<ChatMessage>();
  /** True while a reply is in flight: the retry button stays visible but disabled. */
  readonly busy = input(false);

  /** Emits the id of a failed turn the user asked to retry. */
  readonly retry = output<string>();

  readonly isUser = computed(() => this.message().role === 'user');
  readonly plainText = computed(() => blocksToPlainText(this.message().blocks));
  readonly retryable = computed(() =>
    this.message().blocks.some(block => block.kind === 'error' && block.retryable),
  );

  readonly copied = signal(false);

  copyTurn(): void {
    void this.writeToClipboard(this.plainText());
  }

  copyTable(block: ChatTableBlock): void {
    // Tab-separated text pasted into a spreadsheet lands in cells, so a cell
    // opening with `=` becomes a live formula exactly as it would from the CSV.
    const header = block.columns.map(column => neutraliseFormula(column.label)).join('\t');
    const body = block.rows
      .map(row => row.map(neutraliseFormula).join('\t'))
      .join('\n');
    void this.writeToClipboard(`${header}\n${body}`);
  }

  copyCode(code: string): void {
    void this.writeToClipboard(code);
  }

  /** Offer the table as a CSV file, built in the browser from the rendered rows. */
  downloadCsv(block: ChatTableBlock): void {
    if (typeof document === 'undefined') return;

    const fileName = `${slug(block.title) || 'assistant-table'}.csv`;

    const lines = [
      block.columns.map(column => csvCell(column.label)).join(','),
      ...block.rows.map(row => row.map(csvCell).join(',')),
    ];
    // The BOM keeps non-ASCII cells readable when the CSV is opened in Excel.
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    // Revoking in the same tick cancels the download in Firefox and Safari, which
    // have not yet read the blob when click() returns.
    setTimeout(() => URL.revokeObjectURL(url));
  }

  /** Longest bar in a chart sets the 100% mark. Computed once per chart, not per bar. */
  chartMax(block: ChatChartBlock): number {
    return block.series.reduce((largest, datum) => Math.max(largest, datum.value), 0);
  }

  /**
   * Bar width against the chart's maximum; a non-positive maximum keeps bars
   * empty. Clamped to 0-100%: the series comes from the model, and a negative
   * value produced a negative width that rendered as a full-width bar in some
   * engines. The value itself is still shown beside the bar, so nothing is lost.
   */
  barWidth(value: number, max: number): string {
    if (max <= 0) return '0%';
    const percentage = Math.round((value / max) * 100);
    return `${Math.min(100, Math.max(0, percentage))}%`;
  }

  onRetry(): void {
    this.retry.emit(this.message().id);
  }

  /**
   * Fetch the file through the authenticated client and save it.
   *
   * A native `<a href download>` is fetched by the browser, which carries no
   * bearer token, so a same-origin API blob would 401 or navigate to an error
   * page instead of downloading.
   */
  downloadFile(block: ChatFileBlock): void {
    const source = block.url;
    if (!source || typeof document === 'undefined' || this.downloading() === source) return;

    this.downloading.set(source);
    this.downloadFailed.set(null);
    this.blobs
      .resolve(source)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: url => {
          this.downloading.set(null);
          saveAs(url, block.name);
        },
        error: () => {
          this.downloading.set(null);
          // Keyed by the source URL so the message sits with the block that
          // failed, not on every file block in the turn.
          this.downloadFailed.set(source);
        },
      });
  }

  private async writeToClipboard(text: string): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard blocked by permissions policy: the text stays selectable instead.
    }
  }
}

/**
 * Save a URL to disk.
 *
 * The object URL is NOT revoked here: it belongs to {@link ChatBlobService},
 * which caches it per source and hands the same URL to the `<img>` renderer and
 * to every later download of the same file. Revoking it from this consumer left
 * the cache holding a dead URL — a second download, and any image sharing it,
 * silently produced nothing. The service revokes on identity change and on
 * destroy; URLs this component mints itself (the CSV export) are revoked there.
 */
function saveAs(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(fileName);
  anchor.click();
}

/** RFC 4180 cell: neutralise a formula lead, quote it, and double inner quotes. */
function csvCell(value: string): string {
  return `"${neutraliseFormula(value).replace(/"/g, '""')}"`;
}

/**
 * Extensions a downloaded attachment may keep. Anything else is dropped: the name
 * comes from the model's answer, so `report.pdf.html` or a right-to-left override
 * disguising `.exe` is exactly the payload an allowlist exists to refuse.
 */
const SAFE_DOWNLOAD_EXTENSIONS = new Set([
  'csv', 'tsv', 'txt', 'md', 'log', 'json', 'xml', 'yaml', 'yml',
  'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp',
  'xlsx', 'xls', 'docx', 'doc', 'pptx', 'zip',
]);
const FILE_EXTENSION_RE = /\.([A-Za-z0-9]{1,8})$/;
/** Used when nothing readable survives sanitisation. */
const GENERIC_DOWNLOAD_STEM = 'assistant-file';

/**
 * Filename for a model-supplied attachment name: path separators, control
 * characters and bidi overrides cannot survive {@link slug}, the stem is capped,
 * and only an allowlisted extension is kept.
 */
function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const match = FILE_EXTENSION_RE.exec(base);
  const extension =
    match && SAFE_DOWNLOAD_EXTENSIONS.has(match[1].toLowerCase()) ? match[1].toLowerCase() : null;
  const stem = slug(extension ? base.slice(0, base.length - match![0].length) : base);
  const safeStem = stem.length > 0 ? stem : GENERIC_DOWNLOAD_STEM;
  return extension ? `${safeStem}.${extension}` : safeStem;
}

/** Filename-safe stem derived from a block title or attachment name. */
function slug(title: string | null): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
