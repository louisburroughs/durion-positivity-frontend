import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ChatConversation, ChatHistoryBucket, ChatHistoryGroup } from '../../models/chat.model';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';
import { CHAT_HISTORY_STORE } from '../../services/chat-history.store';
import { ChatStateService, groupConversations } from '../../services/chat-state.service';

/** Where focus goes when a control is swapped out from under it. */
const ROW_CONFIRM_SELECTOR = '[data-confirm="delete"]';
const CLEAR_CONFIRM_SELECTOR = '[data-confirm="clear-all"]';
const NEW_CHAT_SELECTOR = '.new-chat-btn';
/** How often "today" is re-evaluated so a rail left open across local midnight
 *  re-buckets without a page reload (ADR-0038 §6). */
const TODAY_REFRESH_MS = 60_000;

/** Day-bucket → section heading key. */
const GROUP_LABEL_KEYS: Readonly<Record<ChatHistoryBucket, string>> = {
  pinned: 'SHELL.CHAT.HISTORY.GROUP.PINNED',
  today: 'SHELL.CHAT.HISTORY.GROUP.TODAY',
  yesterday: 'SHELL.CHAT.HISTORY.GROUP.YESTERDAY',
  previous7Days: 'SHELL.CHAT.HISTORY.GROUP.PREVIOUS_7_DAYS',
  older: 'SHELL.CHAT.HISTORY.GROUP.OLDER',
};

/**
 * ChatHistoryRailComponent
 * ------------------------
 * Past conversations, grouped by day with pinned ones first: search, open,
 * rename, pin and delete, plus the control that starts a fresh conversation.
 *
 * Destructive actions are two-step — the first click arms, the second confirms —
 * because a conversation cannot be recovered once the store drops it.
 */
@Component({
  selector: 'app-chat-history-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MaterialSymbolPipe],
  templateUrl: './chat-history-rail.component.html',
  styleUrl: './chat-history-rail.component.css',
})
export class ChatHistoryRailComponent {
  private readonly chatState = inject(ChatStateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly historyStore = inject(CHAT_HISTORY_STORE);
  private readonly destroyRef = inject(DestroyRef);

  /** Emitted after any action that should close the rail on a narrow viewport. */
  readonly conversationOpened = output<void>();

  readonly search = signal('');
  readonly renamingId = signal<string | null>(null);
  readonly renameDraft = signal('');
  readonly confirmingDeleteId = signal<string | null>(null);
  readonly confirmingClearAll = signal(false);

  /**
   * Held as a signal and refreshed on a timer rather than read once at
   * construction, so a rail left open across a local midnight rollover
   * re-buckets "today"/"yesterday" without needing a page reload (ADR-0038 §6).
   */
  private readonly now = signal(new Date());

  /**
   * Where this store keeps history — the store's own claim, not a hardcoded one.
   * Non-optional on the contract, so there is no fallback: a default here would
   * render "Kept in this browser." over a server-backed store, and the only thing
   * it ever protected was a test double that did not implement the interface
   * (ADR-0032).
   */
  readonly retentionNoteKey = this.historyStore.retentionNoteKey;

  readonly activeConversationId = this.chatState.activeConversationId;
  readonly hasConversations = computed(() => this.chatState.conversations().length > 0);

  readonly groups = computed<readonly ChatHistoryGroup[]>(() => {
    const term = this.search().trim().toLowerCase();
    const matching =
      term.length === 0
        ? this.chatState.conversations()
        : this.chatState
            .conversations()
            .filter(
              conversation =>
                conversation.title.toLowerCase().includes(term) ||
                conversation.preview.toLowerCase().includes(term),
            );
    return groupConversations(matching, this.now());
  });

  readonly noMatches = computed(() => this.hasConversations() && this.groups().length === 0);

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), TODAY_REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  groupLabelKey(bucket: ChatHistoryBucket): string {
    return GROUP_LABEL_KEYS[bucket];
  }

  newChat(): void {
    this.chatState.startNewConversation();
    this.resetRowState();
    this.conversationOpened.emit();
  }

  open(conversation: ChatConversation): void {
    this.chatState.selectConversation(conversation.id);
    this.resetRowState();
    this.conversationOpened.emit();
  }

