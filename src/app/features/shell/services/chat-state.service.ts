import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import {
  blocksToPlainText,
  ChatBlock,
  ChatConversation,
  ChatHistoryBucket,
  ChatHistoryGroup,
  ChatMessage,
} from '../models/chat.model';
import { CHAT_HISTORY_STORE } from './chat-history.store';

/** Two-signal page state for the history load (ADR-0031). */
export type ChatLoadState = 'idle' | 'loading' | 'ready' | 'error';

const TITLE_MAX_LENGTH = 48;
const PREVIEW_MAX_LENGTH = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ChatStateService
 * ----------------
 * Signal store for the assistant modal: the conversation list, the active
 * conversation and its messages. Persistence goes through {@link CHAT_HISTORY_STORE},
 * so this service never knows whether history lives on the server or in this browser.
 *
 * In-memory state is dropped when the signed-in subject changes, so one browser
 * shared by two accounts never shows one account's thread to the other.
 */
@Injectable({ providedIn: 'root' })
export class ChatStateService {
  private readonly auth = inject(AuthService);
  private readonly store = inject(CHAT_HISTORY_STORE);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _conversations = signal<readonly ChatConversation[]>([]);
  private readonly _activeId = signal<string | null>(null);
  private readonly _messages = signal<readonly ChatMessage[]>([]);
  private readonly _state = signal<ChatLoadState>('idle');
  private readonly _errorKey = signal<string | null>(null);

  readonly conversations = this._conversations.asReadonly();
  readonly messages = this._messages.asReadonly();
  readonly activeConversationId = this._activeId.asReadonly();
  readonly state = this._state.asReadonly();
  readonly errorKey = this._errorKey.asReadonly();

  readonly isEmpty = computed(() => this._messages().length === 0);
  readonly activeConversation = computed(
    () => this._conversations().find(conversation => conversation.id === this._activeId()) ?? null,
  );
  /** True while the last turn is still streaming in. */
  readonly awaitingReply = computed(() => this._messages().some(message => message.pending));

  /** Plain (non-signal) field: changing it must not re-trigger the effect below. */
  private trackedUserId: string | null = null;

  constructor() {
    effect(() => {
      const userId = this.auth.currentUserClaims()?.sub ?? null;
      if (userId === this.trackedUserId) return;
      this.trackedUserId = userId;
      this.resetForCurrentUser();
    });
  }

  /** Group the conversation list into the buckets the history rail renders. */
  groupsAt(now: Date): readonly ChatHistoryGroup[] {
    return groupConversations(this._conversations(), now);
  }

