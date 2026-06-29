import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingTransportService } from '../../services/billing-transport.service';
import { BillingLandingPageComponent } from './billing-landing-page.component';

describe('BillingLandingPageComponent', () => {
  let component: BillingLandingPageComponent;
  const transportStub = { searchInvoices: vi.fn().mockReturnValue(of([])) };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [BillingLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: BillingTransportService, useValue: transportStub }],
    });
    component = TestBed.createComponent(BillingLandingPageComponent).componentInstance;
  });

  it('supplies the billing landing config', () => {
    expect(component.config.titleKey).toBe('BILLING.LANDING.TITLE');
    expect(component.config.sections.length).toBe(3);
  });

  it('resolves every section through the invoice finder', () => {
    expect(component.config.sections.every(s => s.recordKind === 'invoice')).toBe(true);
  });

  it('declares secondary inputs on the two-identifier cards', () => {
    const guided = component.config.sections.flatMap(s => s.cards).filter(c => c.kind === 'guided');
    const withSecondary = guided.filter(c => c.kind === 'guided' && c.secondary);
    expect(withSecondary.length).toBe(2);
  });

  it('wires the invoice name-search function', () => {
    expect(component.searchFns.invoice).toBeDefined();
    component.searchFns.invoice!('acme');
    expect(transportStub.searchInvoices).toHaveBeenCalledWith('acme');
  });
});
