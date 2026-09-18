import { signal } from '@angular/core';
import { Observable } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { JwtClaims } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';
import { ChatConversation, ChatMessage } from '../models/chat.model';
import { CHAT_HISTORY_STORE, ChatHistoryStore } from './chat-history.store';
import {
  ChatStateService,
  derivePreview,
  deriveTitle,
  groupConversations,
} from './chat-state.service';

function conversation(overrides: Partial<ChatConversation>): ChatConversation {
  return {
    id: 'c1',
    title: 'Roster',
    preview: '',
    createdAt: new Date('2026-09-18T09:00:00Z'),
    updatedAt: new Date('2026-09-18T09:00:00Z'),
    pinned: false,
    ...overrides,
  };
}

describe('ChatStateService', () => {
  let service: ChatStateService;
  const claims = signal<JwtClaims | null>({ sub: 'admin.alpha', tid: 'tenant-one', exp: 9999999999 });

  beforeEach(() => {
    localStorage.clear();
    claims.set({ sub: 'admin.alpha', tid: 'tenant-one', exp: 9999999999 });

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUserClaims: claims } }],
    });

    service = TestBed.inject(ChatStateService);
    service.refresh();
  });

  afterEach(() => localStorage.clear());

  it('starts with no conversation and an empty thread', () => {
    expect(service.isEmpty()).toBe(true);
    expect(service.activeConversationId()).toBeNull();
    expect(service.state()).toBe('ready');
  });

  it('opens a conversation on the first user message and titles it from that message', () => {
    service.appendUserMessage('How many mechanics do I have?');

    expect(service.activeConversationId()).not.toBeNull();
    expect(service.conversations()).toHaveLength(1);
    expect(service.conversations()[0].title).toBe('How many mechanics do I have?');
    expect(service.messages()[0].blocks[0]).toEqual({
      kind: 'text',
      text: 'How many mechanics do I have?',
    });
  });

  it('keeps a pending assistant turn out of the persisted preview until it completes', () => {
    service.appendUserMessage('question');
    const pendingId = service.beginAssistantTurn()!;

    expect(service.awaitingReply()).toBe(true);
    expect(service.conversations()[0].preview).toBe('');

    service.completeAssistantTurn(pendingId, [{ kind: 'text', text: 'You have 26.' }]);

    expect(service.awaitingReply()).toBe(false);
    expect(service.conversations()[0].preview).toBe('You have 26.');
  });

  it('reloads a stored conversation when it is selected again', () => {
    service.appendUserMessage('first question');
    const pendingId = service.beginAssistantTurn()!;
    service.completeAssistantTurn(pendingId, [{ kind: 'text', text: 'first answer' }]);
    const firstId = service.activeConversationId();

    service.startNewConversation();
    expect(service.messages()).toHaveLength(0);
    expect(service.conversations()).toHaveLength(1);

    service.selectConversation(firstId!);
    expect(service.messages()).toHaveLength(2);
    expect(service.messages()[1].blocks[0]).toEqual({ kind: 'text', text: 'first answer' });
  });

  it('renames, pins and deletes a conversation', () => {
    service.appendUserMessage('question');
    const id = service.activeConversationId()!;

    service.renameConversation(id, '  Mechanic roster  ');
    expect(service.conversations()[0].title).toBe('Mechanic roster');

    service.renameConversation(id, '   ');
    expect(service.conversations()[0].title).toBe('Mechanic roster');

    service.togglePinned(id);
    expect(service.conversations()[0].pinned).toBe(true);

    service.deleteConversation(id);
    expect(service.conversations()).toHaveLength(0);
    expect(service.activeConversationId()).toBeNull();
  });

  it('clears every conversation', () => {
    service.appendUserMessage('one');
    service.startNewConversation();
    service.appendUserMessage('two');
    expect(service.conversations()).toHaveLength(2);

    service.clearHistory();
    expect(service.conversations()).toHaveLength(0);
  });

  it('drops in-memory state when the signed-in subject changes', () => {
    service.appendUserMessage('mine');
    expect(service.messages()).toHaveLength(1);

    claims.set({ sub: 'other.user', tid: 'tenant-one', exp: 9999999999 });
    TestBed.flushEffects();

    expect(service.messages()).toHaveLength(0);
    expect(service.conversations()).toHaveLength(0);
    expect(service.activeConversationId()).toBeNull();
  });

  it('resolves a retry to the question above the failed turn, not the newest one', () => {
    service.appendUserMessage('first question');
    const firstTurn = service.beginAssistantTurn()!;
    service.completeAssistantTurn(firstTurn, [
      {
        kind: 'error',
        messageKey: 'SHELL.CHAT.ERROR.BACKEND',
        detailKey: null,
        detailParams: null,
        correlationId: null,
        retryable: true,
      },
    ]);

    service.appendUserMessage('second question');
    const secondTurn = service.beginAssistantTurn()!;
    service.completeAssistantTurn(secondTurn, [{ kind: 'text', text: 'second answer' }]);

    expect(service.userTextBefore(firstTurn.messageId)).toBe('first question');
    expect(service.userTextBefore(secondTurn.messageId)).toBe('second question');
    expect(service.userTextBefore('no-such-message')).toBeNull();
  });

  it('restarts a failed turn in place rather than appending a new one at the end', () => {
    service.appendUserMessage('first question');
    const firstTurn = service.beginAssistantTurn()!;
    service.completeAssistantTurn(firstTurn, [{ kind: 'text', text: 'failed' }]);
    service.appendUserMessage('second question');

    const restarted = service.restartAssistantTurn(firstTurn.messageId);

    expect(restarted).not.toBeNull();
    expect(service.messages()).toHaveLength(3);
    // Still the second entry: the retried answer must not jump below a later question.
    expect(service.messages()[1].id).toBe(restarted!.messageId);
    expect(service.messages()[1].pending).toBe(true);
    expect(service.messages()[2].role).toBe('user');
    expect(service.restartAssistantTurn('no-such-message')).toBeNull();
  });

  it('keeps a background conversation intact when it is pinned or renamed', () => {
    // Pinning writes metadata only. A combined write used to blank the stored
    // messages of any conversation that was not the open one.
    service.appendUserMessage('a question');
    const pendingId = service.beginAssistantTurn()!;
    service.completeAssistantTurn(pendingId, [{ kind: 'text', text: 'an answer' }]);
    const id = service.activeConversationId()!;

    service.startNewConversation();
    service.togglePinned(id);
    service.renameConversation(id, 'Renamed while closed');
    service.selectConversation(id);

    expect(service.messages()).toHaveLength(2);
    expect(service.conversations()[0].title).toBe('Renamed while closed');
  });

  it('does not treat its own first effect run as a change of user', () => {
    // The effect used to wipe the list that refresh() had just loaded, so the rail
    // came up empty on the first open of every page session.
    localStorage.clear();
    service.appendUserMessage('stored question');
    const pendingId = service.beginAssistantTurn()!;
    service.completeAssistantTurn(pendingId, [{ kind: 'text', text: 'stored answer' }]);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUserClaims: claims } }],
    });

    const reopened = TestBed.inject(ChatStateService);
    reopened.refresh();
    TestBed.flushEffects();

    expect(reopened.conversations()).toHaveLength(1);
    expect(reopened.state()).toBe('ready');
  });

  it('refuses to open an assistant turn with no conversation to put it in', () => {
    expect(service.beginAssistantTurn()).toBeNull();
  });

  it('lands a reply in the conversation that asked for it, not the one now open', () => {
    // The user is free to switch conversations while a reply is in flight; the
    // answer used to be dropped because its pending id was not in the new thread.
    service.appendUserMessage('first question');
    const target = service.beginAssistantTurn()!;
    const firstId = service.activeConversationId()!;

    service.startNewConversation();
    service.appendUserMessage('a different question');
    const secondId = service.activeConversationId()!;

    service.completeAssistantTurn(target, [{ kind: 'text', text: 'the late answer' }]);

    // The thread the user is looking at is untouched.
    expect(service.messages()).toHaveLength(1);
    expect(service.activeConversationId()).toBe(secondId);

    service.selectConversation(firstId);
    const landed = service.messages()[service.messages().length - 1];
    expect(landed.blocks[0]).toEqual({ kind: 'text', text: 'the late answer' });
    expect(landed.pending).toBe(false);
    expect(service.conversations().find(entry => entry.id === firstId)?.preview).toBe('the late answer');
  });

  it('isolates history by tenant as well as by subject', () => {
    // One `sub` can outlive a tenant switch; the other tenant's conversations
    // must not follow it, since they quote customer and invoice data.
    service.appendUserMessage('tenant one question');
    expect(service.conversations()).toHaveLength(1);

    claims.set({ sub: 'admin.alpha', tid: 'tenant-two', exp: 9999999999 });
    TestBed.flushEffects();
    service.refresh();

    expect(service.conversations()).toHaveLength(0);
    expect(service.messages()).toHaveLength(0);

    claims.set({ sub: 'admin.alpha', tid: 'tenant-one', exp: 9999999999 });
    TestBed.flushEffects();
    service.refresh();

    expect(service.conversations()).toHaveLength(1);
  });

  it('lets a new chat outrank a conversation load still in flight', () => {
    service.appendUserMessage('a question');
    const id = service.activeConversationId()!;

    service.startNewConversation();
    service.selectConversation(id);
    expect(service.messages()).toHaveLength(1);

    service.startNewConversation();
    expect(service.messages()).toHaveLength(0);
    expect(service.activeConversationId()).toBeNull();
  });
});

