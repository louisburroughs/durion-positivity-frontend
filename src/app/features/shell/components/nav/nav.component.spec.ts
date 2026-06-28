import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NavComponent } from './nav.component';
import { NavigationRegistryService } from '../../services/navigation-registry.service';
import { IconFontService } from '../../../../core/services/icon-font.service';
import type { NavItem } from '../../models/nav-item.model';

const testItems: NavItem[] = [
  { key: 'SHELL.NAV.DASHBOARD', icon: 'space_dashboard', route: '/app', exact: true, order: 1, group: 'main' },
  { key: 'SHELL.NAV.WORKORDERS', icon: 'construction', route: '/app/workexec', order: 2, group: 'main' },
  { key: 'SHELL.NAV.CRM', icon: 'groups', route: '/app/crm', order: 3, group: 'main' },
];

describe('NavComponent', () => {
  let fixture: ComponentFixture<NavComponent>;
  let component: NavComponent;

  const navRegistryServiceStub: Pick<NavigationRegistryService, 'visibleNavItems'> = {
    visibleNavItems: signal(testItems),
  };
  const iconFontReady = signal(false);
  const iconFontStub: Pick<IconFontService, 'ready'> = { ready: iconFontReady };

  beforeEach(async () => {
    iconFontReady.set(false);
    await TestBed.configureTestingModule({
      imports: [NavComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: NavigationRegistryService, useValue: navRegistryServiceStub },
        { provide: IconFontService, useValue: iconFontStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders one nav link per visible item', () => {
    const links = fixture.debugElement.queryAll(By.css('a.nav-item'));

    expect(links).toHaveLength(testItems.length);
  });

  it('displays a nav-label span for each item when not collapsed', () => {
    // default collapsed input is false — nav-label spans must be present
    const labels = fixture.debugElement.queryAll(By.css('.nav-label'));

    expect(labels).toHaveLength(testItems.length);
    expect(labels[0].nativeElement.textContent.trim()).toBe(testItems[0].key);
  });

  it('hides nav-label spans when collapsed input is true', () => {
    fixture.componentRef.setInput('collapsed', true);
    fixture.detectChanges();

    const labels = fixture.debugElement.queryAll(By.css('.nav-label'));

    expect(labels).toHaveLength(0);
  });

  it('shows a single-letter text fallback when the icon font is not ready', () => {
    // iconFontReady defaults to false — collapsed rail must stay identifiable.
    const fallbacks = fixture.debugElement.queryAll(By.css('.nav-fallback'));
    const glyphs = fixture.debugElement.queryAll(By.css('.nav-icon .material-symbols-rounded'));

    expect(glyphs).toHaveLength(0);
    expect(fallbacks).toHaveLength(testItems.length);
    // first char of the (untranslated) label key; CSS uppercases it
    expect(fallbacks[0].nativeElement.textContent.trim()).toBe('S');
  });

  it('renders the glyph and drops the fallback once the icon font is ready', () => {
    iconFontReady.set(true);
    fixture.detectChanges();

    const fallbacks = fixture.debugElement.queryAll(By.css('.nav-fallback'));
    const glyphs = fixture.debugElement.queryAll(By.css('.nav-icon .material-symbols-rounded'));

    expect(fallbacks).toHaveLength(0);
    expect(glyphs).toHaveLength(testItems.length);
    // space_dashboard resolves to its glyph codepoint via the msIcon pipe
    expect(glyphs[0].nativeElement.textContent.trim()).toBe('');
  });

  it('keeps the fallback visible in the collapsed rail when the font is not ready', () => {
    fixture.componentRef.setInput('collapsed', true);
    fixture.detectChanges();

    const fallbacks = fixture.debugElement.queryAll(By.css('.nav-fallback'));

    expect(fallbacks).toHaveLength(testItems.length);
  });

  it('sets the id attribute on the nav element to the default shell-nav', () => {
    const nav = fixture.debugElement.query(By.css('nav'));

    expect(nav.nativeElement.id).toBe('shell-nav');
  });

  it('sets the id attribute on the nav element from the navId input', () => {
    fixture.componentRef.setInput('navId', 'sidebar-nav');
    fixture.detectChanges();

    const nav = fixture.debugElement.query(By.css('nav'));

    expect(nav.nativeElement.id).toBe('sidebar-nav');
  });
});
