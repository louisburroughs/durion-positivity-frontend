import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceFinderItem } from '../../models/billing.models';
import { BillingInvoiceFinderComponent } from './billing-invoice-finder.component';

describe('BillingInvoiceFinderComponent', () => {
  let component: BillingInvoiceFinderComponent;
  let fixture: ComponentFixture<BillingInvoiceFinderComponent>;

  const items: InvoiceFinderItem[] = [
    { id: 'inv-001', primary: 'Acme Towing LLC', secondary: 'INV-001 · Draft', tertiary: 'WO-2026-1001' },
    { id: 'inv-002', primary: 'Beta Auto', secondary: 'INV-002 · Finalized' },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [BillingInvoiceFinderComponent, TranslateModule.forRoot()],
    });
    fixture = TestBed.createComponent(BillingInvoiceFinderComponent);
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

  it('does not reopen results when the input is cleared below minChars (stale-result race)', () => {
    component.onInput('Acme');
    component.onInput('A'); // cleared below minChars before debounce fires
    vi.advanceTimersByTime(500);
    expect(component.state()).toBe('idle');
    expect(component.results()).toEqual([]);
  });

  it('honours a custom debounceMs input', () => {
    component.debounceMs = 600;
    component.onInput('Acme');
    vi.advanceTimersByTime(300);
    expect(component.state()).toBe('loading'); // not yet fired at 300ms
    vi.advanceTimersByTime(400);
    expect(component.state()).toBe('loaded');
  });

  describe('keyboard navigation', () => {
    beforeEach(() => {
      component.onInput('Acme');
      vi.advanceTimersByTime(300);
    });

    const key = (k: string) => new KeyboardEvent('keydown', { key: k });

    it('ArrowDown/ArrowUp move and clamp the active option', () => {
      component.onKeydown(key('ArrowDown'));
      expect(component.activeIndex()).toBe(0);
      component.onKeydown(key('ArrowDown'));
      expect(component.activeIndex()).toBe(1);
      component.onKeydown(key('ArrowDown')); // clamp at last
      expect(component.activeIndex()).toBe(1);
      component.onKeydown(key('ArrowUp'));
      expect(component.activeIndex()).toBe(0);
    });

    it('Enter selects the active option, Enter with no active option does nothing', () => {
      const emit = vi.spyOn(component.selected, 'emit');
      component.onKeydown(key('Enter')); // activeIndex -1
      expect(emit).not.toHaveBeenCalled();
      component.onKeydown(key('ArrowDown'));
      component.onKeydown(key('Enter'));
      expect(emit).toHaveBeenCalledWith('inv-001');
    });

    it('Escape clears the dropdown', () => {
      component.onKeydown(key('Escape'));
      expect(component.state()).toBe('idle');
      expect(component.results()).toEqual([]);
    });
  });

  describe('ARIA / template', () => {
    it('aria-expanded is true whenever the popup is shown (loading/loaded), false when idle', () => {
      fixture.detectChanges();
      const input = (): HTMLInputElement => fixture.nativeElement.querySelector('input[role="combobox"]');
      expect(input().getAttribute('aria-expanded')).toBe('false');

      component.onInput('Acme');
      fixture.detectChanges();
      expect(input().getAttribute('aria-expanded')).toBe('true'); // loading

      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      expect(input().getAttribute('aria-expanded')).toBe('true'); // loaded
    });

    it('listbox contains only option children; status lives outside it', () => {
      component.onInput('Acme');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      const listbox: HTMLElement = fixture.nativeElement.querySelector('[role="listbox"]');
      const nonOptionChildren = Array.from(listbox.children).filter(c => c.getAttribute('role') !== 'option');
      expect(nonOptionChildren).toHaveLength(0);
      expect(listbox.querySelector('[role="status"], [role="alert"]')).toBeNull();
    });

    it('uses a unique id prefix so two instances do not collide', () => {
      const other = TestBed.createComponent(BillingInvoiceFinderComponent).componentInstance;
      expect(component.idPrefix).not.toBe(other.idPrefix);
    });
  });
});
