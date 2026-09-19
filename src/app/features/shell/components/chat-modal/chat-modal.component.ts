import {
  afterNextRender,
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SHELL_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';
import { blocksToPlainText } from '../../models/chat.model';
import { ChatSendService } from '../../services/chat-send.service';
import { ChatStateService } from '../../services/chat-state.service';
import { ChatUiService, isNarrowViewport } from '../../services/chat-ui.service';
import { ChatComposerComponent } from '../chat-composer/chat-composer.component';
import { ChatHistoryRailComponent } from '../chat-history-rail/chat-history-rail.component';
import { ChatMessageComponent } from '../chat-message/chat-message.component';
import { RagIngestDialogComponent } from '../rag-ingest-dialog/rag-ingest-dialog.component';

interface Suggestion {
  readonly textKey: string;
  readonly captionKey: string;
}

/**
 * ChatModalComponent
 * ------------------
 * The assistant, as a modal dialog over the page — replacing the panel that used
 * to push the page down from the top of the shell.
 *
 * Dialog behaviour: a native `<dialog appModalDialog>` supplies the top layer,
 * the `::backdrop`, the focus trap and Escape-to-close; this component only
 * moves focus to the composer on open and back to the opener on close, and owns
 * the history-rail/thread/composer layout.
 */
@Component({
  selector: 'app-chat-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    MaterialSymbolPipe,
    ModalDialogDirective,
    ChatHistoryRailComponent,
    ChatMessageComponent,
    ChatComposerComponent,
    RagIngestDialogComponent,
  ],
  templateUrl: './chat-modal.component.html',
  styleUrl: './chat-modal.component.css',
})
export class ChatModalComponent implements AfterViewChecked {
  private readonly chatUi = inject(ChatUiService);
  private readonly chatState = inject(ChatStateService);
  private readonly chatSend = inject(ChatSendService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');
  private readonly composer = viewChild(ChatComposerComponent);

  readonly historyRailOpen = this.chatUi.historyRailOpen;
  readonly messages = this.chatState.messages;
  readonly isEmpty = this.chatState.isEmpty;
  readonly awaitingReply = this.chatState.awaitingReply;
  /** The thread on screen is not yet the conversation being opened. */
  readonly switching = this.chatState.switching;
  /**
   * Nothing may start a turn right now. The suggestions read this as well as the
   * composer: `useSuggestion` calls `send()` directly, so leaving them live while
   * a conversation loads was the same defect by another route.
   */
  readonly composerBusy = computed(() => this.awaitingReply() || this.switching());
  readonly activeConversation = this.chatState.activeConversation;
  readonly errorKey = this.chatState.errorKey;
  /** A history write that did not land — the thread on screen is still fine. */
  readonly persistenceErrorKey = this.chatState.persistenceErrorKey;

  /**
   * A route's read permission never enables a write (ADR-0040 §6a.1): this gates
   * on `SHELL_SECTION.documentIngest`, the code the pos-mcp-server endpoint
   * itself enforces (named once in `core/security/route-permissions.ts`, where
   * the dialog's own submit-time check reads it from too). A token with no
   * `perm_bits` claim leaves permissions unknown, so this stays open for legacy
   * tokens the way `AuthService.canAccess()` does, mirroring
   * `dispatch-board-page.component.ts`'s `canAssignBay`.
   */
  readonly canIngestDocuments = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(SHELL_SECTION.documentIngest),
  );
  readonly showRagDialog = signal(false);
  readonly maximised = signal(false);

  readonly suggestions: readonly Suggestion[] = [
    { textKey: 'SHELL.CHAT.EMPTY.SUGGESTION_1', captionKey: 'SHELL.NAV.PEOPLE' },
    { textKey: 'SHELL.CHAT.EMPTY.SUGGESTION_2', captionKey: 'SHELL.NAV.WORKORDERS' },
    { textKey: 'SHELL.CHAT.EMPTY.SUGGESTION_3', captionKey: 'SHELL.NAV.INVENTORY' },
    { textKey: 'SHELL.CHAT.EMPTY.SUGGESTION_4', captionKey: 'SHELL.NAV.BILLING' },
    { textKey: 'SHELL.CHAT.EMPTY.SUGGESTION_5', captionKey: 'SHELL.NAV.DISPATCH' },
    { textKey: 'SHELL.CHAT.EMPTY.SUGGESTION_6', captionKey: 'SHELL.NAV.CRM' },
  ];

  private scrollPending = false;
  private renderedMessageCount = 0;
  private readonly openerElement: HTMLElement | null;

  constructor() {
    this.openerElement =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    this.chatState.refresh();

    afterNextRender(() => {
      this.focusInitial();
      this.scrollPending = true;
    });

    this.destroyRef.onDestroy(() => this.restoreFocusToOpener());
  }

  ngAfterViewChecked(): void {
    const count = this.messages().length;
    if (count !== this.renderedMessageCount) {
      this.renderedMessageCount = count;
      this.scrollPending = true;
    }
    if (!this.scrollPending) return;

    const element = this.thread()?.nativeElement;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    this.scrollPending = false;
  }

  close(): void {
    this.chatUi.close();
  }

  toggleHistoryRail(): void {
    this.chatUi.toggleHistoryRail();
  }

  toggleMaximised(): void {
    this.maximised.update(value => !value);
  }

  newChat(): void {
    this.chatState.startNewConversation();
    this.focusComposerAfterRender();
  }

