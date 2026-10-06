import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JwtClaims } from '../../../../core/models/auth.models';
import { JournalEntry } from '../../models/books.models';
import { AccountingPreferencesService } from '../../services/accounting-preferences.service';
import {
  ALL_BOOKS_PERMISSIONS,
  BooksMocks,
  configureBooks,
  createBooksMocks,
  journalEntry,
  pending,
  traceability,
} from '../books/books-page.spec-helper';
import { JournalEntryDetailPageComponent } from './journal-entry-detail-page.component';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const OVERRIDE = 'accounting:period:override';

describe('JournalEntryDetailPageComponent', () => {
  let mocks: BooksMocks;
  let fixture: ComponentFixture<JournalEntryDetailPageComponent>;
  let component: JournalEntryDetailPageComponent;
  let host: HTMLElement;

  const CLAIMS: JwtClaims = { sub: 'controller.lee', tid: 'tenant-a', exp: 4102444800 };
  const tenant = signal<string | null>('tenant-a');

  function render(): void {
    configureBooks(mocks, { tenantId: tenant });
    fixture = TestBed.createComponent(JournalEntryDetailPageComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    fixture.detectChanges();
  }

  const q = (selector: string): HTMLElement | null => host.querySelector<HTMLElement>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => q(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const click = (selector: string): void => {
    q(selector)!.click();
    fixture.detectChanges();
  };
  /** Template-driven fields register their control in a microtask inside a form: settle first. */
  const type = async (selector: string, value: string): Promise<void> => {
    await fixture.whenStable();
    const field = q(selector) as HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const http = (status: number, code?: string): HttpErrorResponse =>
    new HttpErrorResponse({ status, error: code ? { code, message: 'server text for tenant t-1' } : null });

  beforeEach(() => {
    localStorage.clear();
    mocks = createBooksMocks();
    mocks.claims.set(CLAIMS);
    tenant.set('tenant-a');
  });

  afterEach(() => {
    host?.remove();
    localStorage.clear();
  });

  describe('entry, lines and traceability', () => {
    it('shows the entry number, never its id, and the lines with Debit and Credit (no direction served)', () => {
      render();

      expect(mocks.books.getJournalEntry).toHaveBeenCalledWith('je-131');
      expect(mocks.books.getTraceability).toHaveBeenCalledWith('je-131');
      expect(text('[data-testid="entry-number"]')).toBe('JE-202610-131');
      expect(qa('[data-testid="entry-line"]')).toHaveLength(2);
      expect(text('[data-testid="entry-lines"] thead')).toContain('ACCOUNTING.BOOKS.LEDGER.DEBIT');
      expect(text('[data-testid="entry-source"]')).toBe('ACCOUNTING.BOOKS.ENTRY.SOURCE.INVOICE_REVENUE');
      expect(host.textContent).not.toContain('je-131');
    });

    it('shows account codes and the raw source type only with Show accounting terms on', () => {
      mocks.books.getJournalEntry.mockReturnValue(of(journalEntry({ sourceEventType: 'SOMETHING_NEW' })));
      render();
      expect(text('[data-testid="entry-source"]')).toBe('ACCOUNTING.BOOKS.ENTRY.SOURCE.UNKNOWN');
      expect(text('[data-testid="entry-line"]')).not.toContain('1200');

      TestBed.inject(AccountingPreferencesService).setShowTerms(true);
      fixture.detectChanges();
      expect(text('[data-testid="entry-source"]')).toContain('SOMETHING_NEW');
      expect(text('[data-testid="entry-line"]')).toContain('1200');
    });

    it('links the original and the correction by entry number ("Reverses", "Reversed by")', () => {
      mocks.books.getTraceability.mockReturnValue(
        of(
          traceability({
            original: journalEntry({ journalEntryId: 'je-100', entryNumber: 'JE-202610-100' }),
            reversal: journalEntry({ journalEntryId: 'je-140', entryNumber: 'JE-202610-140' }),
          }),
        ),
      );
      render();

      expect(text('[data-testid="trace-reverses"]')).toContain('ACCOUNTING.BOOKS.ENTRY.REVERSES');
      expect(q('[data-testid="trace-reverses"] a')?.getAttribute('href')).toBe('/app/accounting/books/entries/je-100');
      expect(q('[data-testid="trace-reversed-by"] a')?.getAttribute('href')).toBe('/app/accounting/books/entries/je-140');
    });

    it('reads a correcting entry as "Correction of an earlier entry", never its stored description with a UUID', () => {
      mocks.books.getJournalEntry.mockReturnValue(
        of(
          journalEntry({
            reversalJournalEntryId: 'je-100',
            description: 'REVERSAL of 0f8fad5b-d9cb-469f-a165-70867728950e - Reason: recorded twice',
            lines: [
              {
                lineNumber: 1,
                accountCode: '4000',
                accountName: 'Sales',
                description: 'REVERSAL of 0f8fad5b-d9cb-469f-a165-70867728950e',
                debitAmount: 10,
                creditAmount: null,
              },
            ],
          }),
        ),
      );
      render();

      expect(text('[data-testid="entry-what-happened"]')).toBe('ACCOUNTING.BOOKS.CORRECTION_DESCRIPTION');
      expect(text('[data-testid="entry-status"]')).toBe('ACCOUNTING.BOOKS.STATUS.CORRECTION');
      expect(host.textContent).not.toMatch(UUID);
    });

    it('says "We couldn\'t find this entry" with a link back to All entries on a 404', () => {
      mocks.books.getJournalEntry.mockReturnValue(throwError(() => http(404, 'JOURNAL_ENTRY_NOT_FOUND')));
      render();

      expect(text('[data-testid="entry-not-found"]')).toContain('ACCOUNTING.BOOKS.ENTRY.NOT_FOUND');
      expect(q('[data-testid="entry-not-found"] a')?.getAttribute('href')).toBe('/app/accounting/books?tab=entries');
      expect(q('[data-testid="entry-error"]')).toBeNull();
    });

    it('never shows the previous entry while a new route id is loading (ADR-0063 §1)', () => {
      const next = pending<JournalEntry>();
      render();
      mocks.books.getJournalEntry.mockReturnValue(next);
      mocks.params.next({ journalEntryId: 'je-200' });
      fixture.detectChanges();

      expect(text('[data-testid="entry-number"]')).toBe('ACCOUNTING.BOOKS.ENTRY.TITLE');
      next.next(journalEntry({ journalEntryId: 'je-200', entryNumber: 'JE-202610-200' }));
      fixture.detectChanges();
      expect(text('[data-testid="entry-number"]')).toBe('JE-202610-200');
    });
  });

  describe('Reverse (AC 8)', () => {
    it('reverses a POSTED entry with one call, shows Reversed and links to the new entry', async () => {
      render();
      click('[data-testid="reverse-open"]');
      expect(q('dialog[data-testid="reverse-dialog"]')?.matches(':modal')).toBe(true);
      expect(text('[data-testid="reverse-consequence"]')).toContain('ACCOUNTING.BOOKS.ENTRY.REVERSE.CONSEQUENCE');

      mocks.books.getJournalEntry.mockReturnValue(of(journalEntry({ status: 'REVERSED', reversedByJournalEntryId: 'je-140' })));
      await type('[data-testid="reverse-reason"]', 'Recorded twice');
      click('[data-testid="reverse-submit"]');
      await fixture.whenStable();

      expect(mocks.books.reverseJournalEntry).toHaveBeenCalledTimes(1);
      expect(mocks.books.reverseJournalEntry).toHaveBeenCalledWith('je-131', 'Recorded twice', undefined);
      expect(q('[data-testid="reverse-dialog"]')).toBeNull();
      expect(text('[data-testid="entry-status"]')).toBe('ACCOUNTING.BOOKS.STATUS.REVERSED');
      expect(q('[data-testid="correction-link"]')?.getAttribute('href')).toBe('/app/accounting/books/entries/je-140');
      expect(q('[data-testid="outcome"]')?.getAttribute('role')).toBe('status');
      expect(document.activeElement?.id).toBe('entry-title');
    });

    it('says the entry could not be refreshed, not "loading", after a failed re-read that kept it on screen', () => {
      render();
      mocks.books.getJournalEntry.mockReturnValue(throwError(() => http(500)));
      component.reload();
      fixture.detectChanges();

      expect(text('[data-testid="entry-number"]')).toBe('JE-202610-131');
      expect(q('[data-testid="reverse-open"]')?.getAttribute('aria-disabled')).toBe('true');
      expect(text('[data-testid="reverse-blocked"]')).toBe('ACCOUNTING.BOOKS.ENTRY.REVERSE.BLOCKED.REFRESH_FAILED');
    });

    it('refuses an empty reason without calling the server', () => {
      render();
      click('[data-testid="reverse-open"]');
      click('[data-testid="reverse-submit"]');

      expect(mocks.books.reverseJournalEntry).not.toHaveBeenCalled();
      expect(text('[data-testid="reverse-error"]')).toBe('ACCOUNTING.BOOKS.ENTRY.REVERSE.REASON_REQUIRED');
    });

    it('keeps Reverse visible but aria-disabled with the reason for a REVERSED entry, and the handler refuses', () => {
      mocks.books.getJournalEntry.mockReturnValue(of(journalEntry({ status: 'REVERSED' })));
      render();

      const button = q('[data-testid="reverse-open"]')!;
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.getAttribute('aria-describedby')).toBe('reverse-blocked');
      expect(text('[data-testid="reverse-blocked"]')).toBe('ACCOUNTING.BOOKS.ENTRY.REVERSE.BLOCKED.REVERSED');
      click('[data-testid="reverse-open"]');
      expect(q('[data-testid="reverse-dialog"]')).toBeNull();
    });

    it.each(['DRAFT', 'PENDING'] as const)('blocks a %s entry as not recorded yet', status => {
      mocks.books.getJournalEntry.mockReturnValue(of(journalEntry({ status, entryNumber: null })));
      render();

      expect(text('[data-testid="reverse-blocked"]')).toBe('ACCOUNTING.BOOKS.ENTRY.REVERSE.BLOCKED.NOT_RECORDED');
      expect(text('[data-testid="entry-number"]')).toBe('ACCOUNTING.BOOKS.STATUS.NOT_RECORDED');
    });

    it('hides Reverse without accounting:je:reverse, and the handler refuses', () => {
      mocks.held.set(ALL_BOOKS_PERMISSIONS.filter(code => code !== 'accounting:je:reverse'));
      render();

      expect(q('[data-testid="reverse-open"]')).toBeNull();
      component.openReverse();
      component.reason.set('Recorded twice');
      component.submitReverse();
      expect(component.dialogOpen()).toBe(false);
      expect(mocks.books.reverseJournalEntry).not.toHaveBeenCalled();
    });

    it('re-reads and closes the dialog on JE_ALREADY_REVERSED, saying someone else acted', async () => {
      mocks.books.reverseJournalEntry.mockReturnValue(throwError(() => http(409, 'JE_ALREADY_REVERSED')));
      render();
      click('[data-testid="reverse-open"]');
      await type('[data-testid="reverse-reason"]', 'Recorded twice');
      click('[data-testid="reverse-submit"]');

      expect(q('[data-testid="reverse-dialog"]')).toBeNull();
      expect(mocks.books.getJournalEntry).toHaveBeenCalledTimes(2);
      expect(text('[data-testid="outcome"]')).toBe('ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.ALREADY_REVERSED');
      expect(host.textContent).not.toContain('server text');
    });

    it('explains a hard-locked month and names the permission on a 403', async () => {
      mocks.books.reverseJournalEntry.mockReturnValueOnce(throwError(() => http(422, 'PERIOD_HARD_LOCKED')));
      render();
      click('[data-testid="reverse-open"]');
      await type('[data-testid="reverse-reason"]', 'Recorded twice');
      click('[data-testid="reverse-submit"]');
      expect(text('[data-testid="reverse-error"]')).toBe('ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.HARD_LOCKED');

      mocks.books.reverseJournalEntry.mockReturnValueOnce(throwError(() => http(403)));
      click('[data-testid="reverse-submit"]');
      expect(text('[data-testid="reverse-error"]')).toBe('ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.FORBIDDEN');
    });
  });

  describe('Closed month override (AC 9)', () => {
    it('offers the override to a holder of accounting:period:override and resubmits with overrideJustification', async () => {
      mocks.held.set([...ALL_BOOKS_PERMISSIONS, OVERRIDE]);
      mocks.books.reverseJournalEntry.mockReturnValueOnce(throwError(() => http(422, 'PERIOD_CLOSED')));
      render();
      click('[data-testid="reverse-open"]');
      await type('[data-testid="reverse-reason"]', 'Recorded twice');
      click('[data-testid="reverse-submit"]');

      expect(component.phase()).toBe('needs-override');
      expect(q('[data-testid="override-field"]')).not.toBeNull();
      await type('[data-testid="reverse-override"]', 'The sale was in September');
      click('[data-testid="reverse-submit"]');

      expect(mocks.books.reverseJournalEntry).toHaveBeenCalledTimes(2);
      expect(mocks.books.reverseJournalEntry).toHaveBeenLastCalledWith(
        'je-131',
        'Recorded twice',
        'The sale was in September',
      );
    });

    it('tells a non-holder that a person with the permission can do it, with no override field', async () => {
      mocks.books.reverseJournalEntry.mockReturnValueOnce(throwError(() => http(422, 'PERIOD_CLOSED')));
      render();
      click('[data-testid="reverse-open"]');
      await type('[data-testid="reverse-reason"]', 'Recorded twice');
      click('[data-testid="reverse-submit"]');

      expect(q('[data-testid="override-field"]')).toBeNull();
      expect(component.phase()).toBe('editing');
      expect(text('[data-testid="reverse-error"]')).toBe('ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.PERIOD_CLOSED');
      expect(mocks.books.reverseJournalEntry).toHaveBeenCalledTimes(1);
    });
  });
});
