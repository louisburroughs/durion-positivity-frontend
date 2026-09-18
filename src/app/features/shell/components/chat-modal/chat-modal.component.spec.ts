import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NEVER, of, throwError } from 'rxjs';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import { ChatApiService, ChatResponse } from '../../services/chat-api.service';
import { CHAT_HISTORY_STORE } from '../../services/chat-history.store';
import { ChatSendService } from '../../services/chat-send.service';
import { ChatStateService } from '../../services/chat-state.service';
import { ChatUiService } from '../../services/chat-ui.service';
import { ChatModalComponent } from './chat-modal.component';

describe('ChatModalComponent', () => {
  let fixture: ComponentFixture<ChatModalComponent>;
  let chatUi: ChatUiService;
  let chatState: ChatStateService;

  const chatApiStub: Pick<ChatApiService, 'sendMessage' | 'ingestDocument'> = {
    sendMessage: vi.fn(),
    ingestDocument: vi.fn(),
  };

  const authServiceStub = {
    permissionsKnown: vi.fn().mockReturnValue(true),
    hasAnyPermission: vi.fn().mockReturnValue(false),
    currentUserClaims: signal<JwtClaims | null>({ sub: 'admin.alpha', tid: 'tenant-one', exp: 9999999999 }),
  };

  beforeEach(async () => {
    localStorage.clear();
    vi.mocked(chatApiStub.sendMessage).mockReset();
    vi.mocked(chatApiStub.sendMessage).mockReturnValue(of<ChatResponse>({ response: 'You have 26.' }));
    vi.mocked(authServiceStub.permissionsKnown).mockReturnValue(true);
    vi.mocked(authServiceStub.hasAnyPermission).mockReturnValue(false);

    await TestBed.configureTestingModule({
      imports: [ChatModalComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ChatApiService, useValue: chatApiStub },
        { provide: AuthService, useValue: authServiceStub },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', {
      SHELL: { CHAT: { EMPTY: { SUGGESTION_1: 'How many mechanics do I have?' } } },
    });
    translate.use('en-US');

    chatUi = TestBed.inject(ChatUiService);
    chatState = TestBed.inject(ChatStateService);
    chatUi.openModal();
    chatState.startNewConversation();

    fixture = TestBed.createComponent(ChatModalComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function dialog(): HTMLDialogElement {
    return host().querySelector<HTMLDialogElement>('dialog')!;
  }

  it('renders a native modal dialog labelled by its title', () => {
    // A real showModal() call is what makes this a modal — an aria-modal
    // attribute on a div implements nothing (ADR-0029 §8.1).
    expect(dialog().matches(':modal')).toBe(true);
    expect(dialog().getAttribute('aria-labelledby')).toBe('chat-dialog-title');
    expect(host().querySelector('#chat-dialog-title')).not.toBeNull();
  });

  it('shows the empty state with suggestions before anything is asked', () => {
    expect(host().querySelector('.chat-empty')).not.toBeNull();
    expect(host().querySelectorAll('.suggestion').length).toBeGreaterThan(0);
  });

  it('sends a suggestion and replaces the empty state with the thread', () => {
    host().querySelector<HTMLButtonElement>('.suggestion')?.click();
    fixture.detectChanges();

    expect(chatApiStub.sendMessage).toHaveBeenCalledWith({ message: 'How many mechanics do I have?' });
    expect(chatState.messages()).toHaveLength(2);
    expect(host().querySelector('.chat-empty')).toBeNull();
    expect(host().querySelectorAll('app-chat-message')).toHaveLength(2);
  });

  it('sends what the composer submits', () => {
    const textarea = host().querySelector<HTMLTextAreaElement>('#chat-composer-input')!;
    textarea.value = 'open workorders';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    host().querySelector<HTMLButtonElement>('.icon-btn--send')?.click();
    fixture.detectChanges();

    expect(chatApiStub.sendMessage).toHaveBeenCalledWith({ message: 'open workorders' });
  });

  it('closes when the native dialog fires cancel (Escape)', () => {
    // appModalDialog forwards the browser's own Escape handling as `cancel`; a
    // scripted keydown never reaches the UA's Escape-to-close algorithm, so the
    // directive's contract is exercised at the event it actually translates.
    dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(chatUi.open()).toBe(false);
  });

  it('closes when the backdrop is clicked', () => {
    // A click on `::backdrop` fires a click event on the dialog element itself,
    // with target set to the dialog — never to anything inside it.
    dialog().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chatUi.open()).toBe(false);
  });

  it('does not close when a click inside the dialog bubbles to it', () => {
    const header = host().querySelector('.chat-header')!;
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chatUi.open()).toBe(true);
  });

  it('closes from the close button', () => {
    host().querySelector<HTMLButtonElement>('.icon-btn--close')?.click();
    expect(chatUi.open()).toBe(false);
  });

  it('toggles the history rail', () => {
    const railOpen = chatUi.historyRailOpen();
    expect(host().querySelector('app-chat-history-rail') !== null).toBe(railOpen);

    fixture.componentInstance.toggleHistoryRail();
    fixture.detectChanges();

    expect(chatUi.historyRailOpen()).toBe(!railOpen);
    expect(host().querySelector('app-chat-history-rail') !== null).toBe(!railOpen);
  });

  it('starts a new conversation without discarding the stored one', () => {
    host().querySelector<HTMLButtonElement>('.suggestion')?.click();
    fixture.detectChanges();
    expect(chatState.conversations()).toHaveLength(1);

    fixture.componentInstance.newChat();
    fixture.detectChanges();

    expect(chatState.messages()).toHaveLength(0);
    expect(chatState.conversations()).toHaveLength(1);
  });

  it('does not point aria-controls at an element that is not there', () => {
    // The rail's id only exists while it is open, so a static aria-controls was a
    // dangling reference whenever it was closed.
    const toggle = host().querySelector('.chat-header .icon-btn')!;
    expect(toggle.hasAttribute('aria-expanded')).toBe(true);
    expect(toggle.hasAttribute('aria-controls')).toBe(false);
  });

  it('puts initial focus in the composer when the dialog opens', () => {
    // `showModal()` traps focus in the top layer; this asserts the deliberate
    // pick inside it, not merely that focus landed somewhere in the document.
    expect(document.activeElement).toBe(host().querySelector('#chat-composer-input'));
  });

  it('returns focus to whatever opened it when it closes', () => {
    // One modal at a time: with the beforeEach's dialog still open, everything
    // outside it — including a freshly appended `opener` — is inert and cannot
    // take focus, so that dialog has to close first.
    fixture.destroy();

    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const reopened = TestBed.createComponent(ChatModalComponent);
    reopened.detectChanges();
    reopened.destroy();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('falls back to the header chat toggle when the opener is gone on close', () => {
    fixture.destroy();

    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const chatToggle = document.createElement('button');
    chatToggle.setAttribute('data-chat-opener', '');
    document.body.appendChild(chatToggle);

    const reopened = TestBed.createComponent(ChatModalComponent);
    reopened.detectChanges();

    // The opener a background refresh would remove — simulated directly here.
    opener.remove();
    reopened.destroy();

    expect(document.activeElement).toBe(chatToggle);
    chatToggle.remove();
  });

  it('closes the history rail when a conversation is opened on a narrow viewport', () => {
    chatUi.showHistoryRail();
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);

    fixture.componentInstance.onConversationOpened();

    expect(chatUi.historyRailOpen()).toBe(false);
  });

  it('leaves the rail open when a conversation is opened on a wide viewport', () => {
    chatUi.showHistoryRail();
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);

    fixture.componentInstance.onConversationOpened();

    expect(chatUi.historyRailOpen()).toBe(true);
  });

  // ── Document-ingest permission gate (ADR-0040 §6a) ────────────────────────
  it('hides the document-ingest control when the permission is denied', () => {
    expect(fixture.componentInstance.canIngestDocuments()).toBe(false);
    expect(host().querySelector('[aria-label="SHELL.RAG.BUTTON_ARIA"]')).toBeNull();
  });

  it('offers the document-ingest control when the permission is granted', () => {
    vi.mocked(authServiceStub.hasAnyPermission).mockReturnValue(true);
    const granted = TestBed.createComponent(ChatModalComponent);
    granted.detectChanges();

    const grantedHost = granted.nativeElement as HTMLElement;
    expect(grantedHost.querySelector('[aria-label="SHELL.RAG.BUTTON_ARIA"]')).not.toBeNull();
    granted.destroy();
  });

  it('leaves the control available when perm_bits is unknown — the legacy canAccess() fallback', () => {
    vi.mocked(authServiceStub.permissionsKnown).mockReturnValue(false);
    vi.mocked(authServiceStub.hasAnyPermission).mockReturnValue(false);
    const legacy = TestBed.createComponent(ChatModalComponent);
    legacy.detectChanges();

    const legacyHost = legacy.nativeElement as HTMLElement;
    expect(legacyHost.querySelector('[aria-label="SHELL.RAG.BUTTON_ARIA"]')).not.toBeNull();
    legacy.destroy();
  });

  it('refuses to open the ingest dialog on a denied permission, even called directly', () => {
    // The control is disabled/absent, but the method is the actual guard
    // (ADR-0040 §6a.1) — a keyboard/automation path that reaches the method
    // must still be refused.
    expect(fixture.componentInstance.canIngestDocuments()).toBe(false);

    fixture.componentInstance.openRagDialog();
    fixture.detectChanges();

    expect(fixture.componentInstance.showRagDialog()).toBe(false);
  });

  it('opens the ingest dialog when the permission is granted', () => {
    vi.mocked(authServiceStub.hasAnyPermission).mockReturnValue(true);
    const granted = TestBed.createComponent(ChatModalComponent);
    granted.detectChanges();

    granted.componentInstance.openRagDialog();
    granted.detectChanges();

    expect(granted.componentInstance.showRagDialog()).toBe(true);
    granted.destroy();
  });

  it('leaves the chat open when the nested ingest dialog is dismissed via Escape', () => {
    // Nested `showModal()` dialogs stack in the top layer: the browser's native
    // Escape handling only ever reaches the topmost one, so the outer dialog
    // needs no code at all to stay open while the inner one closes.
    vi.mocked(authServiceStub.hasAnyPermission).mockReturnValue(true);
    const granted = TestBed.createComponent(ChatModalComponent);
    granted.detectChanges();
    granted.componentInstance.openRagDialog();
    granted.detectChanges();

    const nested = (granted.nativeElement as HTMLElement).querySelector('app-rag-ingest-dialog dialog')!;
    nested.dispatchEvent(new Event('cancel', { cancelable: true }));
    granted.detectChanges();

    expect(chatUi.open()).toBe(true);
    expect(granted.componentInstance.showRagDialog()).toBe(false);
    granted.destroy();
  });

  it('holds the composer while a conversation is still loading', async () => {
    // Sending here would record the turn against the conversation being replaced,
    // and the arriving load would then overwrite the thread and lose the turn.
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ChatModalComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ChatApiService, useValue: chatApiStub },
        { provide: AuthService, useValue: authServiceStub },
        {
          provide: CHAT_HISTORY_STORE,
          useValue: {
            retentionNoteKey: 'SHELL.CHAT.HISTORY.RETENTION_NOTE',
            listConversations: () => of([]),
            // Never settles: the conversation stays mid-open.
            loadMessages: () => NEVER,
            saveConversation: () => of(undefined),
            saveMessages: () => of(undefined),
            deleteConversation: () => of(undefined),
            clear: () => of(undefined),
          },
        },
      ],
    }).compileComponents();

    const state = TestBed.inject(ChatStateService);
    TestBed.inject(ChatUiService).openModal();
    state.appendUserMessage('first question');
    const first = state.activeConversationId()!;
    state.startNewConversation();

    const loading = TestBed.createComponent(ChatModalComponent);
    loading.detectChanges();

    state.selectConversation(first);
    loading.detectChanges();

    expect(state.switching()).toBe(true);
    const loadingHost = loading.nativeElement as HTMLElement;
    expect(loadingHost.querySelector<HTMLButtonElement>('.icon-btn--send')!.disabled).toBe(true);
    // useSuggestion() calls send() directly, so a live suggestion is the same
    // defect by another route.
    for (const suggestion of loadingHost.querySelectorAll<HTMLButtonElement>('.suggestion')) {
      expect(suggestion.disabled).toBe(true);
    }

    // retry() is the same public-entry-point defect useSuggestion() already
    // proved: the button looks disabled, but the method is the real guard
    // (PR #288 review PRRT_kwDORX-kkM6j14fF).
    const retrySpy = vi.spyOn(TestBed.inject(ChatSendService), 'retry');
    loading.componentInstance.retry('any-message-id');
    expect(retrySpy).not.toHaveBeenCalled();
  });

  it('refuses a send that arrives while a conversation is still opening', () => {
    // send() is the entry point every path funnels through — the composer's
    // (submitted) output, a suggestion, the template — and the disabled button is
    // not the guard: a send that gets through while switching() is true is
    // recorded against the conversation being replaced, and the arriving
    // selection load then overwrites the thread and loses it. Same defect
    // useSuggestion() and retry() already carry this guard for
    // (PR #288 review r4051062889).
    const state = TestBed.inject(ChatStateService);
    state.appendUserMessage('first question');
    const first = state.activeConversationId()!;
    state.startNewConversation();

    // The store here never settles a conversation load, so the switch stays open.
    vi.spyOn(TestBed.inject(CHAT_HISTORY_STORE), 'loadMessages').mockReturnValue(NEVER);
    const sendSpy = vi.spyOn(TestBed.inject(ChatSendService), 'send');

    state.selectConversation(first);
    expect(state.switching()).toBe(true);

    fixture.componentInstance.send('a question typed mid-switch');

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('shows a status, not an alert, when a history write is refused — the thread on screen still works', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ChatModalComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ChatApiService, useValue: chatApiStub },
        { provide: AuthService, useValue: authServiceStub },
        {
          provide: CHAT_HISTORY_STORE,
          useValue: {
            retentionNoteKey: 'SHELL.CHAT.HISTORY.RETENTION_NOTE',
            listConversations: () => of([]),
            loadMessages: () => of([]),
            saveConversation: () => throwError(() => new Error('quota exceeded')),
            saveMessages: () => throwError(() => new Error('quota exceeded')),
            deleteConversation: () => of(undefined),
            clear: () => of(undefined),
          },
        },
      ],
    }).compileComponents();

    const state = TestBed.inject(ChatStateService);
    TestBed.inject(ChatUiService).openModal();

    // Created AFTER the component's own refresh() (constructor) has already
    // resolved against the empty list: `refresh()` prunes an active
    // conversation the list doesn't carry, which would otherwise wipe the very
    // message this test asserts survives the write failure.
    const persisting = TestBed.createComponent(ChatModalComponent);
    persisting.detectChanges();

    state.startNewConversation();
    state.appendUserMessage('a question that cannot be saved');
    persisting.detectChanges();

    const persistingHost = persisting.nativeElement as HTMLElement;
    const warning = persistingHost.querySelector('.chat-persist-warning');
    expect(warning?.getAttribute('role')).toBe('status');
    expect(warning?.textContent).toContain('SHELL.CHAT.ERROR.PERSIST');
    // A lost write is not a broken thread — the message is still on screen and
    // the load-state machine never moves to 'error' for it.
    expect(state.messages()).toHaveLength(1);
    expect(state.state()).not.toBe('error');
  });

  it('sends when nothing is in flight — the positive half of the guard', () => {
    // The negative half (a send refused while a conversation is opening) is the
    // spec below; a suite that pins only the refusal has not tested the split
    // (ADR-0035 §7).
    const sendSpy = vi.spyOn(TestBed.inject(ChatSendService), 'send');

    fixture.componentInstance.send('how many mechanics do I have?');

    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('neutralises a formula when the whole transcript is copied (F2)', async () => {
    let written = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => ((written = text), Promise.resolve()) },
    });

    chatState.appendUserMessage('question');
    const target = chatState.beginAssistantTurn()!;
    chatState.completeAssistantTurn(target, [
      {
        kind: 'table',
        title: null,
        columns: [{ label: 'Link', align: 'start' }],
        rows: [['=HYPERLINK("http://evil","x")']],
      },
      // The type is `number`; nothing at runtime stops a malformed payload from
      // handing back a formula-shaped string here.
      { kind: 'chart', title: null, series: [{ label: 'Total', value: '=1+1' as unknown as number }] },
    ]);

    fixture.componentInstance.copyTranscript();
    await Promise.resolve();

    expect(written).toContain("'=HYPERLINK");
    expect(written).toContain("'=1+1");
  });

  it('scrolls to the newest turn when switching between two conversations of equal length (F20)', () => {
    // The count-based check in ngAfterViewChecked cannot see this switch: both
    // conversations hold exactly two messages, so onConversationOpened() has to
    // force the scroll itself.
    chatState.appendUserMessage('question in A');
    const targetA = chatState.beginAssistantTurn()!;
    chatState.completeAssistantTurn(targetA, [{ kind: 'text', text: 'answer in A' }]);
    const conversationA = chatState.activeConversationId()!;

    chatState.startNewConversation();
    chatState.appendUserMessage('question in B');
    const targetB = chatState.beginAssistantTurn()!;
    chatState.completeAssistantTurn(targetB, [{ kind: 'text', text: 'answer in B' }]);
    fixture.detectChanges();
    expect(chatState.messages()).toHaveLength(2);

    const thread = host().querySelector<HTMLElement>('.chat-thread')!;
    let scrollTopValue = 0;
    Object.defineProperty(thread, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(thread, 'scrollHeight', { configurable: true, value: 4000 });
    // Simulate the user having scrolled up in conversation B before switching.
    thread.scrollTop = 0;

    chatState.selectConversation(conversationA);
    fixture.componentInstance.onConversationOpened();
    fixture.detectChanges();

    expect(thread.scrollTop).toBe(4000);
  });

  it('puts focus in the composer after a suggestion removes the empty state', async () => {
    // The clicked suggestion is gone the moment the thread appears; without a
    // hand-off focus lands on <body>, outside the dialog.
    const suggestion = host().querySelector<HTMLButtonElement>('.suggestion')!;
    suggestion.focus();
    suggestion.click();
    fixture.detectChanges();

    await new Promise(resolve => setTimeout(resolve));
    fixture.detectChanges();

    expect(host().querySelector('.suggestion')).toBeNull();
    expect(document.activeElement).toBe(host().querySelector('#chat-composer-input'));
  });
});
