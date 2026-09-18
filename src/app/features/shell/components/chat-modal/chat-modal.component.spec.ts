import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import { ChatApiService, ChatResponse } from '../../services/chat-api.service';
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

  const authServiceStub: Pick<AuthService, 'hasAnyRole' | 'currentUserClaims'> = {
    hasAnyRole: vi.fn().mockReturnValue(false),
    currentUserClaims: signal<JwtClaims | null>({ sub: 'admin.alpha', exp: 9999999999 }),
  };

  beforeEach(async () => {
    localStorage.clear();
    vi.mocked(chatApiStub.sendMessage).mockReset();
    vi.mocked(chatApiStub.sendMessage).mockReturnValue(of<ChatResponse>({ response: 'You have 26.' }));

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

  function dialog(): HTMLElement {
    return host().querySelector<HTMLElement>('[role="dialog"]')!;
  }

  it('renders a modal dialog labelled by its title', () => {
    expect(dialog().getAttribute('aria-modal')).toBe('true');
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

  it('closes on Escape', () => {
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(chatUi.open()).toBe(false);
  });

  it('closes when the backdrop is clicked', () => {
    host().querySelector<HTMLButtonElement>('.chat-backdrop')?.click();
    expect(chatUi.open()).toBe(false);
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

  it('puts initial focus on a visible control when the composer is hidden', () => {
    // On a narrow viewport the open rail covers the composer; focusing a hidden
    // textarea is a no-op that would leave focus on the opener, outside the modal.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const composer = host().querySelector<HTMLElement>('#chat-composer-input')!;
    composer.style.display = 'none';

    fixture.componentInstance['focusInitial']();

    expect(dialog().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(opener);
    composer.style.display = '';
    opener.remove();
  });

  it('keeps Tab inside the dialog, wrapping at both ends', () => {
    const focusable = [
      ...dialog().querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
      ),
    ].filter(element => element.getClientRects().length > 0);
    expect(focusable.length).toBeGreaterThan(1);

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog().dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    dialog().dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('pulls focus back in when Tab is pressed from outside the trap root', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(dialog().contains(document.activeElement)).toBe(false);

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(dialog().contains(document.activeElement)).toBe(true);
    outside.remove();
  });

  it('returns focus to whatever opened it when it closes', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const reopened = TestBed.createComponent(ChatModalComponent);
    reopened.detectChanges();
    reopened.destroy();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('stops the page behind it scrolling while it is open', () => {
    expect(document.body.style.overflow).toBe('hidden');
    fixture.destroy();
    expect(document.body.style.overflow).not.toBe('hidden');
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

  it('hides the document-ingest control from non-admins', () => {
    expect(fixture.componentInstance.isAdmin()).toBe(false);
    expect(host().querySelector('[aria-label="SHELL.RAG.BUTTON_ARIA"]')).toBeNull();
  });

  it('offers the document-ingest control to an admin', () => {
    vi.mocked(authServiceStub.hasAnyRole).mockReturnValue(true);
    const adminFixture = TestBed.createComponent(ChatModalComponent);
    adminFixture.detectChanges();

    const adminHost = adminFixture.nativeElement as HTMLElement;
    expect(adminHost.querySelector('[aria-label="SHELL.RAG.BUTTON_ARIA"]')).not.toBeNull();
  });
});
