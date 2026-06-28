import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingTransportService } from '../../services/billing-transport.service';
import { BillingLandingPageComponent } from './billing-landing-page.component';

describe('BillingLandingPageComponent', () => {
  let component: BillingLandingPageComponent;
  const routerStub = { navigate: vi.fn().mockResolvedValue(true) };
  const transportStub = { searchInvoices: vi.fn().mockReturnValue(of([])) };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [BillingLandingPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Router, useValue: routerStub },
        { provide: BillingTransportService, useValue: transportStub },
      ],
    });
    component = TestBed.createComponent(BillingLandingPageComponent).componentInstance;
  });

  it('marks every invoice-id entry card as a finder', () => {
    const cards = component.sections.flatMap(s => s.cards);
    const finders = cards.filter(c => c.finder);
    // invoice-detail, payment-capture, void-refund, receipt-list, receipt-detail
    expect(finders.map(c => c.field)).toEqual([
      'invoiceDetailId',
      'paymentCaptureInvoiceId',
      'voidRefundInvoiceId',
      'receiptListInvoiceId',
      'receiptDetailInvoiceId',
    ]);
  });

  it('renders a finder component for every finder card', () => {
    const fixture = TestBed.createComponent(BillingLandingPageComponent);
    fixture.detectChanges();
    const finders = fixture.nativeElement.querySelectorAll('app-billing-invoice-finder');
    expect(finders.length).toBe(5);
  });

  it('single-field finder selection navigates immediately', () => {
    const card = component.sections.flatMap(s => s.cards).find(c => c.field === 'paymentCaptureInvoiceId')!;
    component.onFinderSelected(card, 'inv-123');
    expect(routerStub.navigate).toHaveBeenCalledWith(['/app', 'billing', 'invoices', 'inv-123', 'payment-capture']);
  });

  it('two-field finder selection fills the invoice value without navigating', () => {
    const card = component.sections.flatMap(s => s.cards).find(c => c.field === 'voidRefundInvoiceId')!;
    component.onFinderSelected(card, 'inv-456');
    expect(routerStub.navigate).not.toHaveBeenCalled();
    expect(component.launchValue('voidRefundInvoiceId')).toBe('inv-456');
  });

  it('openFinderSelection navigates to the selected invoice detail page', async () => {
    const card = component.sections.flatMap(s => s.cards).find(c => c.field === 'invoiceDetailId')!;
    await component.openFinderSelection(card, 'inv-123');
    expect(routerStub.navigate).toHaveBeenCalledWith(['/app', 'billing', 'invoices', 'inv-123']);
    expect(component.state()).toBe('ready');
  });

  it('openFinderSelection ignores an empty selection', async () => {
    const card = component.sections.flatMap(s => s.cards).find(c => c.finder)!;
    await component.openFinderSelection(card, '');
    expect(routerStub.navigate).not.toHaveBeenCalled();
  });

  it('invoiceSearch delegates to the transport service', () => {
    component.invoiceSearch('acme').subscribe();
    expect(transportStub.searchInvoices).toHaveBeenCalledWith('acme');
  });
});
