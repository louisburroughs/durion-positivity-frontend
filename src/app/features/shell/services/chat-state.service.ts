import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, concat, concatMap, EMPTY, Observable, Subject, tap, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { logger } from '../../../core/utils/logger';
import {
  blocksToDisplayText,
  ChatBlock,
  ChatConversation,
  ChatHistoryBucket,
  ChatHistoryGroup,
  ChatMessage,
} from '../models/chat.model';
import { identityKey } from '../utils/identity.util';
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
  /**
   * Who was signed in when the turn was opened. A reply can settle after the
   * account or tenant has changed, and both completion paths resolve the store
   * against whoever is signed in NOW — so an old answer would be read from, and
   * written into, the new identity's namespace (ADR-0062).
   */
  readonly identity: string;
  /**
   * The failed turn this one replaces, for a retry. `restartAssistantTurn` swaps
   * the message in memory only, so the store still holds the error: without this
   * the away path would append the answer beneath it.
   */
  readonly replacesMessageId?: string;
  /**
   * The user turn this answer replies to — the insertion anchor for the away path,
   * captured at issue time.
   *
   * A pending placeholder is never persisted, so a reply that arrives after the
   * user left the thread and came back finds NEITHER `messageId` nor
   * `replacesMessageId` in the stored snapshot. Appending it then put the answer
   * below every later turn: ask Q1, leave, come back, ask Q2, and Q1's answer
   * landed under Q2, answering a question it had never seen. The question itself
   * IS persisted, so it is the one id the merge can still find (ADR-0063 §1: the
   * result carries what it was requested for).
   */
  readonly questionMessageId?: string;
}

/**
 * Scope of a write that covers the whole history rather than one conversation
 * (`clear()`). A conversation id is a UUID, so nothing can collide with it.
 */
const WHOLE_STORE = '*';