  startRename(conversation: ChatConversation): void {
    this.confirmingDeleteId.set(null);
    this.renamingId.set(conversation.id);
    this.renameDraft.set(conversation.title);
    // The rename button it replaces had focus; without this, focus lands on <body>
    // and a keyboard user has to hunt for the field they just opened.
    this.focusAfterRender(`[id="rename-${escapeAttributeValue(conversation.id)}"]`);
  }

  /** Save and close the editor. Called on blur too, so it never moves focus itself. */
  commitRename(): void {
    const id = this.renamingId();
    if (id) {
      this.chatState.renameConversation(id, this.renameDraft());
    }
    this.cancelRename();
  }

  cancelRename(): void {
    this.renamingId.set(null);
    this.renameDraft.set('');
  }

  onRenameKeydown(event: KeyboardEvent): void {
    const id = this.renamingId();
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitRename();
      if (id) this.restoreFocusTo(id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelRename();
      if (id) this.restoreFocusTo(id);
    }
  }

  /**
   * Pinning/unpinning re-buckets the row into another `@for` group, tearing
   * down the button that had focus and rebuilding it elsewhere — the same
   * `<body>`-drop every other row action here already guards against.
   */
  togglePinned(conversation: ChatConversation): void {
    this.chatState.togglePinned(conversation.id);
    this.focusAfterRender(`[data-pin-for="${escapeAttributeValue(conversation.id)}"]`);
  }

  armDelete(conversation: ChatConversation): void {
    this.cancelRename();
    this.confirmingDeleteId.set(conversation.id);
    this.focusAfterRender(ROW_CONFIRM_SELECTOR);
  }

  confirmDelete(conversation: ChatConversation): void {
    this.chatState.deleteConversation(conversation.id);
    this.confirmingDeleteId.set(null);
    // The row and its buttons are gone, so there is nothing to restore focus to.
    this.focusAfterRender(NEW_CHAT_SELECTOR);
  }

  cancelDelete(): void {
    const id = this.confirmingDeleteId();
    this.confirmingDeleteId.set(null);
    if (id) this.restoreFocusTo(id);
  }

  armClearAll(): void {
    this.confirmingClearAll.set(true);
    this.focusAfterRender(CLEAR_CONFIRM_SELECTOR);
  }

  confirmClearAll(): void {
    this.chatState.clearHistory();
    this.confirmingClearAll.set(false);
    this.focusAfterRender(NEW_CHAT_SELECTOR);
  }

  cancelClearAll(): void {
    this.confirmingClearAll.set(false);
    this.focusAfterRender(NEW_CHAT_SELECTOR);
  }

  /**
   * Escape in the search field clears it rather than closing the whole dialog —
   * the field is the nearest thing that has state to dismiss. Only an already-empty
   * field lets the key through.
   */
  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || this.search().length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.search.set('');
  }

  /**
   * A row's controls live behind an `@if`, so confirming or cancelling REMOVES the
   * button that had focus and the browser drops focus to `<body>` — outside the
   * dialog, past its trap. Put focus back on the row.
   */
  private restoreFocusTo(conversationId: string): void {
    this.focusAfterRender(`[data-conversation="${escapeAttributeValue(conversationId)}"]`);
  }

  /**
   * Every arm/confirm/cancel step swaps one set of controls for another, so the
   * element that had focus stops existing and the browser drops focus to `<body>`
   * — outside the dialog and past its trap. Move it to whatever replaced it.
   */
  private focusAfterRender(selector: string): void {
    setTimeout(() => {
      const element = this.host.nativeElement as HTMLElement;
      element.querySelector<HTMLElement>(selector)?.focus();
    });
  }

  private resetRowState(): void {
    this.cancelRename();
    this.confirmingDeleteId.set(null);
    this.confirmingClearAll.set(false);
  }
}

/**
 * Quote a value for use inside an attribute selector. `CSS.escape` is not defined
 * in every environment this component runs in (it is absent under the test
 * runner), and it threw from inside a `setTimeout` where nothing reported it —
 * so focus restoration silently did nothing.
 */
function escapeAttributeValue(value: string): string {
  return value.replace(/["\\]/g, character => `\\${character}`);
}
