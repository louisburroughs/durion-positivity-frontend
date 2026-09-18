import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import { CHAT_HISTORY_STORE, ChatHistoryStore } from '../../services/chat-history.store';
import { ChatStateService } from '../../services/chat-state.service';
import { ChatHistoryRailComponent } from './chat-history-rail.component';

describe('ChatHistoryRailComponent', () => {
  let fixture: ComponentFixture<ChatHistoryRailComponent>;
  let component: ChatHistoryRailComponent;
  let chatState: ChatStateService;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [ChatHistoryRailComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentUserClaims: signal<JwtClaims | null>({
              sub: 'admin.alpha',
              tid: 'tenant-one',
              exp: 9999999999,
            }),
          },
        },
      ],
    }).compileComponents();

    chatState = TestBed.inject(ChatStateService);
    chatState.refresh();

    fixture = TestBed.createComponent(ChatHistoryRailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Record a finished exchange, the way a real send would. */
  function conversation(question: string, answer: string): string {
    chatState.startNewConversation();
    chatState.appendUserMessage(question);
    const pendingId = chatState.beginAssistantTurn()!;
    chatState.completeAssistantTurn(pendingId, [{ kind: 'text', text: answer }]);
    fixture.detectChanges();
    return chatState.activeConversationId()!;
  }

  function rows(): HTMLElement[] {
    return [...host().querySelectorAll<HTMLElement>('.rail-row')];
  }

  it('invites the user to start when there is no history', () => {
    expect(host().querySelector('.rail-empty')?.textContent).toContain('SHELL.CHAT.HISTORY.EMPTY');
    expect(rows()).toHaveLength(0);
    // Nothing to clear, so the destructive control stays out of reach.
    expect(host().textContent).not.toContain('SHELL.CHAT.HISTORY.CLEAR_ALL');
  });

  it('lists a conversation by its title and the latest answer', () => {
    conversation('How many mechanics do I have?', 'You have 26.');

    expect(rows()).toHaveLength(1);
    expect(host().querySelector('.rail-row__title')?.textContent).toContain('How many mechanics do I have?');
    expect(host().querySelector('.rail-row__preview')?.textContent).toContain('You have 26.');
  });

  it('marks the open conversation as current', () => {
    conversation('first question', 'first answer');
    const open = host().querySelector('.rail-row__open');
    expect(open?.getAttribute('aria-current')).toBe('true');
    expect(host().querySelector('.rail-row--active')).not.toBeNull();
  });

  it('opens a stored conversation and reports it to the modal', () => {
    const first = conversation('first question', 'first answer');
    conversation('second question', 'second answer');

    const opened: unknown[] = [];
    component.conversationOpened.subscribe(() => opened.push(true));

    const firstRow = rows().find(row => row.textContent?.includes('first question'))!;
    firstRow.querySelector<HTMLButtonElement>('.rail-row__open')!.click();
    fixture.detectChanges();

    expect(chatState.activeConversationId()).toBe(first);
    expect(chatState.messages()).toHaveLength(2);
    expect(opened).toHaveLength(1);
  });

  it('starts a new chat without discarding the stored one', () => {
    conversation('a question', 'an answer');

    host().querySelector<HTMLButtonElement>('.new-chat-btn')!.click();
    fixture.detectChanges();

    expect(chatState.messages()).toHaveLength(0);
    expect(chatState.activeConversationId()).toBeNull();
    expect(chatState.conversations()).toHaveLength(1);
  });

  it('filters by title and by answer text, and says so when nothing matches', () => {
    conversation('How many mechanics?', 'You have 26.');
    conversation('Low stock this week', 'Fourteen SKUs are under their reorder point.');

    component.search.set('mechanics');
    fixture.detectChanges();
    expect(rows()).toHaveLength(1);

    component.search.set('reorder point');
    fixture.detectChanges();
    expect(rows()).toHaveLength(1);
    expect(host().textContent).toContain('Low stock this week');

    component.search.set('nothing like this');
    fixture.detectChanges();
    expect(rows()).toHaveLength(0);
    expect(host().querySelector('.rail-empty')?.textContent).toContain('SHELL.CHAT.HISTORY.NO_MATCHES');
  });

  it('renames a conversation from an inline field', () => {
    const id = conversation('a very long original question', 'an answer');

    host().querySelector<HTMLButtonElement>('[aria-label^="SHELL.CHAT.HISTORY.RENAME_ARIA"]')!.click();
    fixture.detectChanges();

    const input = host().querySelector<HTMLInputElement>('.rename-input')!;
    input.value = 'Mechanic roster';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(chatState.conversations().find(entry => entry.id === id)?.title).toBe('Mechanic roster');
    expect(host().querySelector('.rename-input')).toBeNull();
  });

  it('abandons a rename on Escape', () => {
    conversation('original title', 'an answer');
    component.startRename(chatState.conversations()[0]);
    fixture.detectChanges();

    const input = host().querySelector<HTMLInputElement>('.rename-input')!;
    input.value = 'discarded';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(chatState.conversations()[0].title).toBe('original title');
  });

  it('pins a conversation and lifts it above more recent ones', () => {
    conversation('older question', 'older answer');
    conversation('newer question', 'newer answer');
    expect(rows()[0].textContent).toContain('newer question');

    const olderRow = rows().find(row => row.textContent?.includes('older question'))!;
    olderRow.querySelector<HTMLButtonElement>('[aria-label^="SHELL.CHAT.HISTORY.PIN_ARIA"]')!.click();
    fixture.detectChanges();

    expect(rows()[0].textContent).toContain('older question');
    expect(host().querySelector('.pin-mark')).not.toBeNull();
  });

  it('keeps focus on the same conversation\'s pin button after it moves to another group', () => {
    // Pinning re-buckets the row into a new `@for` group, tearing down the
    // button that had focus and rebuilding it elsewhere; without a hand-off
    // focus falls to <body>, outside the dialog's focus trap.
    const id = conversation('a question', 'an answer');
    vi.useFakeTimers();

    const pinBtn = host().querySelector<HTMLButtonElement>('[aria-label^="SHELL.CHAT.HISTORY.PIN_ARIA"]')!;
    pinBtn.focus();
    pinBtn.click();
    fixture.detectChanges();
    vi.runAllTimers();
    fixture.detectChanges();

    const movedPinBtn = host().querySelector<HTMLButtonElement>(`[data-pin-for="${id}"]`);
    expect(movedPinBtn).not.toBeNull();
    expect(document.activeElement).toBe(movedPinBtn);
    vi.useRealTimers();
  });

  it('needs a second press to delete a conversation, and the first can be taken back', () => {
    conversation('a question', 'an answer');

    host().querySelector<HTMLButtonElement>('[aria-label^="SHELL.CHAT.HISTORY.DELETE_ARIA"]')!.click();
    fixture.detectChanges();
    expect(chatState.conversations()).toHaveLength(1);
    expect(host().querySelector('.confirm-text')).not.toBeNull();

    host().querySelectorAll<HTMLButtonElement>('.rail-row .row-btn')[1].click();
    fixture.detectChanges();
    expect(chatState.conversations()).toHaveLength(1);
    expect(host().querySelector('.confirm-text')).toBeNull();

    host().querySelector<HTMLButtonElement>('[aria-label^="SHELL.CHAT.HISTORY.DELETE_ARIA"]')!.click();
    fixture.detectChanges();
    host().querySelector<HTMLButtonElement>('.rail-row .row-btn--danger')!.click();
    fixture.detectChanges();

    expect(chatState.conversations()).toHaveLength(0);
  });

  it('needs a second press to clear the whole history', () => {
    conversation('one', 'first answer');
    conversation('two', 'second answer');

    host().querySelector<HTMLButtonElement>('.rail-footer .row-btn--danger')!.click();
    fixture.detectChanges();
    expect(chatState.conversations()).toHaveLength(2);

    host().querySelector<HTMLButtonElement>('.rail-footer .row-btn--danger')!.click();
    fixture.detectChanges();
    expect(chatState.conversations()).toHaveLength(0);
  });

  it('clears the search on Escape instead of letting the dialog close', () => {
    conversation('a question', 'an answer');
    component.search.set('mechanics');
    fixture.detectChanges();

    const input = host().querySelector<HTMLInputElement>('#chat-history-search')!;
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(escape);
    fixture.detectChanges();

    expect(component.search()).toBe('');
    expect(escape.defaultPrevented).toBe(true);

    // An already-empty field lets the key through to close the dialog.
    const second = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });

  it('labels the search field for assistive technology, without showing the label', () => {
    const label = host().querySelector<HTMLElement>('label[for="chat-history-search"]')!;
    expect(label).not.toBeNull();
    // `.sr-only` is the single global utility (src/styles.css); this component
    // must not redefine it locally, so the spec asserts the class is applied
    // rather than a component-scoped rule computing a hidden layout.
    expect(label.classList.contains('sr-only')).toBe(true);
  });

  it('re-buckets "today" across a local midnight rollover without a reload (ADR-0038 §6)', () => {
    // Derived from the real clock, never a literal date string (ADR-0038 §7) —
    // a hardcoded date would expire the day after it was written.
    const beforeMidnight = new Date();
    beforeMidnight.setHours(23, 59, 0, 0);

    const id = conversation('late night question', 'an answer');

    // Fake timers only from here: the outer beforeEach's rail already holds a
    // REAL setInterval, which `vi.advanceTimersByTime` cannot advance. A fresh
    // instance registers its refresh timer as a fake one from birth.
    vi.useFakeTimers();
    vi.setSystemTime(beforeMidnight);
    fixture = TestBed.createComponent(ChatHistoryRailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(
      component.groups().find(group => group.bucket === 'today')?.conversations.some(entry => entry.id === id),
    ).toBe(true);

    // Cross local midnight, then let the rail's own refresh timer catch up —
    // nothing here re-creates the component or re-reads the conversation.
    const afterMidnight = new Date(beforeMidnight);
    afterMidnight.setDate(afterMidnight.getDate() + 1);
    afterMidnight.setHours(0, 5, 0, 0);
    vi.setSystemTime(afterMidnight);
    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();

    expect(
      component.groups().find(group => group.bucket === 'yesterday')?.conversations.some(entry => entry.id === id),
    ).toBe(true);
    vi.useRealTimers();
  });

  it('maps every day bucket to a heading key', () => {
    expect(component.groupLabelKey('pinned')).toBe('SHELL.CHAT.HISTORY.GROUP.PINNED');
    expect(component.groupLabelKey('today')).toBe('SHELL.CHAT.HISTORY.GROUP.TODAY');
    expect(component.groupLabelKey('yesterday')).toBe('SHELL.CHAT.HISTORY.GROUP.YESTERDAY');
    expect(component.groupLabelKey('previous7Days')).toBe('SHELL.CHAT.HISTORY.GROUP.PREVIOUS_7_DAYS');
    expect(component.groupLabelKey('older')).toBe('SHELL.CHAT.HISTORY.GROUP.OLDER');
  });

  describe('keyboard focus across the arm/confirm steps', () => {
    /** Each step removes the control that had focus; without a hand-off it lands
     *  on <body>, outside the dialog and past its focus trap. */
    function flushFocus(): void {
      vi.runAllTimers();
      fixture.detectChanges();
    }

    beforeEach(() => {
      conversation('how many mechanics', 'You have 26.');
      vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it('moves focus into the rename field when renaming starts', () => {
      const conversation = chatState.conversations()[0];
      fixture.componentInstance.startRename(conversation);
      fixture.detectChanges();
      flushFocus();

      expect(document.activeElement).toBe(
        host().querySelector(`[id="rename-${conversation.id}"]`),
      );
    });

    it('moves focus to the confirm button when a delete is armed', () => {
      fixture.componentInstance.armDelete(chatState.conversations()[0]);
      fixture.detectChanges();
      flushFocus();

      expect(document.activeElement).toBe(host().querySelector('[data-confirm="delete"]'));
    });

    it('falls back to the new-chat button once the row is gone', () => {
      fixture.componentInstance.confirmDelete(chatState.conversations()[0]);
      fixture.detectChanges();
      flushFocus();

      expect(document.activeElement).toBe(host().querySelector('.new-chat-btn'));
    });

    it('moves focus across the clear-all arm and confirm steps', () => {
      fixture.componentInstance.armClearAll();
      fixture.detectChanges();
      flushFocus();
      expect(document.activeElement).toBe(host().querySelector('[data-confirm="clear-all"]'));

      fixture.componentInstance.confirmClearAll();
      fixture.detectChanges();
      flushFocus();
      expect(document.activeElement).toBe(host().querySelector('.new-chat-btn'));
    });
  });

  describe('a list load that failed is not an empty history', () => {
    /** Build the rail over a store whose list read behaves as given. */
    async function setupWithList(listConversations: () => Observable<readonly never[]>): Promise<void> {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ChatHistoryRailComponent, TranslateModule.forRoot()],
        providers: [
          {
            provide: AuthService,
            useValue: {
              currentUserClaims: signal<JwtClaims | null>({
                sub: 'admin.alpha',
                tid: 'tenant-one',
                exp: 9999999999,
              }),
            },
          },
          {
            provide: CHAT_HISTORY_STORE,
            useValue: {
              retentionNoteKey: 'SHELL.CHAT.HISTORY.RETENTION_NOTE',
              listConversations,
              loadMessages: () => of([]),
              saveConversation: () => of(undefined),
              saveMessages: () => of(undefined),
              deleteConversation: () => of(undefined),
              clear: () => of(undefined),
            },
          },
        ],
      }).compileComponents();

      chatState = TestBed.inject(ChatStateService);
      chatState.refresh();

      fixture = TestBed.createComponent(ChatHistoryRailComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    }

    it('names the failed load instead of claiming there are no conversations', async () => {
      // The empty copy claims the user has never started a conversation — a claim a
      // failed read never established, and the rail was showing it over an outage
      // the state machine had already reported (ADR-0064 §1/§4).
      await setupWithList(() => throwError(() => new Error('storage unreadable')));

      expect(component.loadFailed()).toBe(true);
      const note = host().querySelector('.rail-empty');
      expect(note?.textContent).toContain('SHELL.CHAT.ERROR.HISTORY_LOAD');
      expect(note?.getAttribute('role')).toBe('status');
      expect(host().textContent).not.toContain('SHELL.CHAT.HISTORY.EMPTY');
    });

    it('shows the empty copy for a list that really is empty', async () => {
      // The other half of the split: answered, and answered nothing.
      await setupWithList(() => of([]));

      expect(component.loadFailed()).toBe(false);
      expect(host().querySelector('.rail-empty')?.textContent).toContain(
        'SHELL.CHAT.HISTORY.EMPTY',
      );
      expect(host().textContent).not.toContain('SHELL.CHAT.ERROR.HISTORY_LOAD');
    });
  });

  describe('retention note (store-owned copy)', () => {
    async function setupWithStore(store: Partial<ChatHistoryStore>): Promise<void> {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ChatHistoryRailComponent, TranslateModule.forRoot()],
        providers: [
          {
            provide: AuthService,
            useValue: {
              currentUserClaims: signal<JwtClaims | null>({
                sub: 'admin.alpha',
                tid: 'tenant-one',
                exp: 9999999999,
              }),
            },
          },
          { provide: CHAT_HISTORY_STORE, useValue: store },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(ChatHistoryRailComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    }

    it("renders the injected store's own retention note key, not a hardcoded claim", async () => {
      // Any key that exists in the bundles and is NOT the local store's own
      // RETENTION_NOTE will do: the point is that a hardcoded "Kept in this
      // browser." fails here, because the footnote is whichever store was
      // provided making its own claim (ADR-0064 §4 — one key, one true claim).
      await setupWithStore({
        retentionNoteKey: 'SHELL.CHAT.HISTORY.EMPTY',
        listConversations: () => new Observable(),
      } as Partial<ChatHistoryStore>);

      expect(component.retentionNoteKey).toBe('SHELL.CHAT.HISTORY.EMPTY');
      expect(host().querySelector('.rail-footer__note')?.textContent?.trim()).toBe(
        'SHELL.CHAT.HISTORY.EMPTY',
      );
    });
  });
});
