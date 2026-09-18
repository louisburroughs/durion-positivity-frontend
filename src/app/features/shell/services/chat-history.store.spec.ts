import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { JwtClaims } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';
import { ChatConversation, ChatMessage } from '../models/chat.model';
import { LocalChatHistoryStore } from './chat-history.store';

const STORAGE_KEY = 'durion-chat-history-v1:tenant-one:admin.alpha';

function conversation(overrides: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'c1',
    title: 'Roster',
    preview: 'You have 26.',
    createdAt: new Date('2026-09-18T09:00:00Z'),
    updatedAt: new Date('2026-09-18T09:05:00Z'),
    pinned: false,
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'user',
    blocks: [{ kind: 'text', text: 'hello' }],
    timestamp: new Date('2026-09-18T09:00:00Z'),
    pending: false,
    ...overrides,
  };
}

describe('LocalChatHistoryStore', () => {
  let store: LocalChatHistoryStore;
  const claims = signal<JwtClaims | null>({ sub: 'admin.alpha', tid: 'tenant-one', exp: 9999999999 });

  beforeEach(() => {
    localStorage.clear();
    claims.set({ sub: 'admin.alpha', tid: 'tenant-one', exp: 9999999999 });

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUserClaims: claims } }],
    });
    store = TestBed.inject(LocalChatHistoryStore);
  });

  afterEach(() => localStorage.clear());

  /** The usual pair: metadata then messages, as ChatStateService.persist does. */
  async function save(entry = conversation(), messages = [message()]): Promise<void> {
    await firstValueFrom(store.saveConversation(entry));
    await firstValueFrom(store.saveMessages(entry.id, messages));
  }

  it('round-trips a conversation and its messages', async () => {
    await save();

    const listed = await firstValueFrom(store.listConversations());
    expect(listed).toHaveLength(1);
    expect(listed[0].title).toBe('Roster');
    expect(listed[0].updatedAt).toBeInstanceOf(Date);

    const messages = await firstValueFrom(store.loadMessages('c1'));
    expect(messages).toHaveLength(1);
    expect(messages[0].blocks[0]).toEqual({ kind: 'text', text: 'hello' });
    expect(messages[0].pending).toBe(false);
  });

  it('replaces a conversation rather than duplicating it', async () => {
    await save();
    await firstValueFrom(store.saveConversation(conversation({ title: 'Renamed' })));

    const listed = await firstValueFrom(store.listConversations());
    expect(listed).toHaveLength(1);
    expect(listed[0].title).toBe('Renamed');
  });

  it('keeps the stored messages when only the metadata is written', async () => {
    // A rename or a pin knows nothing about the message list. An earlier combined
    // signature let those callers write an empty list over a whole conversation.
    await save(conversation(), [message({ id: 'a' }), message({ id: 'b' })]);

    await firstValueFrom(store.saveConversation(conversation({ title: 'Renamed', pinned: true })));

    const messages = await firstValueFrom(store.loadMessages('c1'));
    expect(messages.map(entry => entry.id)).toEqual(['a', 'b']);
  });

  it('ignores a message write for a conversation that was never saved', async () => {
    await firstValueFrom(store.saveMessages('ghost', [message()]));
    expect(await firstValueFrom(store.listConversations())).toHaveLength(0);
  });

  it('lists pinned conversations first, then most recently updated', async () => {
    await firstValueFrom(
      store.saveConversation(conversation({ id: 'old', updatedAt: new Date('2026-09-10T09:00:00Z') })),
    );
    await firstValueFrom(
      store.saveConversation(conversation({ id: 'new', updatedAt: new Date('2026-09-18T09:00:00Z') })),
    );
    await firstValueFrom(
      store.saveConversation(
        conversation({ id: 'pin', pinned: true, updatedAt: new Date('2026-01-01T09:00:00Z') }),
      ),
    );

    const listed = await firstValueFrom(store.listConversations());
    expect(listed.map(entry => entry.id)).toEqual(['pin', 'new', 'old']);
  });

  it('namespaces storage by the signed-in subject', async () => {
    await save();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    claims.set({ sub: 'other.user', tid: 'tenant-one', exp: 9999999999 });
    expect(await firstValueFrom(store.listConversations())).toHaveLength(0);

    claims.set({ sub: 'admin.alpha', tid: 'tenant-one', exp: 9999999999 });
    expect(await firstValueFrom(store.listConversations())).toHaveLength(1);
  });

  it('namespaces storage by tenant, so one subject cannot read across a switch', async () => {
    // Conversations quote customer and invoice data; the same `sub` in another
    // tenant must not see them (ADR-0062).
    await save();

    claims.set({ sub: 'admin.alpha', tid: 'tenant-two', exp: 9999999999 });
    expect(await firstValueFrom(store.listConversations())).toHaveLength(0);
    expect(await firstValueFrom(store.loadMessages('c1'))).toHaveLength(0);

    claims.set({ sub: 'admin.alpha', tid: 'tenant-one', exp: 9999999999 });
    expect(await firstValueFrom(store.listConversations())).toHaveLength(1);
  });

  it('deletes one conversation and clears them all', async () => {
    await firstValueFrom(store.saveConversation(conversation({ id: 'a' })));
    await firstValueFrom(store.saveConversation(conversation({ id: 'b' })));

    await firstValueFrom(store.deleteConversation('a'));
    expect(await firstValueFrom(store.listConversations())).toHaveLength(1);

    await firstValueFrom(store.clear());
    expect(await firstValueFrom(store.listConversations())).toHaveLength(0);
  });

  it('reports storage it cannot read as a failed read, not as an empty history', async () => {
    // "You have never had a conversation" is a claim the read never established;
    // the state layer needs to be able to say the history could not be loaded
    // (ADR-0064 §1/§4). It still never throws synchronously.
    localStorage.setItem(STORAGE_KEY, 'not json at all');
    await expect(firstValueFrom(store.listConversations())).rejects.toThrow();
    await expect(firstValueFrom(store.loadMessages('c1'))).rejects.toThrow();

    // An ENTRY that fails validation is filtered out — that is a true empty answer.
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ nonsense: true }, 42]));
    expect(await firstValueFrom(store.listConversations())).toHaveLength(0);
  });

  it('reports a write the browser refused instead of resolving as saved', async () => {
    // A swallowed quota failure left the conversation looking persisted until the
    // next reload dropped it, with nothing on screen to say so (ADR-0065 §6).
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    await expect(firstValueFrom(store.saveConversation(conversation()))).rejects.toThrow();

    setItem.mockRestore();
  });

  it('treats a malformed message as absent instead of throwing', async () => {
    // read() only checks that `messages` is an array, so a null member used to
    // throw here and break the promise that corrupt storage reads as empty.
    await save(conversation(), [message({ id: 'ok' })]);
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    raw[0].messages = [null, 42, { id: 'no-timestamp' }, ...raw[0].messages];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));

    const messages = await firstValueFrom(store.loadMessages('c1'));
    expect(messages.map(entry => entry.id)).toEqual(['ok']);
  });

  it('drops a persisted message whose role is not recognised', async () => {
    await save(conversation(), [
      message({ id: 'ok' }),
      message({ id: 'bad', role: 'ghost' as unknown as 'user' }),
    ]);

    const messages = await firstValueFrom(store.loadMessages('c1'));
    expect(messages.map(entry => entry.id)).toEqual(['ok']);
  });

  it('brings an error turn back as an error turn, not an empty bubble', async () => {
    await save(conversation(), [
      message({
        id: 'failed',
        role: 'assistant',
        blocks: [
          {
            kind: 'error',
            messageKey: 'SHELL.CHAT.ERROR.BACKEND',
            detailKey: 'SHELL.CHAT.ERROR.DETAIL_STATUS',
            detailParams: { status: 503 },
            correlationId: 'abc-123',
            retryable: true,
          },
        ],
      }),
    ]);

    const [restored] = await firstValueFrom(store.loadMessages('c1'));
    expect(restored.blocks).toEqual([
      {
        kind: 'error',
        messageKey: 'SHELL.CHAT.ERROR.BACKEND',
        detailKey: 'SHELL.CHAT.ERROR.DETAIL_STATUS',
        detailParams: { status: 503 },
        correlationId: 'abc-123',
        retryable: true,
      },
    ]);
  });

  it('never evicts the conversation it was just asked to write', async () => {
    // A budget full of pinned conversations used to drop the active one silently.
    for (let index = 0; index < 30; index += 1) {
      await firstValueFrom(
        store.saveConversation(conversation({ id: `pinned-${index}`, pinned: true })),
      );
    }

    await save(conversation({ id: 'current' }), [message({ id: 'kept' })]);

    const listed = await firstValueFrom(store.listConversations());
    expect(listed.some(entry => entry.id === 'current')).toBe(true);
    expect(await firstValueFrom(store.loadMessages('current'))).toHaveLength(1);
  });

  it('caps the stored message list so one long thread cannot fill the quota', async () => {
    const many = Array.from({ length: 250 }, (_, index) => message({ id: `m${index}` }));
    await save(conversation(), many);

    const messages = await firstValueFrom(store.loadMessages('c1'));
    expect(messages).toHaveLength(200);
    expect(messages[messages.length - 1].id).toBe('m249');
  });

  it('drops an entry whose dates do not parse rather than reviving an Invalid Date', async () => {
    // An Invalid Date used to survive `read()` and then throw in `toISOString()`
    // the next time the conversation was pinned or renamed, taking the write with it.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'c1',
          title: 'Roster',
          preview: '',
          pinned: false,
          createdAt: 'not a date',
          updatedAt: '2026-09-18T09:05:00Z',
          messages: [],
        },
        {
          id: 'c2',
          title: 'Parts',
          preview: '',
          pinned: false,
          createdAt: '2026-09-18T09:00:00Z',
          updatedAt: '2026-09-18T09:05:00Z',
          messages: [],
        },
      ]),
    );

    const loaded = await firstValueFrom(store.listConversations());

    expect(loaded.map(entry => entry.id)).toEqual(['c2']);
    expect(loaded[0].updatedAt.getTime()).not.toBeNaN();
  });

  it('drops a message whose timestamp does not parse', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'c1',
          title: 'Roster',
          preview: '',
          pinned: false,
          createdAt: '2026-09-18T09:00:00Z',
          updatedAt: '2026-09-18T09:05:00Z',
          messages: [
            { id: 'm1', role: 'user', blocks: [], timestamp: 'rubbish' },
            { id: 'm2', role: 'user', blocks: [], timestamp: '2026-09-18T09:01:00Z' },
          ],
        },
      ]),
    );

    const messages = await firstValueFrom(store.loadMessages('c1'));

    expect(messages.map(entry => entry.id)).toEqual(['m2']);
  });

  it('stores nothing at all when the token carries no tenant', async () => {
    // A shared `no-tenant` slot would put one subject's transcripts from two
    // tenant contexts in the same bucket — the leak the key exists to prevent.
    claims.set({ sub: 'admin.alpha', exp: 9999999999 });

    await firstValueFrom(store.saveConversation(conversation()));
    await firstValueFrom(store.saveMessages('c1', [message()]));

    expect(
      Object.keys(localStorage).filter(key => key.startsWith('durion-chat-history')),
    ).toEqual([]);
    expect(await firstValueFrom(store.listConversations())).toEqual([]);
  });

  it('never surfaces a tenant-bound transcript to a token without a tenant', async () => {
    await firstValueFrom(store.saveConversation(conversation()));
    expect(await firstValueFrom(store.listConversations())).toHaveLength(1);

    claims.set({ sub: 'admin.alpha', exp: 9999999999 });
    expect(await firstValueFrom(store.listConversations())).toEqual([]);
    expect(await firstValueFrom(store.loadMessages('c1'))).toEqual([]);
  });
});
