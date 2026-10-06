import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService, TranslationObject } from '@ngx-translate/core';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AccountingHomePageComponent } from './accounting-home-page.component';
import { configureHome, createHomeMocks } from './accounting-home-page.spec-helper';

/**
 * Genuine axe coverage of the RENDERED accounting home (§9.6, AC 16).
 * `scripts/a11y/smoke-routes.mjs` scans `/app/accounting` too, but it only
 * sees the un-hydrated index shell; this renders the real DOM through TestBed
 * with the real en-US copy: lanes, the to-do list with a selected approval,
 * the open Help guide and the More accounting tools disclosure.
 */
async function seriousViolations(root: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical');
}

describe('Accounting home a11y (rendered DOM)', () => {
  let host: HTMLElement | null = null;
  let settle: () => void = () => undefined;

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    host?.remove();
    localStorage.clear();
  });

  function render(): HTMLElement {
    configureHome(createHomeMocks(), { tenantId: signal<string | null>(null) });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
    const fixture = TestBed.createComponent(AccountingHomePageComponent);
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    settle = () => fixture.detectChanges();
    return host;
  }

  it('reports no serious violation with every region, the guide open and an approval selected', async () => {
    const root = render();
    (root.querySelector('[data-testid="help-toggle"]') as HTMLButtonElement).click();
    (root.querySelector('.todo-item[data-kind="APPROVAL"]') as HTMLButtonElement).click();
    (root.querySelector('[data-testid="more-tools"]') as HTMLDetailsElement).open = true;
    settle();
    await new Promise(resolve => setTimeout(resolve));

    expect(await seriousViolations(root)).toEqual([]);
  });

  it('reports no serious violation with a payment selected', async () => {
    const root = render();
    (root.querySelector('.todo-item[data-kind="PAYMENT"]') as HTMLButtonElement).click();
    settle();
    await new Promise(resolve => setTimeout(resolve));

    expect(await seriousViolations(root)).toEqual([]);
  });

  it('keeps one h1 and gives the to-do selection list aria-pressed buttons, not links', () => {
    const root = render();
    expect(root.querySelectorAll('h1').length).toBe(1);
    const items = Array.from(root.querySelectorAll('.todo-item'));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(item => item.tagName === 'BUTTON' && item.hasAttribute('aria-pressed'))).toBe(true);
  });
});
