import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankStatement } from '../../models/bank-reconciliation.models';
import { BankReconciliationService } from '../../services/bank-reconciliation.service';
import { StatementSupersedeComponent, SupersedeChoice } from './statement-supersede.component';

const statement = (overrides: Partial<BankStatement> = {}): BankStatement => ({
  statementId: 'st-8',
  glAccountId: 'gl-1010',
  statementRef: 'AUG',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  openingBalance: 900,
  closingBalance: 1000,
  currency: 'USD',
  status: 'COMMITTED',
  sourceKind: 'FILE_IMPORT',
  gapAcknowledgement: null,
  reconciliations: [],
  ...overrides,
});

@Component({
  imports: [StatementSupersedeComponent],
  template: `<app-statement-supersede [glAccountId]="account()" (choice)="choices.push($event)" />`,
})
class HostComponent {
  readonly account = signal('gl-1010');
  readonly choices: SupersedeChoice[] = [];
}

const serviceStub = { listStatements: vi.fn(), getStatement: vi.fn() };

describe('StatementSupersedeComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;

  const setup = (): void => {
    TestBed.configureTestingModule({
      imports: [HostComponent, TranslateModule.forRoot()],
      providers: [{ provide: BankReconciliationService, useValue: serviceStub }],
    });
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };
  const query = (testId: string): HTMLElement | null => el.querySelector(`[data-testid="${testId}"]`);
  const choose = (value: string): void => {
    const select = query('supersede-statement') as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const type = (value: string): void => {
    const area = query('supersede-justification') as HTMLTextAreaElement;
    area.value = value;
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const last = (): SupersedeChoice | undefined => fixture.componentInstance.choices.at(-1);

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('reads nothing until switched on, then lists only COMMITTED statements', () => {
    serviceStub.listStatements.mockReturnValue(of([statement(), statement({ statementId: 'st-7', status: 'SUPERSEDED' })]));
    setup();
    expect(serviceStub.listStatements).not.toHaveBeenCalled();

    (query('supersede-toggle') as HTMLInputElement).click();
    fixture.detectChanges();

    expect(serviceStub.listStatements).toHaveBeenCalledWith('gl-1010');
    expect(Array.from((query('supersede-statement') as HTMLSelectElement).options).map(o => o.value)).toEqual(['', 'st-8']);
    expect(last()).toEqual({ state: 'incomplete' });
  });

  it('is complete only with a statement and a justification of at least 10 characters', () => {
    serviceStub.listStatements.mockReturnValue(of([statement()]));
    serviceStub.getStatement.mockReturnValue(of(statement()));
    setup();
    (query('supersede-toggle') as HTMLInputElement).click();
    fixture.detectChanges();

    choose('st-8');
    type('123456789');
    expect(last()).toEqual({ state: 'incomplete' });

    type('  Bank reissued it  ');
    expect(last()).toEqual({
      state: 'ready',
      supersession: { supersedesStatementId: 'st-8', supersessionJustification: 'Bank reissued it' },
    });

    (query('supersede-toggle') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(last()).toEqual({ state: 'off' });
  });

  it('warns only when a FINALIZED reconciliation covers the chosen statement', () => {
    serviceStub.listStatements.mockReturnValue(of([statement(), statement({ statementId: 'st-7' })]));
    serviceStub.getStatement.mockImplementation((id: string) =>
      of(
        statement({
          statementId: id,
          reconciliations: id === 'st-8' ? [{ reconciliationId: 'rec-8', status: 'FINALIZED' }] : [{ reconciliationId: 'rec-7', status: 'CANCELLED' }],
        }),
      ),
    );
    setup();
    (query('supersede-toggle') as HTMLInputElement).click();
    fixture.detectChanges();

    choose('st-7');
    expect(query('supersede-invalidates')).toBeNull();
    choose('st-8');
    expect(query('supersede-invalidates')).not.toBeNull();
  });

  it('drops the chosen statement read when the list is reloaded', () => {
    serviceStub.listStatements.mockReturnValue(of([statement()]));
    const chosen = new Subject<BankStatement>();
    serviceStub.getStatement.mockReturnValue(chosen);
    setup();
    (query('supersede-toggle') as HTMLInputElement).click();
    fixture.detectChanges();
    choose('st-8');

    (fixture.debugElement.children[0].componentInstance as StatementSupersedeComponent).reload();
    chosen.next(statement({ reconciliations: [{ reconciliationId: 'rec-8', status: 'FINALIZED' }] }));
    fixture.detectChanges();

    expect(query('supersede-invalidates')).toBeNull();
  });

  it('offers a retry when the statements cannot be read', () => {
    serviceStub.listStatements.mockReturnValueOnce(throwError(() => new Error('down'))).mockReturnValueOnce(of([statement()]));
    setup();
    (query('supersede-toggle') as HTMLInputElement).click();
    fixture.detectChanges();

    (el.querySelector('.link-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(serviceStub.listStatements).toHaveBeenCalledTimes(2);
    expect(query('supersede-statement')).not.toBeNull();
  });
});
