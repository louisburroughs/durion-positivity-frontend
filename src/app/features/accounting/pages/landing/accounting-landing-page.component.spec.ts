import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountingLandingPageComponent } from './accounting-landing-page.component';

describe('AccountingLandingPageComponent', () => {
  let component: AccountingLandingPageComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountingLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    });
    component = TestBed.createComponent(AccountingLandingPageComponent).componentInstance;
  });

  it('is created', () => {
    expect(component).toBeTruthy();
  });

  it('supplies the accounting landing config', () => {
    expect(component.config.titleKey).toBe('ACCOUNTING.LANDING.TITLE');
  });

  it('offers the period-close page from a direct card gated like its route', () => {
    const card = component.config.sections
      .flatMap(section => section.cards)
      .find(candidate => candidate.kind === 'direct' && candidate.route === '/app/accounting/periods');

    expect(card?.titleKey).toBe('ACCOUNTING.LANDING.CARD.PERIOD_CLOSE.TITLE');
    expect(card?.permissions).toEqual(['accounting:period:view']);
  });

  it('gives every section a single record kind or none', () => {
    for (const section of component.config.sections) {
      // recordKind is a single scalar value or undefined — never a multi-kind concept.
      expect(['string', 'undefined']).toContain(typeof section.recordKind);
    }
  });
});
