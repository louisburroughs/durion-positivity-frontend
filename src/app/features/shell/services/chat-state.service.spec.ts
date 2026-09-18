import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { JwtClaims } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';
import { ChatConversation, ChatMessage } from '../models/chat.model';
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
  const claims = signal<JwtClaims | null>({ sub: 'admin.alpha', exp: 9999999999 });

  beforeEach(() => {
    localStorage.clear();
    claims.set({ sub: 'admin.alpha', exp: 9999999999 });

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
    const pendingId = service.beginAssistantTurn();

    expect(service.awaitingReply()).toBe(true);
    expect(service.conversations()[0].preview).toBe('');

    service.completeAssistantTurn(pendingId, [{ kind: 'text', text: 'You have 26.' }]);

    expect(service.awaitingReply()).toBe(false);
    expect(service.conversations()[0].preview).toBe('You have 26.');
  });

  it('reloads a stored conversation when it is selected again', () => {
    service.appendUserMessage('first question');
    const pendingId = service.beginAssistantTurn();
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

    claims.set({ sub: 'other.user', exp: 9999999999 });
    TestBed.flushEffects();

    expect(service.messages()).toHaveLength(0);
    expect(service.conversations()).toHaveLength(0);
    expect(service.activeConversationId()).toBeNull();
  });

  it('reports the last user text for a retry', () => {
    expect(service.lastUserText()).toBeNull();
    service.appendUserMessage('first');
    service.appendUserMessage('second');
    expect(service.lastUserText()).toBe('second');
  });

  it('removes a discarded message', () => {
    service.appendUserMessage('question');
    const pendingId = service.beginAssistantTurn();
    service.discardMessage(pendingId);
    expect(service.messages()).toHaveLength(1);
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