describe('deriveTitle', () => {
  it('keeps a short first line verbatim', () => {
    expect(deriveTitle('How many mechanics?\nand by bay?')).toBe('How many mechanics?');
  });

  it('clips a long line on a word boundary', () => {
    const title = deriveTitle('a'.repeat(10) + ' ' + 'b'.repeat(60));
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(49);
  });
});

describe('derivePreview', () => {
  const base: Omit<ChatMessage, 'role' | 'blocks'> = {
    id: 'm1',
    timestamp: new Date(),
    pending: false,
  };

  it('uses the first line of the latest assistant turn', () => {
    const preview = derivePreview([
      { ...base, role: 'user', blocks: [{ kind: 'text', text: 'question' }] },
      { ...base, role: 'assistant', blocks: [{ kind: 'text', text: 'line one\nline two' }] },
    ]);
    expect(preview).toBe('line one');
  });

  it('is empty when no assistant turn carries text', () => {
    expect(derivePreview([{ ...base, role: 'user', blocks: [{ kind: 'text', text: 'hi' }] }])).toBe('');
  });
});

describe('groupConversations', () => {
  const now = new Date('2026-09-18T12:00:00Z');

  it('buckets by recency with pinned conversations first', () => {
    const groups = groupConversations(
      [
        conversation({ id: 'today', updatedAt: new Date('2026-09-18T08:00:00Z') }),
        conversation({ id: 'yesterday', updatedAt: new Date('2026-09-17T08:00:00Z') }),
        conversation({ id: 'week', updatedAt: new Date('2026-09-14T08:00:00Z') }),
        conversation({ id: 'ancient', updatedAt: new Date('2026-01-01T08:00:00Z') }),
        conversation({ id: 'pinned', pinned: true, updatedAt: new Date('2026-01-01T08:00:00Z') }),
      ],
      now,
    );

    expect(groups.map(group => group.bucket)).toEqual([
      'pinned',
      'today',
      'yesterday',
      'previous7Days',
      'older',
    ]);
  });

  it('drops empty buckets', () => {
    const groups = groupConversations([conversation({ updatedAt: now })], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].bucket).toBe('today');
  });

  it('groups by calendar day across a daylight-saving change', () => {
    // Fixed 24-hour steps put a conversation in the transition hour in the wrong
    // group: yesterday's local midnight is 23 or 25 hours away, not 24.
    // 2026-11-01 is the US DST fall-back; the day before it is 25 hours long.
    const now = new Date(2026, 10, 2, 9, 0, 0);
    const lateYesterday = new Date(2026, 10, 1, 23, 30, 0);
    const earlyYesterday = new Date(2026, 10, 1, 0, 30, 0);

    const groups = groupConversations(
      [
        conversation({ id: 'late', updatedAt: lateYesterday }),
        conversation({ id: 'early', updatedAt: earlyYesterday }),
      ],
      now,
    );

    const yesterday = groups.find(group => group.bucket === 'yesterday');
    expect(yesterday?.conversations.map(entry => entry.id).sort()).toEqual(['early', 'late']);
    expect(groups.some(group => group.bucket === 'older')).toBe(false);
  });
});

