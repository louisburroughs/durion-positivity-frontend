import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { JwtClaims } from '../../core/models/auth.models';
import { AuthService } from '../../core/services/auth.service';
import { MaterialSymbolPipe } from '../../shared/material-symbol.pipe';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ChatApiService } from './services/chat-api.service';
import { NavigationRegistryService } from './services/navigation-registry.service';

/**
 * Guard against icon-name drift: every Material Symbol name referenced by the
 * data-driven sources (nav registry, dashboard action/recent/favorite arrays)
 * and the fixed template literals must resolve through the msIcon pipe to a
 * real glyph. An unmapped name resolves to '' (invisible) with no other build
 * signal, so this test is the signal.
 */
describe('Material Symbol icon coverage', () => {
  const pipe = new MaterialSymbolPipe();

  // Icon names hard-coded in templates (header chat toggle, chat-panel close,
  // dashboard assistant/chevron/star). Keep in sync if those literals change.
  const TEMPLATE_LITERAL_ICONS = ['forum', 'send', 'close', 'chevron_right', 'star'];

  function assertResolves(name: string, source: string): void {
    const glyph = pipe.transform(name);
    expect(glyph, `icon "${name}" (${source}) is not mapped in the msIcon GLYPHS table`).not.toBe('');
    expect(glyph.length, `icon "${name}" (${source}) did not resolve to a single glyph`).toBe(1);
  }

  it('maps every nav-registry icon', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { hasAnyRole: () => true } },
      ],
    });
    const registry = TestBed.inject(NavigationRegistryService);
    const items = registry.visibleNavItems();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      assertResolves(item.icon, `nav:${item.key}`);
    }
  });

  it('maps every dashboard icon', () => {
    TestBed.configureTestingModule({
      imports: [DashboardComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUserClaims: signal<JwtClaims | null>(null) } },
        { provide: ChatApiService, useValue: { sendMessage: () => ({ subscribe: () => ({}) }) } },
      ],
    });
    const cmp = TestBed.createComponent(DashboardComponent).componentInstance;
    const names = [
      ...cmp.quickActions.map(a => a.icon),
      ...cmp.recentItems.map(r => r.icon),
      ...cmp.favoriteAreas.map(f => f.icon),
    ];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      assertResolves(name, 'dashboard');
    }
  });

  it('maps every fixed template-literal icon', () => {
    for (const name of TEMPLATE_LITERAL_ICONS) {
      assertResolves(name, 'template-literal');
    }
  });
});
