import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { vi, describe, beforeEach, it, expect } from 'vitest';

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
    expect(component.isPending(section, 0, 1, guided)).toBe(true);

    component.onRecordSelected(0, 'EST-1');
    expect(component.isPending(section, 0, 1, guided)).toBe(false);

    component.onRecordCleared(0);
    expect(component.isPending(section, 0, 1, guided)).toBe(true);
  });

  it('navigates a guided card using the selected record id', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const section = CONFIG.sections[0];
    const guided = section.cards[1];

    // No-op while pending.
    component.launchGuided(section, 0, 1, guided as never);
    expect(navigate).not.toHaveBeenCalled();

    component.onRecordSelected(0, 'EST-1');
    component.launchGuided(section, 0, 1, guided as never);
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

    component.onRecordSelected(0, 'INV-1');
    expect(component.isPending(section, 0, 0, card)).toBe(true);

    component.onSecondaryInput(component.cardKey(0, 0), 'PAY-9');
    expect(component.isPending(section, 0, 0, card)).toBe(false);

    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.launchGuided(section, 0, 0, card as never);
    expect(navigate).toHaveBeenCalledWith(['/inv', 'INV-1', 'payments', 'PAY-9', 'void']);
  });

  it('resolves selector placeholder from the record kind by default', () => {
    expect(component.selectorPlaceholderKey(CONFIG.sections[0])).toBe('LANDING.KIND.ESTIMATE.PLACEHOLDER');
    expect(component.selectorMode(CONFIG.sections[0])).toBe('search');
  });
});
