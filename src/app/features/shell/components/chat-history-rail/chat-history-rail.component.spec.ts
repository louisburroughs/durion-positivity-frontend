import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
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
          useValue: { currentUserClaims: signal<JwtClaims | null>({ sub: 'admin.alpha', exp: 9999999999 }) },
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
    const pendingId = chatState.beginAssistantTurn();
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

  it('labels the search field for assistive technology', () => {
    expect(host().querySelector('label[for="chat-history-search"]')).not.toBeNull();
  });

  it('maps every day bucket to a heading key', () => {
    expect(component.groupLabelKey('pinned')).toBe('SHELL.CHAT.HISTORY.GROUP.PINNED');
    expect(component.groupLabelKey('today')).toBe('SHELL.CHAT.HISTORY.GROUP.TODAY');
    expect(component.groupLabelKey('yesterday')).toBe('SHELL.CHAT.HISTORY.GROUP.YESTERDAY');
    expect(component.groupLabelKey('previous7Days')).toBe('SHELL.CHAT.HISTORY.GROUP.PREVIOUS_7_DAYS');
    expect(component.groupLabelKey('older')).toBe('SHELL.CHAT.HISTORY.GROUP.OLDER');
  });
});
