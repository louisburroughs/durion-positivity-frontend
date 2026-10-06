import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { LandingRecordFinderComponent } from '../landing-record-finder/landing-record-finder.component';
import { LandingSection, RecordHit } from '../landing.models';
import { LandingSectionsComponent } from './landing-sections.component';

const SECTIONS: readonly LandingSection[] = [
  {
    titleKey: 'SEC.A',
    descriptionKey: 'SEC.A.DESC',
    recordKind: 'estimate',
    cards: [
      { kind: 'direct', icon: 'list_alt', titleKey: 'C.LIST', descriptionKey: 'D', ctaKey: 'CTA', route: '/x' },
      { kind: 'guided', icon: 'description', titleKey: 'C.DETAIL', descriptionKey: 'D', ctaKey: 'CTA', buildCommands: id => ['/x', id] },
    ],
  },
  {
    titleKey: 'SEC.B',
    descriptionKey: 'SEC.B.DESC',
    cards: [{ kind: 'direct', icon: 'timer', titleKey: 'C.TOOL', descriptionKey: 'D', ctaKey: 'CTA', route: '/y' }],
  },
];

describe('LandingSectionsComponent', () => {
  let component: LandingSectionsComponent;
  let fixture: ComponentFixture<LandingSectionsComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingSectionsComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(LandingSectionsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sections', SECTIONS);
    fixture.componentRef.setInput('searchFns', { estimate: () => of<RecordHit[]>([]) });
    fixture.detectChanges();
  });

  it('renders a selector only for sections with a record kind', () => {
    expect(component.hasSelector(SECTIONS[0])).toBe(true);
    expect(component.hasSelector(SECTIONS[1])).toBe(false);
    expect(fixture.debugElement.queryAll(By.directive(LandingRecordFinderComponent)).length).toBe(1);
  });

  it('gates guided cards until a record is selected', () => {
    const section = SECTIONS[0];
    const guided = section.cards[1];
    expect(component.isPending(section, guided)).toBe(true);

    component.onRecordSelected(section, 'EST-1');
    expect(component.isPending(section, guided)).toBe(false);

    component.onRecordCleared(section);
    expect(component.isPending(section, guided)).toBe(true);
  });

  it('navigates a guided card using the selected record id', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const section = SECTIONS[0];
    const guided = section.cards[1];

    // No-op while pending.
    component.launchGuided(section, guided as never);
    expect(navigate).not.toHaveBeenCalled();

    component.onRecordSelected(section, 'EST-1');
    component.launchGuided(section, guided as never);
    expect(navigate).toHaveBeenCalledWith(['/x', 'EST-1']);
  });

  it('keeps a card with a secondary input pending until both values are set', () => {
    const section: LandingSection = {
      titleKey: 'SEC.C',
      descriptionKey: 'D',
      recordKind: 'invoice',
      cards: [
        {
          kind: 'guided',
          icon: 'undo',
          titleKey: 'C.VOID',
          descriptionKey: 'D',
          ctaKey: 'CTA',
          secondary: { labelKey: 'PAY', placeholderKey: 'PAY.PH' },
          buildCommands: (id, pid) => ['/inv', id, 'payments', pid ?? '', 'void'],
        },
      ],
    };
    fixture.componentRef.setInput('sections', [section]);
    const card = section.cards[0];

    component.onRecordSelected(section, 'INV-1');
    expect(component.isPending(section, card)).toBe(true);

    component.onSecondaryInput(component.cardKey(section, card), 'PAY-9');
    expect(component.isPending(section, card)).toBe(false);

    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.launchGuided(section, card as never);
    expect(navigate).toHaveBeenCalledWith(['/inv', 'INV-1', 'payments', 'PAY-9', 'void']);
  });

  it('resolves selector placeholder from the record kind by default', () => {
    expect(component.selectorPlaceholderKey(SECTIONS[0])).toBe('LANDING.KIND.ESTIMATE.PLACEHOLDER');
    expect(component.selectorMode(SECTIONS[0])).toBe('search');
  });

  it('uses h2 section and h3 card headings by default, h3 and h4 when nested', () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('h2.landing-section__title').length).toBe(2);
    expect(host.querySelectorAll('h3.landing-card__title').length).toBe(3);

    fixture.componentRef.setInput('headingLevel', 3);
    fixture.detectChanges();
    expect(host.querySelectorAll('h3.landing-section__title').length).toBe(2);
    expect(host.querySelectorAll('h4.landing-card__title').length).toBe(3);
  });
});

describe('LandingSectionsComponent access filtering', () => {
  const GATED: readonly LandingSection[] = [
    {
      titleKey: 'SEC.OPEN',
      descriptionKey: 'D',
      cards: [
        { kind: 'direct', icon: 'list_alt', titleKey: 'C.OPEN', descriptionKey: 'D', ctaKey: 'CTA', route: '/open' },
        { kind: 'direct', icon: 'lock', titleKey: 'C.READ', descriptionKey: 'D', ctaKey: 'CTA', route: '/read', permissions: ['a:read'] },
      ],
    },
    {
      titleKey: 'SEC.WRITE',
      descriptionKey: 'D',
      cards: [
        {
          kind: 'guided',
          icon: 'edit',
          titleKey: 'C.WRITE',
          descriptionKey: 'D',
          ctaKey: 'CTA',
          buildCommands: id => ['/write', id],
          permissions: ['a:write'],
        },
      ],
    },
  ];

  async function renderWith(held: string[] | null): Promise<LandingSectionsComponent> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [LandingSectionsComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            hasAnyRole: () => false,
            permissionsKnown: () => held !== null,
            hasPermission: (permission: string) => !!held?.includes(permission),
            hasAnyPermission: (permissions: readonly string[]) =>
              !!held && permissions.some(permission => held.includes(permission)),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LandingSectionsComponent);
    fixture.componentRef.setInput('sections', GATED);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('drops inaccessible cards and empty sections', async () => {
    const component = await renderWith(['a:read']);
    expect(component.visibleSections().map(s => s.titleKey)).toEqual(['SEC.OPEN']);
  });

  it('keys entered state to the card, not to its position in the filtered list', async () => {
    // Filtering shifts rendered positions: with 'a:read' withheld, SEC.WRITE
    // renders where SEC.OPEN's read card would be. Index-keyed state would
    // file its record under the wrong section once visibility changed (a
    // token refresh is enough).
    const component = await renderWith(['a:write']);
    const [open, write] = GATED;

    expect(component.visibleSections()[0].titleKey).toBe('SEC.OPEN');
    component.onRecordSelected(write, 'WO-1');

    expect(component.selectedId(write)).toBe('WO-1');
    expect(component.selectedId(open)).toBe('');

    // Secondary values are keyed the same way, so two cards sharing a position
    // across sections cannot collide.
    expect(component.cardKey(write, write.cards[0])).not.toBe(component.cardKey(open, open.cards[0]));
  });

  it('falls back to showing everything for a token without a perm_bits claim', async () => {
    const component = await renderWith(null);
    expect(component.visibleSections().flatMap(s => s.cards.map(c => c.titleKey))).toEqual([
      'C.OPEN',
      'C.READ',
      'C.WRITE',
    ]);
  });
});
