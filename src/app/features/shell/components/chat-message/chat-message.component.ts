import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  blocksToPlainText,
  ChatChartBlock,
  ChatMessage,
  ChatTableBlock,
} from '../../models/chat.model';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';
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
  imports: [DatePipe, DecimalPipe, TranslatePipe, MaterialSymbolPipe, MarkdownViewComponent],
  templateUrl: './chat-message.component.html',
  styleUrl: './chat-message.component.css',
})
export class ChatMessageComponent {
  readonly message = input.required<ChatMessage>();

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
    const header = block.columns.map(column => column.label).join('\t');
    const body = block.rows.map(row => row.join('\t')).join('\n');
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
    URL.revokeObjectURL(url);
  }

  /** Longest bar in a chart sets the 100% mark; a non-positive max keeps bars empty. */
  barWidth(block: ChatChartBlock, value: number): string {
    const max = Math.max(...block.series.map(datum => datum.value), 0);
    if (max <= 0) return '0%';
    return `${Math.round((value / max) * 100)}%`;
  }

  onRetry(): void {
    this.retry.emit(this.message().id);
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

/** RFC 4180 cell: quote it, and double any quote inside it. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Filename-safe stem derived from a block title. */
function slug(title: string | null): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
