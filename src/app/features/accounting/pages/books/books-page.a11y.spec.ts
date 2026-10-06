import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService, TranslationObject } from '@ngx-translate/core';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { JournalEntryDetailPageComponent } from '../journal-entry-detail/journal-entry-detail-page.component';
import { BooksPageComponent } from './books-page.component';
import { BooksMocks, configureBooks, createBooksMocks } from './books-page.spec-helper';

/**
 * Genuine axe coverage of the RENDERED Your books and journal-entry pages
 * (§9.6, AC 13). `scripts/a11y/smoke-routes.mjs` scans both routes too, but
 * only sees the un-hydrated shell; this renders the real DOM through TestBed
 * with the real en-US copy: every tab, the drill-down, the export dialog and
 * the reverse dialog.
 */
async function seriousViolations(root: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical');
}

describe('Your books a11y (rendered DOM)', () => {
  let host: HTMLElement | null = null;
  let mocks: BooksMocks;

  beforeEach(() => {
    localStorage.clear();
    mocks = createBooksMocks();
  });
  afterEach(() => {
    host?.remove();
    localStorage.clear();
  });

  function render<T>(component: Type<T>): ComponentFixture<T> {
    configureBooks(mocks, { tenantId: signal<string | null>(null) });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
    const fixture = TestBed.createComponent(component);
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    return fixture;
  }

  const settle = async (fixture: ComponentFixture<unknown>): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  it('reports no serious violation on the Summary with a line drilled into an account', async () => {
    const fixture = render(BooksPageComponent);
    (host!.querySelector('[data-code="BS_BILLS_FROM_VENDORS"]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(host!.querySelector('[data-testid="ledger-table"] caption')).not.toBeNull();
    expect(await seriousViolations(host!)).toEqual([]);
  });

  it('reports no serious violation on Who owes what, with captions and column headers', async () => {
    mocks.queryParams.next({ tab: 'owed' });
    const fixture = render(BooksPageComponent);
    await settle(fixture);

    for (const table of Array.from(host!.querySelectorAll('table'))) {
      expect(table.querySelector('caption')?.textContent?.trim()).toBeTruthy();
      expect(Array.from(table.querySelectorAll('thead th')).every(th => th.getAttribute('scope') === 'col')).toBe(true);
    }
    expect(await seriousViolations(host!)).toEqual([]);
  });

  it('reports no serious violation on All entries and in the export dialog', async () => {
    mocks.queryParams.next({ tab: 'entries' });
    const fixture = render(BooksPageComponent);
    await settle(fixture);
    expect(await seriousViolations(host!)).toEqual([]);

    (host!.querySelector('[data-testid="export-open"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(host!.querySelector('dialog')?.matches(':modal')).toBe(true);
    expect(await seriousViolations(host!)).toEqual([]);
  });

  it('keeps one h1 and gives the tabs aria-pressed buttons', async () => {
    const fixture = render(BooksPageComponent);
    await settle(fixture);
    expect(host!.querySelectorAll('h1').length).toBe(1);
    const tabs = Array.from(host!.querySelectorAll('.books__tab'));
    expect(tabs.length).toBe(3);
    expect(tabs.every(tab => tab.tagName === 'BUTTON' && tab.hasAttribute('aria-pressed'))).toBe(true);
  });

  it('reports no serious violation on the journal-entry page with the reverse dialog open', async () => {
    const fixture = render(JournalEntryDetailPageComponent);
    await settle(fixture);
    expect(await seriousViolations(host!)).toEqual([]);

    (host!.querySelector('[data-testid="reverse-open"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(host!.querySelector('dialog')?.matches(':modal')).toBe(true);
    expect(await seriousViolations(host!)).toEqual([]);
  });
});
