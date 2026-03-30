import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { WorkorderInvoiceView } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { InvoiceFinalizationPageComponent } from './invoice-finalization-page.component';

describe('InvoiceFinalizationPageComponent', () => {
  let fixture: ComponentFixture<InvoiceFinalizationPageComponent>;
  let component: InvoiceFinalizationPageComponent;
  let router: Router;

  const serviceMock = {
    getWorkorderInvoiceView: vi.fn(),
    requestInvoiceFinalization: vi.fn(),
  };

  beforeEach(async () => {
    const paramMap$ = new BehaviorSubject(convertToParamMap({ workorderId: 'wo-1' }));

    serviceMock.getWorkorderInvoiceView.mockReset();
    serviceMock.requestInvoiceFinalization.mockReset();

    await TestBed.configureTestingModule({
      imports: [InvoiceFinalizationPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: WorkexecService, useValue: serviceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceFinalizationPageComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
  });

  it('renders ready state with invoice line items', () => {
    const invoiceFixture: WorkorderInvoiceView = {
      workorderId: 'wo-1',
      invoiceId: 'inv-1',
      lineItems: [
        {
          lineItemId: 'line-1',
          description: 'Labor line',
          quantity: 1,
          unitPrice: 99,
          lineTotal: 99,
          itemType: 'LABOR',
        },
      ],
      subtotal: 99,
      taxAmount: 8,
      total: 107,
      currency: 'USD',
      invoiceStatus: 'DRAFT',
    };
    serviceMock.getWorkorderInvoiceView.mockReturnValue(of(invoiceFixture));
    serviceMock.requestInvoiceFinalization.mockReturnValue(
      of({ workorderId: 'wo-1', invoiceId: 'inv-1', status: 'FINALIZED', finalizedAt: '2026-03-30T12:45:00Z' }),
    );

    fixture.detectChanges();

    expect(component.state()).toBe('ready');
    expect(component.invoiceView()).toEqual(invoiceFixture);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="invoice-line-item"]').length).toBe(1);
  });

  it('sets error state before errorKey when invoice load fails', () => {
    serviceMock.getWorkorderInvoiceView.mockReturnValue(throwError(() => new Error('load fail')));
    serviceMock.requestInvoiceFinalization.mockReturnValue(
      of({ workorderId: 'wo-1', invoiceId: 'inv-1', status: 'FINALIZED', finalizedAt: '2026-03-30T12:45:00Z' }),
    );

    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('WORKEXEC.INVOICE_FINALIZATION.ERROR.LOAD');
  });

  it('requestFinalization sets error state before errorKey on failure', () => {
    const invoiceFixture: WorkorderInvoiceView = {
      workorderId: 'wo-1',
      invoiceId: 'inv-1',
      lineItems: [],
      subtotal: 0,
      taxAmount: 0,
      total: 0,
      currency: 'USD',
      invoiceStatus: 'DRAFT',
    };
    serviceMock.getWorkorderInvoiceView.mockReturnValue(of(invoiceFixture));
    serviceMock.requestInvoiceFinalization.mockReturnValue(throwError(() => new Error('boom')));

    fixture.detectChanges();

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.requestFinalization('missing approval');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('WORKEXEC.INVOICE_FINALIZATION.ERROR.SUBMIT');
    expect(component.isSubmitting()).toBe(false);
    expect(navigateSpy).not.toHaveBeenCalled();

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('requestFinalization navigates on success', () => {
    const invoiceFixture: WorkorderInvoiceView = {
      workorderId: 'wo-1',
      invoiceId: 'inv-1',
      lineItems: [],
      subtotal: 0,
      taxAmount: 0,
      total: 0,
      currency: 'USD',
      invoiceStatus: 'DRAFT',
    };
    serviceMock.getWorkorderInvoiceView.mockReturnValue(of(invoiceFixture));
    serviceMock.requestInvoiceFinalization.mockReturnValue(
      of({ workorderId: 'wo-1', invoiceId: 'inv-1', status: 'FINALIZED', finalizedAt: '2026-03-30T12:45:00Z' }),
    );

    fixture.detectChanges();

    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.requestFinalization('Approved by manager');

    expect(navigateSpy).toHaveBeenCalledWith(['/app/workexec/workorders', 'wo-1']);
    expect(component.isSubmitting()).toBe(false);
  });
});