const TITLE_MAX_LENGTH = 48;
const PREVIEW_MAX_LENGTH = 90;

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
  /**
   * What is NOT persisted: the scope of every write that did not land — a
   * conversation's id, or {@link WHOLE_STORE} for a write over the whole history.
   *
   * Per scope, not one flag for the session: the warning used to be cleared by ANY
   * later successful write, so a refused save in conversation A disappeared the
   * moment a brand new conversation B saved — while A was still only in memory and
   * still about to be lost (ADR-0064 §1: the outcome is kept until it stops being
   * true). An entry leaves only when a later write for THAT scope reports success,
   * or when the session ends.
   *
   * The write queue is the only writer that adds or removes an entry;
   * `resetForCurrentUser()` empties it, because an identity change discards the
   * state the warning was about along with everything else (ADR-0063 §7).
   */
  private readonly _unpersisted = signal<readonly string[]>([]);

  readonly conversations = this._conversations.asReadonly();
  readonly messages = this._messages.asReadonly();
  readonly activeConversationId = this._activeId.asReadonly();
  readonly state = this._state.asReadonly();
  readonly errorKey = this._errorKey.asReadonly();
  /**
   * Derived, never written directly: anything unpersisted means the warning is
   * true, and an empty set means there is nothing left to warn about. Deliberately
   * SEPARATE from the two-signal pair above — losing the persisted copy does not
   * stop the conversation on screen, so it is reported without taking the thread
   * down (ADR-0031 §4 shape).
   */
  readonly persistenceErrorKey = computed(() =>
    this._unpersisted().length > 0 ? 'SHELL.CHAT.ERROR.PERSIST' : null,
  );

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

  /**
   * Bumped by every local write. A list load that started earlier carries a
   * snapshot from before it, so its DATA is stale — but unlike a superseded load
   * it still owns the loading state, and must clear it or the rail spins forever.
   */
  private listInvalidated = 0;

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
        concatMap(entry => {
          if (entry.identity !== this.currentIdentity()) {
            // The identity that queued this write is gone: running it now would
            // write an old snapshot into the new tenant's namespace, since the
            // store resolves its key when the call runs (ADR-0062).
            return EMPTY;
          }
          // Whether the store REPORTED the write done. Completion alone is not
          // success: an `Observable<void>` that completes without emitting says
          // "nothing to report", not "saved" — a queue slot whose own guard
          // refuses the work mid-flight (`landStoredAnswer` after an identity
          // change) and a store whose write resolves without confirming both
          // arrive here, and reading either as a landed write clears a warning
          // that is still true.
          let reported = false;
          return entry.work().pipe(
            tap({
              next: () => {
                reported = true;
              },
              complete: () => {
                // A write the store reported as done clears the failure for ITS OWN
                // scope — a save in one conversation says nothing about another's.
                // Reads leave the set alone: they never claimed anything was
                // persisted — and neither does a write whose session has since
                // ended (see {@link speaksForCurrentSession}).
                if (entry.scope && reported && this.speaksForCurrentSession(entry)) {
                  this.markPersisted(entry.scope);
                }
              },
            }),
            catchError(() => {
              // The queue stays alive — catchError on the OUTER pipe would
              // complete it and drop every later write in the session — but the
              // failure is recorded rather than swallowed (ADR-0065 §6).
              // Reads report through their own catchError and never reach here,
              // and neither does a write belonging to a session that has ended:
              // that failure is not the current user's to see.
              if (entry.scope && this.speaksForCurrentSession(entry)) {
                this.markUnpersisted(entry.scope);
              }
              return EMPTY;
            }),
          );
        }),
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
    const stamp = this.listInvalidated;
    const identity = this.trackedIdentity;
    this._state.set('loading');
    // Queued, not issued directly: a read that overtakes a write still sitting in
    // the queue comes back without the conversation that write created, and
    // replacing the list with it drops the active conversation — after which
    // `persist()` cannot resolve it and the next reply is never saved.
    this.enqueue(() =>
      this.store.listConversations().pipe(
        tap(conversations => {
          // A list loaded for a previous identity, or superseded by a newer load,
          // must never land: it would show one tenant's history under another.
          if (token !== this.listToken || identity !== this.trackedIdentity) return;
          if (stamp !== this.listInvalidated) {
            // A local write happened after this load began. Keep the in-memory
            // list, which is the newer of the two, but finish the load.
            this._state.set('ready');
            this._errorKey.set(null);
            return;
          }
          this.setConversations(conversations);
          this._state.set('ready');
          this._errorKey.set(null);
        }),
        catchError(() => {
          if (token === this.listToken && identity === this.trackedIdentity) {
            this._state.set('error');
            this._errorKey.set('SHELL.CHAT.ERROR.HISTORY_LOAD');
          }
          // Swallowed so one failed list load cannot take the queue down.
          return EMPTY;
        }),
      ),
    );
  }

  /** Clear the thread without discarding the stored conversation behind it. */
  startNewConversation(): void {
    // Outranks any load still in flight, so a slow one cannot refill the thread.
    // Its callbacks now return early, so nothing else will clear the flag.
    this.selectionToken += 1;
    this._selectionLoading.set(false);
    this._activeId.set(null);
    this._messages.set([]);
    // state first, in BOTH directions: a template reading `state() === 'error'`
    // and `errorKey()` in the same frame must never see them disagree (ADR-0031 §5).
    this._state.set('ready');
    this._errorKey.set(null);
  }

  selectConversation(conversationId: string): void {
    if (this._activeId() === conversationId) {
      // Clicking the conversation you are LEAVING while another is opening is a
      // cancellation, not a no-op: the pending switch is abandoned and the thread
      // on screen stays the one the composer is already writing into.
      if (this._selectionLoading()) {
        this.selectionToken += 1;
        this._selectionLoading.set(false);
      }
      return;
    }

    const token = ++this.selectionToken;
    const identity = this.currentIdentity();
    this._selectionLoading.set(true);
    // Queued, like every other store call: read directly, a selection can overtake
    // a `saveMessages` still sitting in the queue and come back with the snapshot
    // from before it — showing a thread that is missing the turn just sent
    // (ADR-0063 §1: the read settles behind the writes issued before it).
    this.enqueue(() =>
      this.store.loadMessages(conversationId).pipe(
        tap(messages => {
          // Superseded by a newer selection, or issued by an identity that has
          // since been replaced: either way this answer is not for this screen.
          if (token !== this.selectionToken || identity !== this.currentIdentity()) return;
          // A `refresh()` that landed while this load was open may no longer carry
          // the conversation — deleted in another tab, gone from the server, or
          // dropped by the store's own budget. Committing it anyway put `_activeId`
          // on an id `activeConversation()` cannot resolve, so `persist()` returned
          // early and every later turn in that thread went unsaved (ADR-0063 §1:
          // the result is reconciled against the state it lands in — the same
          // check `setConversations()` makes for the thread already open).
          if (!this._conversations().some(entry => entry.id === conversationId)) {
            this._selectionLoading.set(false);
            // The clean outcome the list reconciliation leaves behind: no thread,
            // so the next question opens a fresh conversation that can be saved.
            // Silent by design — the load itself did not fail and the row is
            // already gone from the rail, so a banner would claim something untrue
            // (ADR-0064 §4). Any earlier failure is cleared, state first
            // (ADR-0031 §5).
            this._activeId.set(null);
            this._messages.set([]);
            this.clearHistoryError();
            return;
          }
          this._activeId.set(conversationId);
          this._messages.set(messages);
          this._selectionLoading.set(false);
          // A successful load leaves no error behind it — state first (ADR-0031 §5).
          this.clearHistoryError();
        }),
        catchError(() => {
          if (token === this.selectionToken && identity === this.currentIdentity()) {
            // Drop the thread we were leaving. Keeping it would leave `_activeId`
            // on the previous conversation while the screen reports a failure for
            // another, and the next question would be written into the old one.
            this._activeId.set(null);
            this._messages.set([]);
            this._selectionLoading.set(false);
            this._state.set('error');
            this._errorKey.set('SHELL.CHAT.ERROR.HISTORY_LOAD');
          }
          // Swallowed so one failed selection cannot take the queue down.
          return EMPTY;
        }),
      ),
    );
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

    // A new turn supersedes a failed history load: the thread is working again,
    // so the error banner must not stay on screen over it (ADR-0031 §5 — state
    // moves off 'error' BEFORE the key is cleared).
    this.clearHistoryError();
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
    // Captured BEFORE the placeholder is appended, so it cannot pick it up: the
    // question this turn answers is the last user turn in the thread.
    const questionMessageId = lastUserMessageId(this._messages());
    this._messages.update(messages => [
      ...messages,
      { id: messageId, role: 'assistant', blocks: [], timestamp: new Date(), pending: true },
    ]);
    return { conversationId, messageId, identity: this.currentIdentity(), questionMessageId };
  }

  /**
   * Replace a pending turn with its rendered blocks. If the user has since moved to
   * another conversation, the answer is written straight to the one that asked for
   * it rather than dropped on the floor.
   */
  completeAssistantTurn(target: ChatTurnTarget, blocks: readonly ChatBlock[]): void {
    // The turn belongs to a session that has since ended. Landing it now would
    // read and write another tenant's history under a conversation id that may
    // even collide.
    if (target.identity !== this.currentIdentity()) return;

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

  /**
   * Land a reply in a conversation whose thread is not the one on screen — or is,
   * but no longer holds the placeholder because it was reloaded from the store.
   *
   * Runs THROUGH the write queue: a direct read could overtake the `saveMessages`
   * that `appendUserMessage` queued, come back with the pre-send snapshot, and
   * then be written back over it — losing the question the answer replies to.
   */
  private completeAwayFromThread(target: ChatTurnTarget, blocks: readonly ChatBlock[]): void {
    const answer: ChatMessage = {
      id: target.messageId,
      role: 'assistant',
      blocks,
      timestamp: new Date(),
      pending: false,
    };

    // The load AND the write it feeds occupy ONE slot in the queue, so nothing can
    // be written between them. Reading first and queueing the write afterwards
    // sent a snapshot taken before every write issued since — which then landed on
    // top of them, erasing turns that had already been saved (ADR-0063 §1: the
    // result is merged against the state it will actually be written over).
    this.enqueueWrite(target.conversationId, () =>
      this.store.loadMessages(target.conversationId).pipe(
        // Rethrown, not swallowed: the queue's own handler keeps the queue alive
        // (one failure must not drop every later write) AND records that this
        // reply was not persisted. Returning EMPTY here reported a successful
        // write for a reply that never reached the store. Placed BEFORE the merge,
        // so a failed WRITE lands in the same handler for the same reason.
        catchError((error: unknown) => {
          logger.error('chat: could not load the conversation to persist a reply');
          return throwError(() => error);
        }),
        concatMap(stored => this.landStoredAnswer(target, stored, answer)),
      ),
    );
  }

  /**
   * Merge an answer into the conversation's current stored state and write it
   * back. Returns the store writes so they run inside the caller's queue slot.
   */
  private landStoredAnswer(
    target: ChatTurnTarget,
    stored: readonly ChatMessage[],
    answer: ChatMessage,
  ): Observable<unknown> {
    // Checked AGAIN, here, not only in `completeAssistantTurn` and at the head of
    // the queue: both of those run before `loadMessages` resolves, so a tenant or
    // account change while it was in flight would still land the previous
    // session's answer — and `stored` was read from the new namespace (ADR-0062).
    if (target.identity !== this.currentIdentity()) return EMPTY;

    const messages = withAnswer(stored, target, answer);

    // If the user is back in this conversation, merge into the LIVE thread rather
    // than replacing it: the thread may hold turns that are not in `stored` yet —
    // a question asked since, and its pending placeholder.
    if (this._activeId() === target.conversationId) {
      this._messages.update(current => withAnswer(current, target, answer));
    }

    const save = this.store.saveMessages(target.conversationId, messages);
    const conversation = this._conversations().find(entry => entry.id === target.conversationId);
    if (!conversation) return save;

    const updated: ChatConversation = {
      ...conversation,
      preview: derivePreview(messages),
      updatedAt: new Date(),
    };
    this.setConversations(
      this._conversations().map(entry => (entry.id === updated.id ? updated : entry)),
    );
    return concat(save, this.store.saveConversation(updated));
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
    return {
      conversationId,
      messageId: id,
      identity: this.currentIdentity(),
      replacesMessageId: messageId,
      // The question this turn answers is the nearest user turn ABOVE it, not the
      // newest one in the thread — the same rule `userTextBefore` re-asks with.
      questionMessageId: lastUserMessageId(this._messages().slice(0, index)),
    };
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
      // The DISPLAY projection: this text is re-sent to the model, so the
      // apostrophe `blocksToPlainText` prefixes onto a spreadsheet-bound value
      // would be re-asked as part of the question (ADR-0065 §3 scopes that guard
      // to the clipboard and CSV paths).
      const text = blocksToDisplayText(message.blocks).trim();
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
    this.enqueueWrite(conversationId, () => this.store.deleteConversation(conversationId));
  }

  clearHistory(): void {
    this._conversations.set([]);
    this.startNewConversation();
    // Scoped to the whole store: clearing it successfully means nothing is left
    // unpersisted, whichever conversation an earlier failure belonged to.
    this.enqueueWrite(WHOLE_STORE, () => this.store.clear());
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
    this.enqueueWrite(updated.id, () => this.store.saveConversation(updated));
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

    this.enqueueWrite(updated.id, () => this.store.saveConversation(updated));
    this.enqueueWrite(updated.id, () => this.store.saveMessages(updated.id, messages));
  }

  /**
   * Newest first. The rail's grouping preserves input order, so a reply landing
   * in an older conversation used to bump its `updatedAt` while leaving it sitting
   * below newer entries until the modal was reopened.
   */
  private setConversations(conversations: readonly ChatConversation[]): void {
    this._conversations.set(
      [...conversations].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    );

    // The active conversation must exist in the list: `persist()` resolves it
    // THROUGH the list, so a refreshed list that no longer carries it left every
    // later turn silently unsaved. Three ways it can go missing: deleted in
    // another tab, gone from the server, or never persisted at all because the
    // store refused the write that would have created it — and in that last case
    // the PERSIST warning is already on screen when this reconciliation drops the
    // thread, so the loss is reported rather than silent. Drop the thread, so the
    // next question opens a fresh one.
    const active = this._activeId();
    if (active !== null && !conversations.some(entry => entry.id === active)) {
      this._activeId.set(null);
      this._messages.set([]);
    }
  }

  /**
   * Whether this entry's outcome may still touch `persistenceErrorKey`.
   *
   * The head-of-queue check only proves the identity was current when the work
   * STARTED. A write issued under one account or tenant can settle after the
   * switch — it is the entry that was already in flight — and its outcome belongs
   * to a session that no longer exists: a success would clear a warning raised by
   * the NEW session's own writes, and a failure would put a warning over a thread
   * that is persisting perfectly well (ADR-0063 §7 — an identity change discards
   * the previous session's state; ADR-0062 — the two sessions' data never mix).
   * `resetForCurrentUser()` has already cleared whatever the old session had to
   * say, so there is nothing left to report for it.
   */
  private speaksForCurrentSession(entry: QueuedWrite): boolean {
    return entry.identity === this.currentIdentity();
  }

  /**
   * Who is signed in right now. Read from the claims rather than the tracked
   * field, which only catches up when the reset effect runs — a turn settling
   * before that would have been judged against the previous identity.
   */
  private currentIdentity(): string {
    return identityOf(this.auth.currentUserClaims());
  }

  /**
   * Leave the error state, in the required order: `state` moves off `'error'`
   * first, then the key is cleared (ADR-0031 §5).
   */
  private clearHistoryError(): void {
    if (this._state() !== 'error' && this._errorKey() === null) return;
    this._state.set('ready');
    this._errorKey.set(null);
  }

  /** Join the queue behind everything already issued, without invalidating anything. */
  private enqueue(work: () => Observable<unknown>): void {
    this.writes.next({ work, identity: this.currentIdentity(), kind: 'read' });
  }

  /**
   * Queue a write, tagged with WHAT it is responsible for persisting: the
   * conversation's id, or {@link WHOLE_STORE}. The tag is what lets a failure be
   * reported for that conversation alone and cleared by that conversation's own
   * next successful write.
   */
  private enqueueWrite(scope: string, work: () => Observable<unknown>): void {
    // Anything we write is a local change to the list, so a list load already in
    // flight is now stale: it would put back the conversation just deleted, or
    // drop the one just created — and dropping the active one means the reply to
    // it is never persisted, because persist() resolves it through the list.
    this.listInvalidated += 1;
    this.writes.next({ work, identity: this.currentIdentity(), kind: 'write', scope });
  }

  /** One writer: the queue. A scope whose write did not land joins the set. */
  private markUnpersisted(scope: string): void {
    this._unpersisted.update(scopes => (scopes.includes(scope) ? scopes : [...scopes, scope]));
  }

  /**
   * A scope whose write landed leaves the set. A successful whole-store write
   * empties it: there is nothing left in storage for an older failure to be about.
   */
  private markPersisted(scope: string): void {
    if (scope === WHOLE_STORE) {
      this._unpersisted.set([]);
      return;
    }
    this._unpersisted.update(scopes => scopes.filter(entry => entry !== scope));
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
    this._unpersisted.set([]);
    // state first, then the key — the same order as every other transition here.
    this._state.set('idle');
    this._errorKey.set(null);
  }
}

