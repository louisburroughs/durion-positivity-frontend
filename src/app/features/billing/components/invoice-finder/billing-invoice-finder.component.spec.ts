import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceFinderItem } from '../../models/billing.models';
import { BillingInvoiceFinderComponent } from './billing-invoice-finder.component';

describe('BillingInvoiceFinderComponent', () => {
  let component: BillingInvoiceFinderComponent;

  const items: InvoiceFinderItem[] = [
    { id: 'inv-001', primary: 'Acme Towing LLC', secondary: 'INV-001 · DRAFT', tertiary: 'WO-2026-1001' },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [BillingInvoiceFinderComponent, TranslateModule.forRoot()],
    });
    const fixture = TestBed.createComponent(BillingInvoiceFinderComponent);
    component = fixture.componentInstance;
    component.search = (): Observable<InvoiceFinderItem[]> => of(items);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays idle while input is below the minimum length', () => {
    component.onInput('a');
    expect(component.state()).toBe('idle');
    expect(component.results()).toEqual([]);
  });

  it('loads results after debounce once the query meets the minimum length', () => {
    component.onInput('Acme');
    expect(component.state()).toBe('loading');
    vi.advanceTimersByTime(300);
    expect(component.results()).toEqual(items);
    expect(component.state()).toBe('loaded');
  });

  it('reports empty state when the search yields no results', () => {
    component.search = (): Observable<InvoiceFinderItem[]> => of([]);
    component.onInput('zzzz');
    vi.advanceTimersByTime(300);
    expect(component.state()).toBe('empty');
  });

  it('emits the selected invoice id and clears on choose', () => {
    const emit = vi.spyOn(component.selected, 'emit');
    component.onInput('Acme');
    vi.advanceTimersByTime(300);
    component.choose(items[0]);
    expect(emit).toHaveBeenCalledWith('inv-001');
    expect(component.results()).toEqual([]);
    expect(component.state()).toBe('idle');
  });

  it('surfaces an error state when the search fails', () => {
    component.search = (): Observable<InvoiceFinderItem[]> =>
      new Observable<InvoiceFinderItem[]>(() => {
        throw new Error('boom');
      });
    component.onInput('Acme');
    vi.advanceTimersByTime(300);
    expect(component.state()).toBe('error');
  });
});
