import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { vi, describe, beforeEach, it, expect } from 'vitest';

import { AuthService } from '../../../core/services/auth.service';
import { LandingPageComponent } from './landing-page.component';
import { LandingPageConfig, RecordHit } from '../landing.models';

const CONFIG: LandingPageConfig = {
  eyebrowKey: 'EYEBROW',
  titleKey: 'TITLE',
  descriptionKey: 'DESC',
  sections: [
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
  ],
};

describe('LandingPageComponent', () => {
  let component: LandingPageComponent;
  let fixture: ComponentFixture<LandingPageComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(LandingPageComponent);
    component = fixture.componentInstance;
    component.config = CONFIG;
    component.searchFns = { estimate: () => of<RecordHit[]>([]) };
    fixture.detectChanges();
  });

  it('derives stat counts from the config', () => {
    expect(component.totalCount()).toBe(3);
    expect(component.directCount()).toBe(2);
    expect(component.guidedCount()).toBe(1);
    expect(component.hasGuided()).toBe(true);
  });

  it('renders a selector only for sections with a record kind', () => {
    expect(component.hasSelector(CONFIG.sections[0])).toBe(true);
    expect(component.hasSelector(CONFIG.sections[1])).toBe(false);
  });

  it('gates guided cards until a record is selected', () => {
    const section = CONFIG.sections[0];
    const guided = section.cards[1];
    expect(component.isPending(section, guided)).toBe(true);

    component.onRecordSelected(section, 'EST-1');
    expect(component.isPending(section, guided)).toBe(false);

    component.onRecordCleared(section);
    expect(component.isPending(section, guided)).toBe(true);
  });

  it('navigates a guided card using the selected record id', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const section = CONFIG.sections[0];
    const guided = section.cards[1];

    // No-op while pending.
    component.launchGuided(section, guided as never);
    expect(navigate).not.toHaveBeenCalled();

    component.onRecordSelected(section, 'EST-1');
    component.launchGuided(section, guided as never);
    expect(navigate).toHaveBeenCalledWith(['/x', 'EST-1']);
  });

  it('keeps a card with a secondary input pending until both values are set', () => {
    const section: (typeof CONFIG.sections)[number] = {
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
    component.config = { ...CONFIG, sections: [section] };
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
    expect(component.selectorPlaceholderKey(CONFIG.sections[0])).toBe('LANDING.KIND.ESTIMATE.PLACEHOLDER');
    expect(component.selectorMode(CONFIG.sections[0])).toBe('search');
  });
});

/**
 * #236: a landing card is an offer to open a page, so it has to answer to the
 * same gate as the route behind it. Otherwise gating the route only moves the
 * dead end from a 403 page to a /forbidden redirect.
 */
describe('LandingPageComponent access filtering', () => {
  const GATED_CONFIG: LandingPageConfig = {
    eyebrowKey: 'EYEBROW',
    titleKey: 'TITLE',
    descriptionKey: 'DESC',
    primaryCta: { labelKey: 'CTA.PRIMARY', route: '/open', permissions: ['a:read'] },
    secondaryCta: { labelKey: 'CTA.SECONDARY', route: '/write', permissions: ['a:write'] },
    sections: [
      {
        titleKey: 'SEC.OPEN',
        descriptionKey: 'D',
        cards: [
          { kind: 'direct', icon: 'list_alt', titleKey: 'C.OPEN', descriptionKey: 'D', ctaKey: 'CTA', route: '/open' },
          {
            kind: 'direct',
            icon: 'lock',
            titleKey: 'C.READ',
            descriptionKey: 'D',
            ctaKey: 'CTA',
            route: '/read',
            permissions: ['a:read'],
          },
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
          {
            kind: 'direct',
            icon: 'bolt',
            titleKey: 'C.BOTH',
            descriptionKey: 'D',
            ctaKey: 'CTA',
            route: '/both',
            allPermissions: ['a:read', 'a:write'],
          },
        ],
      },
    ],
  };

  async function renderWith(held: string[] | null): Promise<LandingPageComponent> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [LandingPageComponent, TranslateModule.forRoot()],
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

    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.componentInstance.config = GATED_CONFIG;
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const titles = (component: LandingPageComponent): string[] =>
    component.visibleSections().flatMap(section => section.cards.map(card => card.titleKey));

  it('keeps only ungated cards for a session holding nothing', async () => {
    const component = await renderWith([]);

    expect(titles(component)).toEqual(['C.OPEN']);
    // The whole write section went with its cards.
    expect(component.visibleSections().map(s => s.titleKey)).toEqual(['SEC.OPEN']);
  });

  it('counts only the cards the session can open', async () => {
    const component = await renderWith(['a:read']);

    expect(titles(component)).toEqual(['C.OPEN', 'C.READ']);
    expect(component.totalCount()).toBe(2);
    expect(component.guidedCount()).toBe(0);
    expect(component.hasGuided()).toBe(false);
  });

  it('requires every code of an allPermissions card', async () => {
    expect(titles(await renderWith(['a:write']))).toEqual(['C.OPEN', 'C.WRITE']);
    expect(titles(await renderWith(['a:read', 'a:write']))).toEqual([
      'C.OPEN',
      'C.READ',
      'C.WRITE',
      'C.BOTH',
    ]);
  });

  it('hides a hero CTA the session cannot open', async () => {
    const readOnly = await renderWith(['a:read']);
    expect(readOnly.visiblePrimaryCta()?.labelKey).toBe('CTA.PRIMARY');
    expect(readOnly.visibleSecondaryCta()).toBeUndefined();
    expect(readOnly.hasHeroActions()).toBe(true);

    const nothing = await renderWith([]);
    expect(nothing.hasHeroActions()).toBe(false);
  });

  it('keys entered state to the card, not to its position in the filtered list', async () => {
    // Filtering shifts rendered positions: with 'a:read' withheld, SEC.WRITE
    // renders first. Index-keyed state would file its record under the slot
    // SEC.OPEN occupies in the config and hand it to the wrong section once
    // visibility changed (a token refresh is enough).
    const component = await renderWith(['a:write']);
    const [open, write] = GATED_CONFIG.sections;

    expect(component.visibleSections()[0].titleKey).toBe('SEC.OPEN');
    component.onRecordSelected(write, 'WO-1');

    expect(component.selectedId(write)).toBe('WO-1');
    expect(component.selectedId(open)).toBe('');

    // Secondary values are keyed the same way, so two cards sharing a position
    // across sections cannot collide.
    expect(component.cardKey(write, write.cards[0])).not.toBe(
      component.cardKey(open, open.cards[0]),
    );
  });

  it('falls back to showing everything for a token without a perm_bits claim', async () => {
    const component = await renderWith(null);

    expect(titles(component)).toEqual(['C.OPEN', 'C.READ', 'C.WRITE', 'C.BOTH']);
  });
});