/** A queued store call, tagged with the identity that issued it. */
interface QueuedWrite {
  readonly work: () => Observable<unknown>;
  readonly identity: string;
  /**
   * Only a write can fail to PERSIST something; a read reports its own failure
   * through the error state. The queue uses this to decide whether a failure
   * belongs on `persistenceErrorKey`.
   */
  readonly kind: 'read' | 'write';
  /**
   * What this write is responsible for: the conversation's id, or
   * {@link WHOLE_STORE}. Reads carry none, which is also how the queue tells that
   * an outcome has nothing to say about persistence.
   */
  readonly scope?: string;
}

/**
 * Tenant + subject, the pair that decides whose conversations these are, with
 * both halves encoded so no claim value can forge another identity's key
 * (see `identity.util.ts`).
 */
function identityOf(claims: { tid?: string; sub?: string } | null | undefined): string {
  return identityKey(claims);
}

/**
 * Put `answer` where the turn it answers sits, replacing that turn (the pending
 * placeholder, or the failure a retry replaces) in place. Appending instead moved
 * a retried answer below questions asked after it, and a reply that arrived while
 * the user was away lost its position in the thread entirely.
 */
function withAnswer(
  messages: readonly ChatMessage[],
  target: ChatTurnTarget,
  answer: ChatMessage,
): readonly ChatMessage[] {
  const superseded = new Set(
    [target.messageId, target.replacesMessageId].filter((id): id is string => !!id),
  );
  const index = messages.findIndex(message => superseded.has(message.id));
  if (index < 0) return afterQuestion(messages, target, answer);

  const keep = (message: ChatMessage): boolean => !superseded.has(message.id);
  return [
    ...messages.slice(0, index).filter(keep),
    answer,
    ...messages.slice(index + 1).filter(keep),
  ];
}

