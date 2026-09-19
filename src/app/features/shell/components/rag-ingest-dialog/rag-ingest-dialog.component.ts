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
import { SHELL_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { ChatApiService } from '../../services/chat-api.service';

type DialogState = 'idle' | 'submitting' | 'success' | 'error';

@Component({
  selector: 'app-rag-ingest-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, ModalDialogDirective],
  templateUrl: './rag-ingest-dialog.component.html',
  styleUrl: './rag-ingest-dialog.component.css',
})
export class RagIngestDialogComponent {
  @Output() readonly closed = new EventEmitter<void>();

  private readonly chatApi = inject(ChatApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<DialogState>('idle');
  /**
   * Which failure the error panel is reporting. A single hardcoded "could not
   * load the document, try again" was false for a refusal the API never even
   * saw, and "try again" is advice that cannot work (ADR-0064 §4: one key, one
   * true claim). Written after `state` in both directions (ADR-0031 §5).
   */
  readonly errorKey = signal<string | null>(null);

  readonly content = signal('');
  readonly metaSource = signal('manual');
  readonly metaType = signal('policy');
  readonly metaTitle = signal('');

  readonly contentError = signal<string | null>(null);
  readonly titleError = signal<string | null>(null);

  submit(): void {
    // The authority decides before the form does. The gate that opened this
    // dialog proves nothing about the token NOW — a silent refresh can drop the
    // permission while the document is being pasted in — and ADR-0040 §6a.1 puts
    // the check on the write method itself, not only on the control that reaches
    // it; §6a.5 requires the denied half to be a test of its own.
    if (!this.canIngest()) {
      // state first, then the key (ADR-0031 §5): a template reading both in the
      // same frame must never see them disagree.
      this.state.set('error');
      this.errorKey.set('SHELL.RAG.ERROR.NOT_PERMITTED');
      return;
    }

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

    // Leaving the error state: `state` moves off `'error'` first (ADR-0031 §5).
    this.state.set('submitting');
    this.errorKey.set(null);

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
        next: () => {
          this.state.set('success');
          this.errorKey.set(null);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('SHELL.RAG.ERROR.SUBMIT');
        },
      });
  }

  /**
   * The same authority the control that opened this dialog checks — read from
   * `SHELL_SECTION.documentIngest`, never a second copy of the literal, so a
   * repointed code cannot leave one of the two behind (ADR-0040 §6a.1/§6a.6).
   * Re-read on every submit, not captured when the dialog opened (§6a.4).
   *
   * A token with no `perm_bits` claim leaves permissions UNKNOWN; that case stays
   * allowed, exactly as `AuthService.canAccess()` and the opening gate do, so a
   * legacy token is not locked out of a control it can legitimately use
   * (ADR-0040 §6a.3).
   */
  private canIngest(): boolean {
    return !this.auth.permissionsKnown() || this.auth.hasAnyPermission(SHELL_SECTION.documentIngest);
  }

  reset(): void {
    this.content.set('');
    this.metaSource.set('manual');
    this.metaType.set('policy');
    this.metaTitle.set('');
    this.contentError.set(null);
    this.titleError.set(null);
    // state first, then the key (ADR-0031 §5).
    this.state.set('idle');
    this.errorKey.set(null);
  }

  close(): void {
    this.reset();
    this.closed.emit();
  }
}