  /**
   * On a phone the rail covers the whole dialog (`.chat-rail ~ .chat-main` is
   * hidden), so leaving it open after a conversation is chosen would hide the very
   * thread that was just opened. Close it and put the caret in the composer.
   */
  onConversationOpened(): void {
    if (isNarrowViewport()) {
      this.chatUi.hideHistoryRail();
    }
    // A newly opened conversation must show its latest turn even when it has
    // the same number of messages as the one it replaces, which the
    // count-based check in ngAfterViewChecked cannot see.
    this.scrollPending = true;
    // Deferred: while the rail is still rendered open, `.chat-main` is
    // display:none on a narrow viewport and focusing the composer does nothing —
    // then the clicked row is removed and focus falls to <body>, outside the trap.
    this.focusComposerAfterRender();
  }

  /**
   * Open the ingest dialog. Re-checked here, not only at the control
   * (ADR-0040 §6a.1): a control that renders enabled from a stale
   * `canIngestDocuments()` read must not be the only thing standing between a
   * click and the backend's `mcp:document:ingest` check. `appModalDialog` calls
   * `showModal()` as the nested dialog mounts, which moves focus into it —
   * nothing here has to.
   */
  openRagDialog(): void {
    if (!this.canIngestDocuments()) return;
    this.showRagDialog.set(true);
  }

  /**
   * The nested dialog emits `closed` while its own `<dialog>` is still mounted and
   * topmost, which makes everything outside it — this dialog included — inert: a
   * synchronous `focus()` on the composer can be rejected outright, and focus then
   * falls to `<body>` the moment Angular removes the child. Deferred until after
   * that removal, so the caret lands back in the composer deliberately rather than
   * depending on how a browser treats a focus call into an inert subtree
   * (ADR-0029 §8.7).
   */
  onRagDialogClosed(): void {
    this.showRagDialog.set(false);
    this.focusComposerAfterRender();
  }

  send(text: string): void {
    // The send button is disabled while a turn cannot start, but this is the
    // public entry point every path funnels through — the composer's own
    // (submitted) output, a suggestion, a retry — so the guard has to live here
    // too. A send that slips through while `switching()` is true is recorded
    // against the conversation being replaced, and the arriving selection load
    // then overwrites the thread and loses it.
    if (this.composerBusy()) return;
    this.chatSend.send(text, { onSettled: () => (this.scrollPending = true) });
    this.scrollPending = true;
  }

  retry(messageId: string): void {
    // The composer's own guard covers typed input; this is the guard for the
    // retry button, which useSuggestion() already proved has to live on the
    // public entry point, not just the disabled-looking control.
    if (this.composerBusy()) return;
    this.chatSend.retry(messageId, { onSettled: () => (this.scrollPending = true) });
    // The retry button goes with the turn it belonged to.
    this.focusComposerAfterRender();
  }

  useSuggestion(textKey: string): void {
    // The buttons are disabled while a turn cannot start, but this is also the
    // public entry point: a guard here is what actually holds the invariant.
    if (this.composerBusy()) return;
    this.send(this.translate.instant(textKey));
    // Sending empties the empty state, taking the clicked suggestion with it.
    this.focusComposerAfterRender();
  }

  /**
   * Put the caret in the composer once the DOM has caught up. Every caller here
   * has just removed the control that had focus; doing it synchronously would
   * either target a still-hidden composer or race the removal, and focus would
   * land on <body> — outside the dialog.
   */
  private focusComposerAfterRender(): void {
    setTimeout(() => this.composer()?.focus());
  }

  /** Copy the whole conversation as plain text, sender-labelled. */
  copyTranscript(): void {
    const userLabel = this.translate.instant('SHELL.CHAT.SENDER_USER');
    const assistantLabel = this.translate.instant('SHELL.CHAT.SENDER_ASSISTANT');
    const transcript = this.messages()
      .filter(message => !message.pending)
      .map(message => `${message.role === 'user' ? userLabel : assistantLabel}: ${blocksToPlainText(message.blocks)}`)
      .join('\n\n');

    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(transcript).catch(() => {
      // Clipboard blocked by permissions policy — nothing else to fall back to.
    });
  }

  /**
   * A click on the dialog's own `::backdrop` fires a click event on the dialog
   * element itself, with `target` set to the dialog — never to anything inside
   * it. That is the only way to tell a backdrop dismiss from a click on the
   * card's own padding, since the dialog box and the backdrop share one element.
   */
  onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) this.close();
  }

  /**
   * The deliberate initial focus target: the composer, so the dialog opens with
   * the caret where the user is going to type. `showModal()` would otherwise put
   * focus on the first tabbable control — the close button, or a history row —
   * and a screen reader would announce that instead of the message box
   * (ADR-0029 §9: the specific element that takes focus is asserted).
   */
  private focusInitial(): void {
    this.composer()?.focus();
  }

  /**
   * Native `showModal()` traps focus for us; all this restores is where focus
   * goes back to once the dialog is gone. The opener can be gone too — a row a
   * background refresh removed, a control a permission change disabled — so
   * this checks it is still attached and focusable before trusting it, falling
   * back to the header's own chat toggle rather than dropping focus to <body>.
   */
  private restoreFocusToOpener(): void {
    const opener = this.openerElement;
    if (opener && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus();
      return;
    }
    if (typeof document === 'undefined') return;
    document.querySelector<HTMLElement>('[data-chat-opener]')?.focus();
  }
}
