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
import { AuthService } from '../../../../core/services/auth.service';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';
import { blocksToPlainText } from '../../models/chat.model';
import { ChatSendService } from '../../services/chat-send.service';
import { ChatStateService } from '../../services/chat-state.service';
import { ChatUiService } from '../../services/chat-ui.service';
import { ChatComposerComponent } from '../chat-composer/chat-composer.component';
import { ChatHistoryRailComponent } from '../chat-history-rail/chat-history-rail.component';
import { ChatMessageComponent } from '../chat-message/chat-message.component';
import { RagIngestDialogComponent } from '../rag-ingest-dialog/rag-ingest-dialog.component';

/** Elements that can hold focus inside the dialog, for the focus trap. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
 * Dialog behaviour: the backdrop and Escape close it, focus moves to the composer
 * on open and back to the opener on close, and Tab is trapped inside while it is
 * open. The history rail, the thread and the composer are separate components; this
 * one owns the frame and the keyboard contract.
 */
@Component({
  selector: 'app-chat-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    MaterialSymbolPipe,
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

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');
  private readonly composer = viewChild(ChatComposerComponent);

  readonly historyRailOpen = this.chatUi.historyRailOpen;
  readonly messages = this.chatState.messages;
  readonly isEmpty = this.chatState.isEmpty;
  readonly awaitingReply = this.chatState.awaitingReply;
  readonly activeConversation = this.chatState.activeConversation;
  readonly loadState = this.chatState.state;
  readonly errorKey = this.chatState.errorKey;

  readonly isAdmin = computed(() => this.auth.hasAnyRole(['ROLE_ADMIN']));
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
      this.composer()?.focus();
      this.scrollPending = true;
    });

    this.destroyRef.onDestroy(() => this.openerElement?.focus());
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
    this.composer()?.focus();
  }

  send(text: string): void {
    this.chatSend.send(text, { onSettled: () => (this.scrollPending = true) });
    this.scrollPending = true;
  }

  retry(messageId: string): void {
    this.chatSend.retry(messageId, { onSettled: () => (this.scrollPending = true) });
  }

  useSuggestion(textKey: string): void {
    this.send(this.translate.instant(textKey));
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

  onBackdropClick(): void {
    this.close();
  }

  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // The ingest dialog is on top: let it take its own Escape first.
      if (this.showRagDialog()) return;
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'Tab') {
      this.trapTab(event);
    }
  }

  /** Keep Tab inside the dialog, as a modal requires. */
  private trapTab(event: KeyboardEvent): void {
    const root = this.dialog()?.nativeElement;
    if (!root) return;

    const focusable = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
      element => element.offsetParent !== null || element === document.activeElement,
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }
  }
}
