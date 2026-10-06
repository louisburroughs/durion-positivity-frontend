import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, beforeEach, it, expect } from 'vitest';

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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

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

  it('renders the extracted sections block with the config sections', () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('app-landing-sections .landing-section').length).toBe(2);
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

  it('falls back to showing everything for a token without a perm_bits claim', async () => {
    const component = await renderWith(null);

    expect(titles(component)).toEqual(['C.OPEN', 'C.READ', 'C.WRITE', 'C.BOTH']);
  });
});
