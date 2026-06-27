import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { JwtClaims } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';
import { ChatApiService, ChatResponse } from '../services/chat-api.service';
import { ChatStateService } from '../services/chat-state.service';
import { ChatUiService } from '../services/chat-ui.service';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let chatState: ChatStateService;

  const claims = signal<JwtClaims | null>(null);

  const authServiceStub: Pick<AuthService, 'currentUserClaims'> = {
    currentUserClaims: claims,
  };

  const chatApiStub: Pick<ChatApiService, 'sendMessage'> = {
    sendMessage: vi.fn(),
  };

  beforeEach(async () => {
    claims.set(null);
    (chatApiStub.sendMessage as ReturnType<typeof vi.fn>).mockReset();

    await TestBed.configureTestingModule({
      imports: [DashboardComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceStub },
        { provide: ChatApiService, useValue: chatApiStub },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      SHELL: {
        DASHBOARD: {
          WELCOME_HEADING: 'Welcome back, {{name}}',
          WELCOME_HEADING_GENERIC: 'Welcome back',
        },
      },
    });
    translate.use('en');

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    chatState = TestBed.inject(ChatStateService);
    fixture.detectChanges();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders exactly one h1', () => {
    expect(host().querySelectorAll('h1').length).toBe(1);
  });

  it('derives the first name from the first token of an email/dotted JWT sub', () => {
    claims.set({ sub: 'jane.doe@durion.com', exp: 9999999999 });
    fixture.detectChanges();
    expect(component.firstName()).toBe('Jane');
    expect(host().querySelector('h1')?.textContent).toContain('Jane');
  });

  it('falls back to a generic greeting when no claim is present', () => {
    claims.set(null);
    fixture.detectChanges();
    expect(component.firstName()).toBeNull();
    expect(host().querySelector('h1')?.textContent?.trim()).toBe('Welcome back');
  });

  it('renders a routerLink quick-action card per configured action', () => {
    const links = host().querySelectorAll<HTMLAnchorElement>('.action-card');
    expect(links.length).toBe(component.quickActions.length);
    const hrefs = Array.from(links).map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/app/workexec');
    expect(hrefs).toContain('/app/inventory');
  });

  it('uses a button (not an anchor) for the send control', () => {
    const send = host().querySelector<HTMLButtonElement>('.assistant-send');
    expect(send?.tagName).toBe('BUTTON');
    expect(send?.getAttribute('type')).toBe('button');
  });

  it('keeps a People-area entry point on the home page', () => {
    const hrefs = Array.from(host().querySelectorAll<HTMLAnchorElement>('a[href]')).map(a =>
      a.getAttribute('href'),
    );
    expect(hrefs).toContain('/app/people');
  });

  it('routes the schedule quick action to the schedule view', () => {
    const action = component.quickActions.find(a => a.labelKey.endsWith('SCHEDULE'));
    expect(action?.route).toBe('/app/shopmgmt/schedule');
  });

  it('disables send while the assistant input is empty', () => {
    const send = host().querySelector<HTMLButtonElement>('.assistant-send');
    expect(send?.disabled).toBe(true);
  });

  it('forwards a submitted message into the shared chat state and calls the API', () => {
    (chatApiStub.sendMessage as ReturnType<typeof vi.fn>).mockReturnValue(
      of<ChatResponse>({ response: 'pong' }),
    );

    component.assistantInput.set('hello');
    component.submitAssistant();

    expect(chatApiStub.sendMessage).toHaveBeenCalledWith({ message: 'hello' });
    const messages = chatState.messages();
    expect(messages.some(m => m.sender === 'user' && m.content === 'hello')).toBe(true);
    expect(messages.some(m => m.sender === 'system' && m.content === 'pong')).toBe(true);
    expect(component.assistantInput()).toBe('');
  });

  it('opens the shell chat panel when a message is submitted', () => {
    const chatUi = TestBed.inject(ChatUiService);
    const openSpy = vi.spyOn(chatUi, 'open');
    (chatApiStub.sendMessage as ReturnType<typeof vi.fn>).mockReturnValue(
      of<ChatResponse>({ response: 'pong' }),
    );

    component.assistantInput.set('hello');
    component.submitAssistant();

    expect(openSpy).toHaveBeenCalled();
  });

  it('adds a fallback system message when the chat API errors', () => {
    (chatApiStub.sendMessage as ReturnType<typeof vi.fn>).mockReturnValue(
      throwError(() => new Error('boom')),
    );

    component.assistantInput.set('hi');
    component.submitAssistant();

    expect(chatState.messages().some(m => m.sender === 'system')).toBe(true);
    expect(component.assistantSending()).toBe(false);
  });

  it('ignores empty submissions', () => {
    component.assistantInput.set('   ');
    component.submitAssistant();
    expect(chatApiStub.sendMessage).not.toHaveBeenCalled();
  });
});
