import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkorderInvoiceView } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { InvoiceFinalizationPageComponent } from './invoice-finalization-page.component';

const invoiceFixture: WorkorderInvoiceView = {
  workorderId: '0190b3a4-0000-7000-8000-00000000wo01',
  workorderNumber: 'WO-1042',
  invoiceId: 'inv-1',
  invoiceNumber: 'INV-2026-0042',
  lineItems: [
    { lineItemId: 'line-1', description: 'Brake pads', quantity: 2, unitPrice: 40, lineTotal: 80, itemType: 'PART' },
    { lineItemId: 'line-2', description: 'Shop supplies', quantity: 1, unitPrice: 5, lineTotal: 5, itemType: 'SUPPLIES' },
  ],
  subtotal: 85,
  taxAmount: 6.8,
  total: 91.8,
  currency: null,
  invoiceStatus: 'DRAFT',
};

const FINALIZE = 'invoice:finalize';

const authStub = {
  known: true,
  granted: ['invoice:invoice:view', FINALIZE] as readonly string[],
  permissionsKnown(): boolean {
    return this.known;
  },
  hasAnyPermission(required: readonly string[]): boolean {
    return required.some(code => this.granted.includes(code));
  },
};

const httpError = (status: number, body: unknown = null): HttpErrorResponse => new HttpErrorResponse({ status, error: body });

describe('InvoiceFinalizationPageComponent', () => {
  let fixture: ComponentFixture<InvoiceFinalizationPageComponent>;
  let component: InvoiceFinalizationPageComponent;
  let router: Router;
  let el: HTMLElement;

  const serviceMock = {
    getWorkorderInvoiceView: vi.fn(),
    finalizeInvoice: vi.fn(),
  };

  const setup = async (params: Record<string, string> = { workorderId: 'wo-1' }): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [InvoiceFinalizationPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: WorkexecService, useValue: serviceMock },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap(params)).asObservable() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceFinalizationPageComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  const query = (testId: string): HTMLElement | null => el.querySelector(`[data-testid="${testId}"]`);

  beforeEach(() => {
    serviceMock.getWorkorderInvoiceView.mockReset();
    serviceMock.finalizeInvoice.mockReset();
    serviceMock.getWorkorderInvoiceView.mockReturnValue(of(invoiceFixture));
  });

  afterEach(() => {
    authStub.known = true;
    authStub.granted = ['invoice:invoice:view', FINALIZE];
    TestBed.resetTestingModule();
  });

  it("reads the workorder's invoice and renders its line items", async () => {
    await setup();

    expect(serviceMock.getWorkorderInvoiceView).toHaveBeenCalledWith('wo-1');
    expect(component.state()).toBe('ready');
    expect(el.querySelectorAll('[data-testid="invoice-line-item"]')).toHaveLength(2);
  });

  it('names the workorder by its number, never its id (ADR-0064)', async () => {
    await setup();

    expect(query('invoice-workorder-number')?.textContent?.trim()).toBe('WO-1042');
    expect(el.textContent).not.toContain(invoiceFixture.workorderId);
    expect(query('invoice-number')?.textContent?.trim()).toBe('INV-2026-0042');
  });

  it('renders a served item type it has no copy for under the generic label', async () => {
    await setup();

    const types = Array.from(el.querySelectorAll('[data-testid="invoice-line-item"] td:last-child')).map(cell =>
      cell.textContent?.trim(),
    );
    expect(types).toEqual(['WORKEXEC.ITEM_TYPE.PART', 'WORKEXEC.ITEM_TYPE.OTHER']);
  });

  it.each([
    [404, 'WORKEXEC.INVOICE_FINALIZATION.ERROR.NO_INVOICE'],
    [403, 'WORKEXEC.INVOICE_FINALIZATION.ERROR.FORBIDDEN'],
    [500, 'WORKEXEC.INVOICE_FINALIZATION.ERROR.LOAD'],
  ])('classifies a %s on load, state before key', async (status, key) => {
    serviceMock.getWorkorderInvoiceView.mockReturnValue(throwError(() => httpError(status)));
    await setup();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe(key);
  });

  it('finalizes the invoice by its id with the reason, then returns to the workorder', async () => {
    await setup();
    serviceMock.finalizeInvoice.mockReturnValue(of({ ...invoiceFixture, invoiceStatus: 'FINALIZED' }));
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.requestFinalization('Approved by manager');

    expect(serviceMock.finalizeInvoice).toHaveBeenCalledWith('inv-1', { reason: 'Approved by manager' });
    expect(navigateSpy).toHaveBeenCalledWith(['/app/workexec/workorders', 'wo-1']);
    expect(component.isSubmitting()).toBe(false);
  });

  it.each([
    [403, { code: 'MANAGER_APPROVAL_REQUIRED' }, 'WORKEXEC.INVOICE_FINALIZATION.ERROR.MANAGER_APPROVAL'],
    [403, null, 'WORKEXEC.INVOICE_FINALIZATION.ERROR.FORBIDDEN_FINALIZE'],
    [409, null, 'WORKEXEC.INVOICE_FINALIZATION.ERROR.NOT_FINALIZABLE'],
    [500, null, 'WORKEXEC.INVOICE_FINALIZATION.ERROR.SUBMIT'],
  ])('classifies a %s finalize refusal', async (status, body, key) => {
    await setup();
    serviceMock.finalizeInvoice.mockReturnValue(throwError(() => httpError(status, body)));

    component.requestFinalization();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe(key);
    expect(component.isSubmitting()).toBe(false);
  });

  it('disables finalizing without invoice:finalize, in the control and the handler (ADR-0040 §6a)', async () => {
    authStub.granted = ['invoice:invoice:view'];
    await setup();

    expect((query('invoice-finalize-submit') as HTMLButtonElement).disabled).toBe(true);
    component.requestFinalization();
    expect(serviceMock.finalizeInvoice).not.toHaveBeenCalled();
  });

  it('follows the canAccess() fallback when the token carries no permissions', async () => {
    authStub.known = false;
    authStub.granted = [];
    await setup();

    expect((query('invoice-finalize-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('sets the empty state and reads nothing when the workorderId is absent', async () => {
    await setup({});

    expect(component.state()).toBe('empty');
    expect(serviceMock.getWorkorderInvoiceView).not.toHaveBeenCalled();
  });
});