/**
 * Neither the placeholder nor the retried turn is in this snapshot — the
 * placeholder was never persisted and the user has been away — so the answer goes
 * directly BELOW the question it replies to, which is persisted. Appending instead
 * put it under every turn asked since, where it read as the answer to the newest
 * question (ADR-0063 §1).
 *
 * Only a snapshot that has lost the question too falls back to appending: there is
 * no position left to reconstruct, and dropping the answer entirely would lose the
 * reply the user is waiting for.
 */
function afterQuestion(
  messages: readonly ChatMessage[],
  target: ChatTurnTarget,
  answer: ChatMessage,
): readonly ChatMessage[] {
  const anchor = target.questionMessageId
    ? messages.findIndex(message => message.id === target.questionMessageId)
    : -1;
  if (anchor < 0) return [...messages, answer];
  return [...messages.slice(0, anchor + 1), answer, ...messages.slice(anchor + 1)];
}

/** Id of the newest user turn in the given slice, or `undefined` if it has none. */
function lastUserMessageId(messages: readonly ChatMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messages[index].id;
  }
  return undefined;
}

/** Monotonic suffix for the no-Web-Crypto last resort in `newId`. */
let idCounter = 0;

/**
 * `crypto.randomUUID` exists only in a secure context, so on a plain-HTTP LAN or
 * staging host every send would throw. The fallback still draws from the CSPRNG:
 * `crypto.getRandomValues` is available outside secure contexts too. The last
 * resort (no Web Crypto at all) only covers exotic runtimes; these ids are local
 * correlation keys, never security tokens.
 */
