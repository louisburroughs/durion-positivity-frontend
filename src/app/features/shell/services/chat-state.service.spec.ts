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

});

describe('ChatStateService against a store that does not answer immediately', () => {
  let service: ChatStateService;
  const claims = signal<JwtClaims | null>({ sub: 'admin.alpha', tid: 'tenant-one', exp: 9999999999 });

  /** A store whose every call is held open until the test releases it. */
  class DeferredStore implements ChatHistoryStore {
    readonly order: string[] = [];
    /** Labels of the calls currently in flight, in the same order as `pending`. */
    readonly pendingLabels: string[] = [];
    /** When set, the next deferred call errors instead of completing. */
    failNext = false;
    private readonly pending: (() => void)[] = [];

    listConversations(): Observable<readonly ChatConversation[]> {
      // Deferred like the rest: a list load that settles instantly cannot be
      // in flight when a local mutation happens, which is the case under test.
      return this.defer('listConversations', this.listing);
    }

    /** What the next listConversations() will resolve with. */
    listing: readonly ChatConversation[] = [];
    loadMessages(): Observable<readonly ChatMessage[]> {
      return this.defer('loadMessages', []);
    }
    saveConversation(entry: ChatConversation): Observable<void> {
      return this.defer(`saveConversation:${entry.title}`, undefined as void);
    }
    saveMessages(conversationId: string, messages: readonly ChatMessage[]): Observable<void> {
      return this.defer(`saveMessages:${messages.length}`, undefined as void);
    }
    deleteConversation(): Observable<void> {
      return this.defer('deleteConversation', undefined as void);
    }
    clear(): Observable<void> {
      return this.defer('clear', undefined as void);
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

    private defer<T>(label: string, value: T): Observable<T> {
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
          subscriber.next(value);
          subscriber.complete();
        });
      });
    }
  }

  let store: DeferredStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
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
    // the window the guard exists to close.
    service.appendUserMessage('first question');
    const first = service.activeConversationId()!;
    service.startNewConversation();
    while (store.outstanding > 0) store.releaseNext();

    service.selectConversation(first);
    service.refresh();
    expect(service.switching()).toBe(true);

    // Settle the LIST load only; the message load is still outstanding.
    const listIndex = store.pendingLabels.indexOf('listConversations');
    expect(listIndex).toBeGreaterThanOrEqual(0);
    store.releaseAt(listIndex);

    expect(service.switching()).toBe(true);
  });
});
