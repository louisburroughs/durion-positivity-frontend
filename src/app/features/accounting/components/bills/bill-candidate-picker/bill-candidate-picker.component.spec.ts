import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { BillCandidate, BillDecisionRequest } from '../../../models/payables.models';
import { ALL_PERMISSIONS, NO_PERMISSIONS, action, exceptionBill } from '../../../pages/bills/bills-page.spec-helper';
import { BillCandidatePickerComponent } from './bill-candidate-picker.component';

const candidates: BillCandidate[] = [
  { candidateId: 'cand-uuid-1', billNumber: 'REC-1001', billTotal: 1200, currencyCode: 'USD', score: 74, points: { amount: 30, products: 30, date: 10, purchaseOrder: 4 } },
  { candidateId: 'cand-uuid-2', billNumber: 'REC-1002', billTotal: 1180, currencyCode: 'USD', score: 61, points: null },
];

describe('BillCandidatePickerComponent (§7.1, ADR-0064)', () => {
  let fixture: ComponentFixture<BillCandidatePickerComponent>;
  let emitted: BillDecisionRequest[];
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BillCandidatePickerComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(BillCandidatePickerComponent);
    emitted = [];
    fixture.componentInstance.decide.subscribe(request => emitted.push(request));
  });

  function render(permissions = ALL_PERMISSIONS, selectAllowed = true): void {
    fixture.componentRef.setInput(
      'bill',
      exceptionBill({ openCandidates: candidates, availableActions: [action('SELECT_CANDIDATE', { allowed: selectAllowed })] }),
    );
    fixture.componentRef.setInput('permissions', permissions);
    fixture.detectChanges();
  }

  it('compares candidates by bill number, total and score — never by id (AC 7)', () => {
    render();

    const rows = Array.from(host().querySelectorAll('[data-testid="candidate-row"]'));
    expect(rows.map(row => row.querySelector('th')?.textContent?.trim())).toEqual(['REC-1001', 'REC-1002']);
    expect(host().textContent).not.toContain('cand-uuid');
    expect(host().querySelectorAll('app-match-score').length).toBe(2);
    expect(host().querySelector('caption')).not.toBeNull();
    // The consequence note comes before every Pick button (review B2).
    const note = host().querySelector('[data-testid="candidate-note"]')!;
    expect(note.textContent).toContain('ACCOUNTING.BILLS.CANDIDATES.NOTE');
    expect(note.compareDocumentPosition(host().querySelector('table')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host().querySelector('[data-testid="candidate-pick"]')!.getAttribute('aria-describedby')).toBe(note.id);
  });

  it('picking emits the candidate id for the command, matching only', () => {
    render();
    (host().querySelector('[data-testid="candidate-pick"]') as HTMLButtonElement).click();

    expect(emitted).toEqual([{ kind: 'SELECT', candidateId: 'cand-uuid-1', billNumber: 'REC-1001' }]);
  });

  it('keeps the comparison readable but offers no pick without the approve codes; the handler refuses', () => {
    render(NO_PERMISSIONS);

    expect(host().querySelectorAll('[data-testid="candidate-row"]').length).toBe(2);
    expect(host().querySelector('[data-testid="candidate-pick"]')).toBeNull();
    fixture.componentInstance.pick(candidates[0]);
    expect(emitted).toEqual([]);
  });

  it('a served-but-blocked selection stays visible, aria-disabled, and does nothing', () => {
    render(ALL_PERMISSIONS, false);

    const pick = host().querySelector('[data-testid="candidate-pick"]') as HTMLButtonElement;
    expect(pick.getAttribute('aria-disabled')).toBe('true');
    expect(pick.disabled).toBe(false);
    // The translated reason is rendered and linked (review B1).
    const blocked = host().querySelector('[data-testid="candidate-blocked"]')!;
    expect(blocked.textContent).toContain('ACCOUNTING.BILLS.DECISION.BLOCKED.UNKNOWN');
    expect(pick.getAttribute('aria-describedby')).toContain(blocked.id);
    pick.click();
    expect(emitted).toEqual([]);
  });
});