function newId(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      return `id-${Date.now().toString(36)}-${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return `id-${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

/** First line of the opening question, clipped on a word boundary. */
export function deriveTitle(text: string): string {
  const firstLine = text.trim().split('\n')[0].trim();
  if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine;

  const clipped = firstLine.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > TITLE_MAX_LENGTH / 2 ? clipped.slice(0, lastSpace) : clipped).trimEnd() + '…';
}

/**
 * First line of the latest assistant turn, for the history rail.
 *
 * The DISPLAY projection, not the clipboard one: `blocksToPlainText` prefixes an
 * apostrophe onto a table cell or chart value that opens like a spreadsheet
 * formula, and nothing on this path can reach a spreadsheet — so a preview of an
 * answer whose first block is a totals table read `'=Total…` on screen
 * (ADR-0065 §3 scopes that guard to the projections a download or paste feeds).
 */
export function derivePreview(messages: readonly ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;
    const text = blocksToDisplayText(message.blocks).trim().split('\n')[0].trim();
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
  // Calendar-day boundaries, not fixed 24-hour steps: across a daylight-saving
  // change yesterday's local midnight is 23 or 25 hours away, and a conversation
  // in the transition hour landed in the wrong group.
  const startOfToday = startOfLocalDay(now, 0);
  const startOfYesterday = startOfLocalDay(now, -1);
  const startOfPrevious7Days = startOfLocalDay(now, -7);
  const order: readonly ChatHistoryBucket[] = ['pinned', 'today', 'yesterday', 'previous7Days', 'older'];

  return order
    .map(bucket => ({
      bucket,
      conversations: conversations.filter(
        conversation =>
          bucketOf(conversation, startOfToday, startOfYesterday, startOfPrevious7Days) === bucket,
      ),
    }))
    .filter(group => group.conversations.length > 0);
}

/** Local midnight `offsetDays` from the day `reference` falls in. */
function startOfLocalDay(reference: Date, offsetDays: number): number {
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() + offsetDays,
  ).getTime();
}

function bucketOf(
  conversation: ChatConversation,
  startOfToday: number,
  startOfYesterday: number,
  startOfPrevious7Days: number,
): ChatHistoryBucket {
  if (conversation.pinned) return 'pinned';

  const updated = conversation.updatedAt.getTime();
  if (updated >= startOfToday) return 'today';
  if (updated >= startOfYesterday) return 'yesterday';
  if (updated >= startOfPrevious7Days) return 'previous7Days';
  return 'older';
}