  /** (Re)load the conversation list for the signed-in user. */
  refresh(): void {
    this._state.set('loading');
    this.store
      .listConversations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: conversations => {
          this._conversations.set(conversations);
          this._state.set('ready');
          this._errorKey.set(null);
        },
        error: () => {
          this._state.set('error');
          this._errorKey.set('SHELL.CHAT.ERROR.HISTORY_LOAD');
        },
      });
  }

  /** Clear the thread without discarding the stored conversation behind it. */
  startNewConversation(): void {
    this._activeId.set(null);
    this._messages.set([]);
    this._errorKey.set(null);
    this._state.set('ready');
  }

  selectConversation(conversationId: string): void {
    if (this._activeId() === conversationId) return;

    this._state.set('loading');
    this.store
      .loadMessages(conversationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: messages => {
          this._activeId.set(conversationId);
          this._messages.set(messages);
          this._state.set('ready');
          this._errorKey.set(null);
        },
        error: () => {
          this._state.set('error');
          this._errorKey.set('SHELL.CHAT.ERROR.HISTORY_LOAD');
        },
      });
  }

  /** Record the user's turn, opening a conversation if this is the first one. */
  appendUserMessage(text: string): ChatMessage {
    const message: ChatMessage = {
      id: newId(),
      role: 'user',
      blocks: [{ kind: 'text', text }],
      timestamp: new Date(),
      pending: false,
    };

    this.ensureConversation(text);
    this._messages.update(messages => [...messages, message]);
    this.persist();
    return message;
  }

  /** Add the placeholder the typing indicator renders; returns its message id. */
  beginAssistantTurn(): string {
    const id = newId();
    this._messages.update(messages => [
      ...messages,
      { id, role: 'assistant', blocks: [], timestamp: new Date(), pending: true },
    ]);
    return id;
  }

  /** Replace a pending turn with its rendered blocks and persist the conversation. */
  completeAssistantTurn(messageId: string, blocks: readonly ChatBlock[]): void {
    this._messages.update(messages =>
      messages.map(message =>
        message.id === messageId ? { ...message, blocks, pending: false, timestamp: new Date() } : message,
      ),
    );
    this.persist();
  }

  /** Remove a turn outright — used when a send is retried from the same prompt. */
  discardMessage(messageId: string): void {
    this._messages.update(messages => messages.filter(message => message.id !== messageId));
  }

  /** The text of the most recent user turn, for the retry action. */
  lastUserText(): string | null {
    for (let index = this._messages().length - 1; index >= 0; index -= 1) {
      const message = this._messages()[index];
      if (message.role === 'user') {
        const text = blocksToPlainText(message.blocks).trim();
        return text.length > 0 ? text : null;
      }
    }
    return null;
  }

  renameConversation(conversationId: string, title: string): void {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    this.patchConversation(conversationId, { title: trimmed.slice(0, TITLE_MAX_LENGTH) });
  }

  togglePinned(conversationId: string): void {
    const current = this._conversations().find(conversation => conversation.id === conversationId);
    if (!current) return;
    this.patchConversation(conversationId, { pinned: !current.pinned });
  }

  deleteConversation(conversationId: string): void {
    this.store
      .deleteConversation(conversationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this._conversations.update(conversations =>
          conversations.filter(conversation => conversation.id !== conversationId),
        );
        if (this._activeId() === conversationId) {
          this.startNewConversation();
        }
      });
  }

  clearHistory(): void {
    this.store
      .clear()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this._conversations.set([]);
        this.startNewConversation();
      });
  }

  private ensureConversation(firstUserText: string): void {
    if (this._activeId() !== null) return;

    const now = new Date();
    const conversation: ChatConversation = {
      id: newId(),
      title: deriveTitle(firstUserText),
      preview: '',
      createdAt: now,
      updatedAt: now,
      pinned: false,
    };

    this._activeId.set(conversation.id);
    this._conversations.update(conversations => [conversation, ...conversations]);
  }

  private patchConversation(conversationId: string, patch: Partial<ChatConversation>): void {
    const current = this._conversations().find(conversation => conversation.id === conversationId);
    if (!current) return;

    const updated: ChatConversation = { ...current, ...patch };
    this._conversations.update(conversations =>
      conversations.map(conversation => (conversation.id === conversationId ? updated : conversation)),
    );

    const messages = this._activeId() === conversationId ? this._messages() : [];
    this.store
      .saveConversation(updated, messages)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  /** Write the active conversation and its messages through to the store. */
  private persist(): void {
    const active = this.activeConversation();
    if (!active) return;

    const messages = this._messages().filter(message => !message.pending);
    const updated: ChatConversation = {
      ...active,
      preview: derivePreview(messages),
      updatedAt: new Date(),
    };

    this._conversations.update(conversations =>
      conversations.map(conversation => (conversation.id === updated.id ? updated : conversation)),
    );

    this.store
      .saveConversation(updated, messages)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  private resetForCurrentUser(): void {
    this._conversations.set([]);
    this._messages.set([]);
    this._activeId.set(null);
    this._errorKey.set(null);
    this._state.set('idle');
  }
}

function newId(): string {
  return crypto.randomUUID();
}

/** First line of the opening question, clipped on a word boundary. */
export function deriveTitle(text: string): string {
  const firstLine = text.trim().split('\n')[0].trim();
  if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine;

  const clipped = firstLine.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > TITLE_MAX_LENGTH / 2 ? clipped.slice(0, lastSpace) : clipped).trimEnd() + '…';
}

/** First line of the latest assistant turn, for the history rail. */
export function derivePreview(messages: readonly ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;
    const text = blocksToPlainText(message.blocks).trim().split('\n')[0].trim();
    if (text.length === 0) continue;
    return text.length <= PREVIEW_MAX_LENGTH ? text : `${text.slice(0, PREVIEW_MAX_LENGTH)}…`;
  }
  return '';
}

/** Bucket conversations by recency, pinned ones first. Empty buckets are dropped. */
export function groupConversations(
  conversations: readonly ChatConversation[],
  now: Date,
): readonly ChatHistoryGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const order: readonly ChatHistoryBucket[] = ['pinned', 'today', 'yesterday', 'previous7Days', 'older'];

  return order
    .map(bucket => ({
      bucket,
      conversations: conversations.filter(conversation => bucketOf(conversation, startOfToday) === bucket),
    }))
    .filter(group => group.conversations.length > 0);
}

function bucketOf(conversation: ChatConversation, startOfToday: number): ChatHistoryBucket {
  if (conversation.pinned) return 'pinned';

  const updated = conversation.updatedAt.getTime();
  if (updated >= startOfToday) return 'today';
  if (updated >= startOfToday - DAY_MS) return 'yesterday';
  if (updated >= startOfToday - 7 * DAY_MS) return 'previous7Days';
  return 'older';
}