describe('ChatStateService against a store that does not answer immediately', () => {
  let service: ChatStateService;
  const claims = signal<JwtClaims | null>({ sub: 'admin.alpha', tid: 'tenant-one', exp: 9999999999 });

  /** A store whose every call is held open until the test releases it. */
  class DeferredStore implements ChatHistoryStore {
    readonly retentionNoteKey = 'SHELL.CHAT.HISTORY.RETENTION_NOTE';
    readonly order: string[] = [];
    /** Labels of the calls currently in flight, in the same order as `pending`. */
    readonly pendingLabels: string[] = [];
    /** When set, the next deferred call errors instead of completing. */
    failNext = false;
    private readonly pending: (() => void)[] = [];

    /** What has actually been saved, so a reload returns it. */
    private readonly saved = new Map<string, readonly ChatMessage[]>();
    private readonly entries = new Map<string, ChatConversation>();

    listConversations(): Observable<readonly ChatConversation[]> {
      // Deferred like the rest: a list load that settles instantly cannot be
      // in flight when a local mutation happens, which is the case under test.
      return this.defer('listConversations', () => [...this.entries.values()]);
    }
    loadMessages(conversationId: string): Observable<readonly ChatMessage[]> {
      return this.defer('loadMessages', () => this.saved.get(conversationId) ?? []);
    }
    saveConversation(entry: ChatConversation): Observable<void> {
      return this.defer(`saveConversation:${entry.title}`, () => {
        this.entries.set(entry.id, entry);
      });
    }
    saveMessages(conversationId: string, messages: readonly ChatMessage[]): Observable<void> {
      return this.defer(`saveMessages:${messages.length}`, () => {
        this.saved.set(conversationId, messages);
      });
    }
    deleteConversation(conversationId: string): Observable<void> {
      return this.defer('deleteConversation', () => {
        this.entries.delete(conversationId);
        this.saved.delete(conversationId);
      });
    }
    clear(): Observable<void> {
      return this.defer('clear', () => {
        this.entries.clear();
        this.saved.clear();
      });
    }

    /** Settle the oldest outstanding call. */
    releaseNext(): void {
      this.pendingLabels.shift();
      this.pending.shift()?.();
    }

    /** Settle one particular outstanding call, leaving the others in flight. */
    releaseAt(index: number): void {
      const [settle] = this.pending.splice(index, 1);
      this.pendingLabels.splice(index, 1);
      settle?.();
    }
    get outstanding(): number {
      return this.pending.length;
    }

    /** `settle` runs when the call is released, so it sees the state of that moment. */
    private defer<T>(label: string, settle: () => T): Observable<T> {
      const fails = this.failNext;
      this.failNext = false;
      return new Observable<T>(subscriber => {
        this.order.push(label);
        this.pendingLabels.push(label);
        this.pending.push(() => {
          if (fails) {
            subscriber.error(new Error(`store failed: ${label}`));
            return;
          }
          subscriber.next(settle());
          subscriber.complete();
        });
      });
    }
  }

  let store: DeferredStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    // Tests in here switch tenants; start every one from a known identity.
    claims.set({ sub: 'admin.alpha', tid: 'tenant-one', exp: 9999999999 });
    store = new DeferredStore();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUserClaims: claims } },
        { provide: CHAT_HISTORY_STORE, useValue: store },
      ],
    });
    service = TestBed.inject(ChatStateService);
    service.refresh();
    // Settle the opening list load; the tests below start from a quiet store.
    store.releaseNext();
  });

  it('runs one store write at a time, in the order they were issued', () => {
    service.appendUserMessage('first question');
    service.appendUserMessage('second question');

    // Both turns queued writes, but only the first has reached the store: an
    // overlapping chain let an older saveMessages land after a newer one and
    // overwrite the reply that had just arrived.
    expect(store.outstanding).toBe(1);
    expect(store.order.filter(label => label.startsWith('save'))).toHaveLength(1);

    store.releaseNext();
    store.releaseNext();
    store.releaseNext();
    store.releaseNext();

    const saves = store.order.filter(label => label.startsWith('saveMessages'));
    expect(saves).toEqual(['saveMessages:1', 'saveMessages:2']);
  });

  it('reports that it is switching until the opened conversation has loaded', () => {
    service.appendUserMessage('first question');
    const first = service.activeConversationId()!;
    service.startNewConversation();

    service.selectConversation(first);
    expect(service.switching()).toBe(true);

    while (store.outstanding > 0) store.releaseNext();
    expect(service.switching()).toBe(false);
  });

  it('lands a reply in a conversation the user left and came back to', () => {
    // Coming back reloads the thread from the store, and a pending turn is never
    // persisted — so the placeholder is gone. The in-place update matched nothing
    // and then persisted a thread with no answer in it: the reply vanished.
    service.appendUserMessage('first question');
    const first = service.activeConversationId()!;
    const target = service.beginAssistantTurn()!;

    service.startNewConversation();
    while (store.outstanding > 0) store.releaseNext();

    service.selectConversation(first);
    while (store.outstanding > 0) store.releaseNext();
    expect(service.messages().some(message => message.id === target.messageId)).toBe(false);

    service.completeAssistantTurn(target, [{ kind: 'text', text: 'You have 26.' }]);
    while (store.outstanding > 0) store.releaseNext();

    const landed = service.messages()[service.messages().length - 1];
    expect(landed.role).toBe('assistant');
    expect(landed.pending).toBe(false);
    expect(landed.blocks).toEqual([{ kind: 'text', text: 'You have 26.' }]);
  });

  it('does not let a list load started before a send drop the new conversation', () => {
    // refresh() replaces the whole list. A load in flight when the user asks a
    // question carries a snapshot without that conversation — and dropping the
    // ACTIVE one means persist() can no longer resolve it, so the reply to it is
    // never written.
    service.refresh();
    service.appendUserMessage('a brand new question');
    const created = service.activeConversationId()!;

    // The load in flight carries a snapshot from before that question existed.
    while (store.outstanding > 0) store.releaseNext();

    expect(service.conversations().map(entry => entry.id)).toContain(created);
    expect(service.activeConversationId()).toBe(created);
  });

  it('keeps the queue alive after a write fails', () => {
    // catchError on the outer pipe would complete the queue: one remote failure
    // and every later write in the session is dropped without a trace.
    store.failNext = true;
    service.appendUserMessage('first question');
    while (store.outstanding > 0) store.releaseNext();

    store.order.length = 0;
    service.appendUserMessage('second question');
    while (store.outstanding > 0) store.releaseNext();

    expect(store.order.filter(label => label.startsWith('save')).length).toBeGreaterThan(0);
  });

  it('discards a queued write whose identity has since changed', () => {
    // The store resolves its key when the call runs, so running an old snapshot's
    // write after a tenant switch would put it in the new tenant's namespace.
    service.appendUserMessage('a question under tenant-one');
    store.order.length = 0;

    claims.set({ sub: 'admin.alpha', tid: 'tenant-two', exp: 9999999999 });
    TestBed.tick();
    while (store.outstanding > 0) store.releaseNext();

    expect(store.order.filter(label => label.startsWith('save'))).toEqual([]);
  });

  it('keeps the composer held when a list load lands mid-selection', () => {
    // `_state` was shared, so a refresh() settling first set 'ready' and
    // switching() went false while the thread was still being fetched — exactly
    // the window the guard exists to close. The list load is issued FIRST here so
    // it is the one in flight; the selection queues behind it (ADR-0063 §1) and is
    // still outstanding when the list lands.
    service.appendUserMessage('first question');
    const first = service.activeConversationId()!;
    service.startNewConversation();
    while (store.outstanding > 0) store.releaseNext();

    service.refresh();
    service.selectConversation(first);
    expect(service.switching()).toBe(true);

    // Settle the LIST load only; the message load has not been issued yet.
    const listIndex = store.pendingLabels.indexOf('listConversations');
    expect(listIndex).toBeGreaterThanOrEqual(0);
    store.releaseAt(listIndex);

    expect(service.switching()).toBe(true);
    expect(store.pendingLabels).toContain('loadMessages');
  });

  it('moves a conversation back to the top when a reply lands in it', () => {
    // The rail's grouping preserves input order, so bumping `updatedAt` without
    // reordering left an answered conversation sitting under newer ones.
    // Distinct timestamps: everything here would otherwise land in one millisecond
    // and the ordering under test would be a tie.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T09:00:00Z'));
    service.appendUserMessage('the older question');
    const older = service.activeConversationId()!;
    const target = service.beginAssistantTurn()!;

    vi.setSystemTime(new Date('2026-09-18T09:05:00Z'));
    service.startNewConversation();
    service.appendUserMessage('the newer question');
    const newer = service.activeConversationId()!;
    while (store.outstanding > 0) store.releaseNext();
    expect(service.conversations().map(entry => entry.id)).toEqual([newer, older]);

    vi.setSystemTime(new Date('2026-09-18T09:10:00Z'));
    service.completeAssistantTurn(target, [{ kind: 'text', text: 'You have 26.' }]);
    while (store.outstanding > 0) store.releaseNext();

    expect(service.conversations().map(entry => entry.id)).toEqual([older, newer]);
    vi.useRealTimers();
  });

  it('drops a reply that settles after the identity changed', () => {
    // Both completion paths resolve the store against whoever is signed in now,
    // so an answer from the previous session would be read from, and written
    // into, the new tenant's namespace — under an id that may even collide.
    service.appendUserMessage('a question under tenant-one');
    const target = service.beginAssistantTurn()!;
    while (store.outstanding > 0) store.releaseNext();

    claims.set({ sub: 'admin.alpha', tid: 'tenant-two', exp: 9999999999 });
    TestBed.tick();
    while (store.outstanding > 0) store.releaseNext();
    store.order.length = 0;

    service.completeAssistantTurn(target, [{ kind: 'text', text: 'the late answer' }]);
    while (store.outstanding > 0) store.releaseNext();

    expect(store.order).toEqual([]);
  });

  it('keeps a question asked while the previous reply was still in flight', () => {
    // The away path used to REPLACE the thread with `stored + answer`. Anything
    // not yet persisted — the newer question and its pending placeholder — was
    // wiped, and the read could also overtake the queued save and come back with
    // the pre-send snapshot.
    service.appendUserMessage('the first question');
    const conversation = service.activeConversationId()!;
    const target = service.beginAssistantTurn()!;

    service.startNewConversation();
    while (store.outstanding > 0) store.releaseNext();
    service.selectConversation(conversation);
    while (store.outstanding > 0) store.releaseNext();

    service.appendUserMessage('a second question');
    const second = service.beginAssistantTurn()!;

    service.completeAssistantTurn(target, [{ kind: 'text', text: 'the first answer' }]);
    while (store.outstanding > 0) store.releaseNext();

    const texts = service.messages().map(message => blockText(message));
    expect(texts).toContain('the first question');
    expect(texts).toContain('a second question');
    expect(texts).toContain('the first answer');
    // The second turn is still open, not discarded.
    expect(service.messages().some(message => message.id === second.messageId)).toBe(true);
    expect(service.awaitingReply()).toBe(true);
  });

  it('replaces the stored failure when a retry settles away from the thread', () => {
    // restartAssistantTurn swaps the message in memory only, so the store still
    // holds the error: without carrying the replaced id, reopening showed the old
    // failure followed by its answer.
    service.appendUserMessage('a question that fails');
    const conversation = service.activeConversationId()!;
    const failed = service.beginAssistantTurn()!;
    service.completeAssistantTurn(failed, [
      { kind: 'error', messageKey: 'SHELL.CHAT.ERROR.BACKEND', detailKey: null,
        detailParams: null, correlationId: null, retryable: true },
    ]);
    while (store.outstanding > 0) store.releaseNext();

    const retry = service.restartAssistantTurn(failed.messageId)!;
    service.startNewConversation();
    while (store.outstanding > 0) store.releaseNext();

    service.completeAssistantTurn(retry, [{ kind: 'text', text: 'the retried answer' }]);
    while (store.outstanding > 0) store.releaseNext();

    service.selectConversation(conversation);
    while (store.outstanding > 0) store.releaseNext();

    const kinds = service.messages().map(message => message.blocks[0]?.kind);
    expect(kinds).not.toContain('error');
    expect(service.messages().map(message => blockText(message))).toContain('the retried answer');
  });

  it('survives a failed load while landing a reply, without killing the queue', () => {
    service.appendUserMessage('a question');
    const target = service.beginAssistantTurn()!;
    service.startNewConversation();
    while (store.outstanding > 0) store.releaseNext();

    store.failNext = true;
    service.completeAssistantTurn(target, [{ kind: 'text', text: 'the answer' }]);
    while (store.outstanding > 0) store.releaseNext();

    // The queue is still usable afterwards.
    store.order.length = 0;
    service.appendUserMessage('a later question');
    while (store.outstanding > 0) store.releaseNext();
    expect(store.order.filter(label => label.startsWith('save')).length).toBeGreaterThan(0);
  });

  it('does not leave the previous thread addressable when a selection fails', () => {
    // The error branch used to clear `switching` only, so `_activeId` still
    // pointed at the conversation being left: the composer re-enabled and the
    // next question was written into it while the screen reported a failure.
    service.appendUserMessage('a question in the first conversation');
    const first = service.activeConversationId()!;
    service.startNewConversation();
    service.appendUserMessage('a question in the second');
    const second = service.activeConversationId()!;
    while (store.outstanding > 0) store.releaseNext();

    // The SECOND conversation is the one on screen when the load for the first
    // fails; that is the thread the composer would otherwise keep writing into.
    expect(service.activeConversationId()).toBe(second);

    store.failNext = true;
    service.selectConversation(first);
    while (store.outstanding > 0) store.releaseNext();

    expect(service.state()).toBe('error');
    expect(service.errorKey()).toBe('SHELL.CHAT.ERROR.HISTORY_LOAD');
    expect(service.activeConversationId()).toBeNull();
    expect(service.messages()).toEqual([]);

    // A question asked now opens a fresh conversation rather than joining one
    // the user never successfully opened.
    service.appendUserMessage('a question after the failure');
    expect(service.activeConversationId()).not.toBe(first);
    expect(service.activeConversationId()).not.toBe(second);
  });

  it('does not let a list load overtake a write still sitting in the queue', () => {
    // Closing and reopening the modal starts a refresh. Issued directly, it could
    // resolve ahead of the queued save and replace the list with a snapshot that
    // predates the conversation — after which persist() cannot resolve it.
    service.appendUserMessage('a brand new question');
    const created = service.activeConversationId()!;

    service.refresh();

    // The read is not even in flight: it sits behind the write in the queue.
    // Issued directly it would be, and could settle first — returning a snapshot
    // without this conversation and replacing the list with it.
    expect(store.pendingLabels).not.toContain('listConversations');

    while (store.outstanding > 0) store.releaseNext();

    expect(service.conversations().map(entry => entry.id)).toContain(created);
    expect(service.state()).toBe('ready');
  });

  it('finishes the load even when a write invalidates the snapshot mid-flight', () => {
    // A discarded snapshot still owns the loading state; leaving it set spun the
    // history rail forever.
    service.refresh();
    service.appendUserMessage('a question issued mid-load');
    while (store.outstanding > 0) store.releaseNext();

    expect(service.state()).toBe('ready');
  });

  it('drops a reply whose identity changed while the history load was in flight', () => {
    // The checks in completeAssistantTurn and at the head of the queue both run
    // BEFORE loadMessages resolves, so neither covers a tenant switch during the
    // load — and `stored` would have been read from the new tenant's namespace.
    service.appendUserMessage('a question under tenant-one');
    const conversation = service.activeConversationId()!;
    const target = service.beginAssistantTurn()!;
    service.startNewConversation();
    while (store.outstanding > 0) store.releaseNext();

    // Start the away completion, but leave its loadMessages unsettled.
    service.completeAssistantTurn(target, [{ kind: 'text', text: 'the late answer' }]);
    expect(store.pendingLabels).toContain('loadMessages');

    // The session changes while that load is still open, then it settles.
    claims.set({ sub: 'admin.alpha', tid: 'tenant-two', exp: 9999999999 });
    TestBed.tick();
    store.order.length = 0;
    while (store.outstanding > 0) store.releaseNext();

    expect(store.order.filter(label => label.startsWith('save'))).toEqual([]);
    expect(service.conversations().map(entry => entry.id)).not.toContain(conversation);
  });
});

/** First text-ish block of a message, for readable assertions. */
function blockText(message: ChatMessage): string {
  const block = message.blocks[0];
  if (!block) return '';
  if (block.kind === 'text') return block.text;
  if (block.kind === 'markdown') return block.markdown;
  return '';
}
