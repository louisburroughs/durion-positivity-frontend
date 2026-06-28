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

  it('marks the invoice-detail card as a finder and no other card', () => {
    const cards = component.sections.flatMap(s => s.cards);
    const finders = cards.filter(c => c.finder);
    expect(finders).toHaveLength(1);
    expect(finders[0].field).toBe('invoiceDetailId');
  });

  it('renders the finder component for the invoice-detail card', () => {
    const fixture = TestBed.createComponent(BillingLandingPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-billing-invoice-finder')).not.toBeNull();
  });

  it('openFinderSelection navigates to the selected invoice detail page', async () => {
    const card = component.sections.flatMap(s => s.cards).find(c => c.finder)!;
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
