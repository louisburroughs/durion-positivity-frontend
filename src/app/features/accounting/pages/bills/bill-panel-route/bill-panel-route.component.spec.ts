import { Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, map } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../../core/services/auth.service';
import { AccountingPreferencesService } from '../../../services/accounting-preferences.service';
import { PayablesService } from '../../../services/payables.service';
import { BillsPageLink } from '../bills-page-link';
import { CLERK, authMock, payablesMock } from '../bills-page.spec-helper';
import { BillPanelRouteComponent } from './bill-panel-route.component';

class FakeLink extends BillsPageLink {
  private readonly current = signal<string | null>(null);
  readonly selectedBillId: Signal<string | null> = this.current.asReadonly();
  readonly billChanged = vi.fn();
  readonly openMatched = vi.fn();
  focusOwed = false;
  select(billId: string | null): void {
    this.current.set(billId);
  }
  takePanelFocus(): boolean {
    const owed = this.focusOwed;
    this.focusOwed = false;
    return owed;
  }
}

describe('BillPanelRouteComponent (bills, bills/:billId)', () => {
  function render(billId: string | null): { link: FakeLink; params: BehaviorSubject<Record<string, string>> } {
    const link = new FakeLink();
    const params = new BehaviorSubject<Record<string, string>>(billId ? { billId } : {});
    TestBed.configureTestingModule({
      imports: [BillPanelRouteComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillsPageLink, useValue: link },
        { provide: ActivatedRoute, useValue: { paramMap: params.pipe(map(convertToParamMap)), snapshot: { paramMap: convertToParamMap(params.value) } } },
        { provide: PayablesService, useValue: payablesMock() },
        { provide: AuthService, useValue: authMock(CLERK, { tenantId: signal<string | null>(null) }).service },
        { provide: AccountingPreferencesService, useValue: { showTerms: signal(false) } },
      ],
    });
    return { link, params };
  }

  it('tells the page which bill is open and renders its panel', () => {
    const { link } = render('bill-1');
    const fixture = TestBed.createComponent(BillPanelRouteComponent);
    fixture.detectChanges();

    expect(link.selectedBillId()).toBe('bill-1');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-bill-review-panel')).not.toBeNull();
  });

  it('asks to pick a bill when none is in the route', () => {
    const { link } = render(null);
    const fixture = TestBed.createComponent(BillPanelRouteComponent);
    fixture.detectChanges();

    expect(link.selectedBillId()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="panel-empty"]')).not.toBeNull();
  });

  it('relays a decision to the page so it re-reads its counts and list', () => {
    const { link } = render('bill-1');
    const fixture = TestBed.createComponent(BillPanelRouteComponent);
    fixture.detectChanges();
    const panel = fixture.debugElement.children[0].componentInstance as { changed: { emit: () => void } };
    panel.changed.emit();

    expect(link.billChanged).toHaveBeenCalledTimes(1);
  });

  it('hands a selection that matched another bill to the page (Q5)', () => {
    const { link } = render('bill-1');
    const fixture = TestBed.createComponent(BillPanelRouteComponent);
    fixture.detectChanges();
    const panel = fixture.debugElement.children[0].componentInstance as { moved: { emit: (value: unknown) => void } };
    panel.moved.emit({ billId: 'bill-9', billNumber: 'REC-9' });

    expect(link.openMatched).toHaveBeenCalledWith({ billId: 'bill-9', billNumber: 'REC-9' });
  });

  it('moves focus to the panel heading once loaded when a row was picked on a phone (§5.7)', async () => {
    const { link } = render('bill-1');
    link.focusOwed = true;
    const fixture = TestBed.createComponent(BillPanelRouteComponent);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.activeElement?.tagName).toBe('H2');
    expect(link.focusOwed).toBe(false);
    (fixture.nativeElement as HTMLElement).remove();
  });

  it('clears the page’s selection when it goes away', () => {
    const { link } = render('bill-1');
    const fixture = TestBed.createComponent(BillPanelRouteComponent);
    fixture.detectChanges();
    fixture.destroy();

    expect(link.selectedBillId()).toBeNull();
  });
});
