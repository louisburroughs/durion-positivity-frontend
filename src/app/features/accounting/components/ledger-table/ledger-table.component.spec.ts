import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { LedgerLine, LedgerSection } from '../../models/books.models';
import { LedgerTableComponent } from './ledger-table.component';

const line = (overrides: Partial<LedgerLine> = {}): LedgerLine => ({
  journalEntryId: 'je-7',
  entryNumber: 'JE-202610-7',
  transactionDate: '2026-10-03',
  description: 'Bill from Tire Wholesale',
  debitAmount: null,
  creditAmount: 500,
  direction: 'INCREASE',
  normalRunningBalance: 9300,
  runningBalance: -9300,
  ...overrides,
});

const section = (overrides: Partial<LedgerSection> = {}): LedgerSection => ({
  accountId: 'acc-2000',
  accountNumber: '2000',
  accountName: 'Accounts payable',
  accountType: 'LIABILITY',
  normalSide: 'CREDIT',
  openingBalance: -8800,
  closingBalance: -9300,
  normalOpeningBalance: 8800,
  normalClosingBalance: 9300,
  lines: [line()],
  ...overrides,
});

describe('LedgerTableComponent', () => {
  let fixture: ComponentFixture<LedgerTableComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LedgerTableComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    });
  });

  function render(value: LedgerSection, inputs: { showTerms?: boolean; canOpenEntry?: boolean } = {}): void {
    fixture = TestBed.createComponent(LedgerTableComponent);
    fixture.componentRef.setInput('section', value);
    fixture.componentRef.setInput('showTerms', inputs.showTerms ?? false);
    fixture.componentRef.setInput('canOpenEntry', inputs.canOpenEntry ?? true);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  const text = (selector: string): string =>
    host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const all = (selector: string): string[] =>
    Array.from(host.querySelectorAll(selector)).map(el => el.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  it('lists lines newest first with the served normal-side opening, closing and Balance after', () => {
    render(
      section({
        lines: [
          line({ journalEntryId: 'je-1', entryNumber: 'JE-202610-1', normalRunningBalance: 9000 }),
          line({ journalEntryId: 'je-2', entryNumber: 'JE-202610-2', normalRunningBalance: 9300 }),
        ],
      }),
    );

    expect(all('[data-testid="entry-link"]')).toEqual(['JE-202610-2', 'JE-202610-1']);
    expect(all('[data-testid="cell-balance"]')).toEqual(['$9,300.00', '$9,000.00']);
    expect(text('[data-testid="ledger-opening"]')).toBe('$8,800.00');
    expect(text('[data-testid="ledger-closing"]')).toBe('$9,300.00');
  });

  it('puts a DECREASE under Went down and, with terms on, names a DEBIT-normal account’s sides', () => {
    render(section({ normalSide: 'DEBIT', lines: [line({ direction: 'DECREASE', creditAmount: 75 })] }), { showTerms: true });

    expect(text('[data-testid="cell-up"]')).toBe('');
    expect(text('[data-testid="cell-down"]')).toBe('$75.00');
    expect(text('[data-testid="heading-up"]')).toBe('ACCOUNTING.BOOKS.LEDGER.WENT_UP (ACCOUNTING.BOOKS.LEDGER.TERM_DEBIT)');
    expect(text('[data-testid="heading-down"]')).toBe(
      'ACCOUNTING.BOOKS.LEDGER.WENT_DOWN (ACCOUNTING.BOOKS.LEDGER.TERM_CREDIT)',
    );
  });

  it('falls back to Debit and Credit when any line lacks a served direction', () => {
    render(section({ lines: [line(), line({ journalEntryId: 'je-8', direction: null })] }));

    expect(text('[data-testid="heading-up"]')).toBe('ACCOUNTING.BOOKS.LEDGER.DEBIT');
    expect(text('[data-testid="ledger-opening"]')).toBe('-$8,800.00');
  });

  it('shows entry numbers as text, not links, without accounting:je:view, and never an id', () => {
    render(section({ lines: [line({ entryNumber: null })] }), { canOpenEntry: false });

    expect(host.querySelector('[data-testid="entry-link"]')).toBeNull();
    expect(text('[data-testid="ledger-row"] th')).toBe('ACCOUNTING.BOOKS.NO_NUMBER');
    expect(host.textContent).not.toContain('je-7');
  });

  it('says the account had no entries instead of an empty table', () => {
    render(section({ lines: [] }));
    expect(host.querySelector('[data-testid="ledger-table"]')).toBeNull();
    expect(text('[data-testid="ledger-empty"]')).toBe('ACCOUNTING.BOOKS.LEDGER.EMPTY');
  });
});
