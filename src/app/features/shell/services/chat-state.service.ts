import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, concatMap, EMPTY, Observable, Subject } from 'rxjs';
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

/**
 * Where an in-flight assistant turn belongs. Carried with the request rather than
 * looked up on arrival: the user is free to open another conversation or start a
 * new chat while a reply is still coming, and the reply must still land in the
 * conversation that asked for it instead of being dropped.
 */
export interface ChatTurnTarget {
  readonly conversationId: string;
  readonly messageId: string;
}

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
  /**
   * True while the thread on screen does not yet match the conversation being
   * opened. Sending during that window would record the turn against the
   * conversation being replaced, and the arriving load would then wipe it.
   *
   * Tracked separately from `_state`, which the conversation LIST owns: a
   * `refresh()` landing mid-selection used to set `ready` and re-enable the
   * composer while the thread was still being fetched.
   */
  readonly switching = computed(() => this._selectionLoading());

  /**
   * Plain (non-signal) field: changing it must not re-trigger the effect below.
   * Seeded from the current claims so the effect's FIRST run is not mistaken for a
   * change of identity — it used to be, which wiped the conversation list that
   * `refresh()` had just loaded, leaving the rail empty until the modal was opened
   * a second time.
   *
   * It tracks TENANT AND SUBJECT together: one person can keep their `sub` across a
   * tenant switch, and leaving the previous tenant's thread in memory would show it
   * under the new one.
   */
  private trackedIdentity: string = identityOf(this.auth.currentUserClaims());
  /**
   * Monotonic token for conversation loads. Two selections can be in flight once
   * the store is server-backed, and the slower one must not overwrite the newer.
   */
  private selectionToken = 0;
  /** The same, for conversation-list loads. */
  private listToken = 0;

  /** True from the moment a conversation is opened until its messages land. */
  private readonly _selectionLoading = signal(false);

  /**
   * Store writes run one at a time, in the order they were issued. Each `persist()`
   * used to start its own chain, so two snapshots could overlap and an older
   * `saveMessages` could land after a newer one — dropping the latest answer. Not
   * reachable with the synchronous local store; guaranteed once it is a server call.
   */
  private readonly writes = new Subject<QueuedWrite>();

  constructor() {
    this.writes
      .pipe(
        // catchError INSIDE the inner observable: on the outer pipe it would
        // complete the whole queue, and every later write in the session would be
        // dropped in silence after one remote failure.
        concatMap(entry =>
          entry.identity === identityOf(this.auth.currentUserClaims())
            ? entry.work().pipe(catchError(() => EMPTY))
            : // The identity that queued this write is gone: running it now would
              // write an old snapshot into the new tenant's namespace, since the
              // store resolves its key when the call runs (ADR-0062).
              EMPTY,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    effect(() => {
      const identity = identityOf(this.auth.currentUserClaims());
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      this.resetForCurrentUser();
    });
  }

  /** Group the conversation list into the buckets the history rail renders. */
  groupsAt(now: Date): readonly ChatHistoryGroup[] {
    return groupConversations(this._conversations(), now);
  }

  /** (Re)load the conversation list for the signed-in user. */
  refresh(): void {
    const token = ++this.listToken;
    const identity = this.trackedIdentity;
    this._state.set('loading');
    this.store
      .listConversations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: conversations => {
          // A list loaded for a previous identity, or superseded by a newer load,
          // must never land: it would show one tenant's history under another.
          if (token !== this.listToken || identity !== this.trackedIdentity) return;
          this.setConversations(conversations);
          this._state.set('ready');
          this._errorKey.set(null);
        },
        error: () => {
          if (token !== this.listToken || identity !== this.trackedIdentity) return;
          this._state.set('error');
          this._errorKey.set('SHELL.CHAT.ERROR.HISTORY_LOAD');
        },
      });
  }

  /** Clear the thread without discarding the stored conversation behind it. */
  startNewConversation(): void {
    // Outranks any load still in flight, so a slow one cannot refill the thread.
    // Its callbacks now return early, so nothing else will clear the flag.
    this.selectionToken += 1;
    this._selectionLoading.set(false);
    this._activeId.set(null);
    this._messages.set([]);
    this._errorKey.set(null);
    this._state.set('ready');
  }

  selectConversation(conversationId: string): void {
    if (this._activeId() === conversationId) return;

    const token = ++this.selectionToken;
    this._selectionLoading.set(true);
    this.store
      .loadMessages(conversationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: messages => {
          if (token !== this.selectionToken) return;
          this._activeId.set(conversationId);
          this._messages.set(messages);
          this._selectionLoading.set(false);
          this._errorKey.set(null);
        },
        error: () => {
          if (token !== this.selectionToken) return;
          this._selectionLoading.set(false);
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

  /** Add the placeholder the typing indicator renders; returns where it belongs. */
  beginAssistantTurn(): ChatTurnTarget | null {
    const conversationId = this._activeId();
    if (!conversationId) return null;

    const messageId = newId();
    this._messages.update(messages => [
      ...messages,
      { id: messageId, role: 'assistant', blocks: [], timestamp: new Date(), pending: true },
    ]);
    return { conversationId, messageId };
  }

  /**
   * Replace a pending turn with its rendered blocks. If the user has since moved to
   * another conversation, the answer is written straight to the one that asked for
   * it rather than dropped on the floor.
   */
  completeAssistantTurn(target: ChatTurnTarget, blocks: readonly ChatBlock[]): void {
    // The conversation being open is not enough: leaving it and coming back
    // reloads it from the store, and a pending turn is never persisted — so the
    // placeholder is gone and the in-place update would match nothing, then
    // persist a thread with no answer in it. Take the stored path in that case.
    const placeholderPresent = this._messages().some(message => message.id === target.messageId);
    if (this._activeId() === target.conversationId && placeholderPresent) {
      this._messages.update(messages =>
        messages.map(message =>
          message.id === target.messageId
            ? { ...message, blocks, pending: false, timestamp: new Date() }
            : message,
        ),
      );
      this.persist();
      return;
    }
    this.completeAwayFromThread(target, blocks);
  }

  /** Land a reply in a conversation the user is no longer looking at. */
  private completeAwayFromThread(target: ChatTurnTarget, blocks: readonly ChatBlock[]): void {
    this.store
      .loadMessages(target.conversationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(stored => {
        // A pending turn is never persisted, so the completed one is appended.
        const messages: readonly ChatMessage[] = [
          ...stored,
          {
            id: target.messageId,
            role: 'assistant',
            blocks,
            timestamp: new Date(),
            pending: false,
          },
        ];

        this.enqueueWrite(() => this.store.saveMessages(target.conversationId, messages));

        // The user may have come back to this conversation while the reply was in
        // flight; if so, the answer belongs on screen and not only in the store.
        if (this._activeId() === target.conversationId) {
          this._messages.set(messages);
        }

        const conversation = this._conversations().find(entry => entry.id === target.conversationId);
        if (!conversation) return;

        const updated: ChatConversation = {
          ...conversation,
          preview: derivePreview(messages),
          updatedAt: new Date(),
        };
        this.setConversations(
          this._conversations().map(entry => (entry.id === updated.id ? updated : entry)),
        );
        this.enqueueWrite(() => this.store.saveConversation(updated));
      });
  }

  /**
   * Put a failed turn back into its pending state, IN PLACE, and return the new
   * message id. Retrying an older turn must not move its answer to the bottom of
   * the thread, under a question that was asked after it.
   */
  restartAssistantTurn(messageId: string): ChatTurnTarget | null {
    const conversationId = this._activeId();
    const index = this._messages().findIndex(message => message.id === messageId);
    if (!conversationId || index < 0) return null;

    const id = newId();
    this._messages.update(messages =>
      messages.map((message, position) =>
        position === index
          ? { id, role: 'assistant' as const, blocks: [], timestamp: new Date(), pending: true }
          : message,
      ),
    );
    return { conversationId, messageId: id };
  }

  /**
   * The question that produced the given assistant turn — the nearest user turn
   * ABOVE it, not the most recent one in the thread. Retrying an older failure
   * must re-ask its own question.
   */
  userTextBefore(messageId: string): string | null {
    const messages = this._messages();
    const index = messages.findIndex(message => message.id === messageId);
    if (index < 0) return null;

    for (let position = index - 1; position >= 0; position -= 1) {
      const message = messages[position];
      if (message.role !== 'user') continue;
      const text = blocksToPlainText(message.blocks).trim();
      return text.length > 0 ? text : null;
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
    this._conversations.update(conversations =>
      conversations.filter(conversation => conversation.id !== conversationId),
    );
    if (this._activeId() === conversationId) {
      this.startNewConversation();
    }
    this.enqueueWrite(() => this.store.deleteConversation(conversationId));
  }

  clearHistory(): void {
    this._conversations.set([]);
    this.startNewConversation();
    this.enqueueWrite(() => this.store.clear());
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
    this.setConversations([conversation, ...this._conversations()]);
  }

  private patchConversation(conversationId: string, patch: Partial<ChatConversation>): void {
    const current = this._conversations().find(conversation => conversation.id === conversationId);
    if (!current) return;

    const updated: ChatConversation = { ...current, ...patch };
    this.setConversations(
      this._conversations().map(entry => (entry.id === conversationId ? updated : entry)),
    );

    // Metadata only: a pin or rename must not touch the stored messages, least of
    // all for a conversation that is not the open one and whose messages are not
    // in memory to write back.
    this.enqueueWrite(() => this.store.saveConversation(updated));
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

    this.setConversations(
      this._conversations().map(entry => (entry.id === updated.id ? updated : entry)),
    );

    this.enqueueWrite(() => this.store.saveConversation(updated));
    this.enqueueWrite(() => this.store.saveMessages(updated.id, messages));
  }

  /** Queue a store write behind everything already issued. */
  /**
   * Newest first. The rail's grouping preserves input order, so a reply landing
   * in an older conversation used to bump its `updatedAt` while leaving it sitting
   * below newer entries until the modal was reopened.
   */
  private setConversations(conversations: readonly ChatConversation[]): void {
    this._conversations.set(
      [...conversations].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    );
  }

  private enqueueWrite(work: () => Observable<unknown>): void {
    const identity = identityOf(this.auth.currentUserClaims());
    // Anything we write is a local change to the list, so a list load already in
    // flight is now stale: it would put back the conversation just deleted, or
    // drop the one just created — and dropping the active one means the reply to
    // it is never persisted, because persist() resolves it through the list.
    this.listToken += 1;
    this.writes.next({ work, identity });
  }

  private resetForCurrentUser(): void {
    // Outrank every load in flight: none of them belong to this identity. Their
    // callbacks return early, so the selection flag has to be cleared here.
    this.selectionToken += 1;
    this.listToken += 1;
    this._selectionLoading.set(false);
    this._conversations.set([]);
    this._messages.set([]);
    this._activeId.set(null);
    this._errorKey.set(null);
    this._state.set('idle');
  }
}

/**
 * `crypto.randomUUID` exists only in a secure context, so on a plain-HTTP LAN or
 * staging host every send would throw. These ids are local correlation keys, never
 * security tokens, so a random fallback is fine.
 */
/** Tenant + subject, the pair that decides whose conversations these are. */
/** A queued store write, tagged with the identity that issued it. */
interface QueuedWrite {
  readonly work: () => Observable<unknown>;
  readonly identity: string;
}

function identityOf(claims: { tid?: string; sub?: string } | null | undefined): string {
  return `${claims?.tid ?? ''}|${claims?.sub ?? ''}`;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
