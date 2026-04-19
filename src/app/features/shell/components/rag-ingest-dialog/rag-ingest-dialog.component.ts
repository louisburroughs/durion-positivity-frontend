import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  inject,
  Output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChatApiService } from '../../services/chat-api.service';

type DialogState = 'idle' | 'submitting' | 'success' | 'error';

@Component({
  selector: 'app-rag-ingest-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './rag-ingest-dialog.component.html',
  styleUrl: './rag-ingest-dialog.component.css',
})
export class RagIngestDialogComponent {
  @Output() readonly closed = new EventEmitter<void>();

  private readonly chatApi = inject(ChatApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<DialogState>('idle');

  readonly content = signal('');
  readonly metaSource = signal('manual');
  readonly metaType = signal('policy');
  readonly metaTitle = signal('');

  readonly contentError = signal<string | null>(null);
  readonly titleError = signal<string | null>(null);

  submit(): void {
    this.contentError.set(null);
    this.titleError.set(null);

    const contentVal = this.content().trim();
    const titleVal = this.metaTitle().trim();
    let valid = true;

    if (!contentVal) {
      this.contentError.set('SHELL.RAG.ERROR.CONTENT_REQUIRED');
      valid = false;
    }
    if (!titleVal) {
      this.titleError.set('SHELL.RAG.ERROR.TITLE_REQUIRED');
      valid = false;
    }
    if (!valid) return;

    this.state.set('submitting');

    this.chatApi
      .ingestDocument({
        content: contentVal,
        metadata: {
          source: this.metaSource().trim() || 'manual',
          type: this.metaType().trim() || 'policy',
          title: titleVal,
        },
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (this.state() === 'submitting') {
            this.state.set('idle');
          }
        }),
      )
      .subscribe({
        next: () => this.state.set('success'),
        error: () => this.state.set('error'),
      });
  }

  reset(): void {
    this.content.set('');
    this.metaSource.set('manual');
    this.metaType.set('policy');
    this.metaTitle.set('');
    this.contentError.set(null);
    this.titleError.set(null);
    this.state.set('idle');
  }

  close(): void {
    this.reset();
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('rag-dialog-backdrop')) {
      this.close();
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
    }
  }
}
