import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { JwtClaims } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';
import { ChatUiService } from '../services/chat-ui.service';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let chatUi: ChatUiService;

  const claims = signal<JwtClaims | null>(null);

  const authServiceStub: Pick<AuthService, 'currentUserClaims'> = {
    currentUserClaims: claims,
  };

  beforeEach(async () => {
    claims.set(null);

    await TestBed.configureTestingModule({
      imports: [DashboardComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: AuthService, useValue: authServiceStub }],
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
    chatUi = TestBed.inject(ChatUiService);
    chatUi.close();
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

  it('offers the assistant as a launcher button, not a second message box', () => {
    const launcher = host().querySelector<HTMLButtonElement>('.assistant-launcher');
    expect(launcher?.tagName).toBe('BUTTON');
    expect(launcher?.getAttribute('type')).toBe('button');
    expect(launcher?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(host().querySelector('.assistant-input')).toBeNull();
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

  it('opens the assistant dialog when the launcher is clicked', () => {
    expect(chatUi.open()).toBe(false);
    host().querySelector<HTMLButtonElement>('.assistant-launcher')?.click();
    expect(chatUi.open()).toBe(true);
  });

  it('shows a keyboard-shortcut hint on the launcher', () => {
    const shortcut = host().querySelector('.assistant-launcher__shortcut');
    expect(shortcut?.textContent).toContain('K');
  });

  it('renders the same shortcut hint the server would, until after hydration', () => {
    // The server cannot know the platform. Branching on it during render made SSR
    // emit `Ctrl` where a Mac client expected `⌘` — a hydration text mismatch on
    // every Apple device.
    // Restored in `finally`: a leaked getter spy on the shared `navigator` outlives this file, and
    // a later `vi.resetAllMocks()` turns it into `() => undefined`, crashing Angular forms'
    // DefaultValueAccessor (`userAgent.toLowerCase()`) in whichever spec runs next.
    const userAgent = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    try {
      const fresh = TestBed.createComponent(DashboardComponent);
      expect(fresh.componentInstance.shortcutModifier()).toBe('Ctrl');

      fresh.detectChanges();
      expect(fresh.componentInstance.shortcutModifier()).toBe('\u2318');
    } finally {
      userAgent.mockRestore();
    }
  });
});
