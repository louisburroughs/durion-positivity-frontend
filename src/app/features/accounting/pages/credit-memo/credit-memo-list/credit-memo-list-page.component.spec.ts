import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
import { CreditMemoListPageComponent } from './credit-memo-list-page.component';

describe('CreditMemoListPageComponent', () => {
  let fixture: ComponentFixture<CreditMemoListPageComponent>;
  let component: CreditMemoListPageComponent;

  const accountingServiceStub = {
    listCreditMemos: vi.fn().mockReturnValue(of({ items: [], totalCount: 0 })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreditMemoListPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreditMemoListPageComponent);
    component = fixture.componentInstance;
  });

  it('renders loading state initially', () => {
    accountingServiceStub.listCreditMemos.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="loading-state"]');
    expect(el).toBeTruthy();
  });

  it('renders memo rows when service returns data', () => {
    accountingServiceStub.listCreditMemos.mockReturnValueOnce(
      of({
        items: [
          {
            creditMemoId: 'cm-1',
            originalInvoiceId: 'inv-1',
            customerId: 'cust-1',
            totalAmount: 100,
            status: 'ISSUED',
            creationTimestamp: '2024-01-01',
          },
        ],
        totalCount: 1,
      }),
    );
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="memo-row"]');
    expect(rows.length).toBe(1);
  });

  it('renders empty state when service returns no items', () => {
    accountingServiceStub.listCreditMemos.mockReturnValueOnce(
      of({ items: [], totalCount: 0 }),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="empty-state"]');
    expect(el).toBeTruthy();
  });

  it('renders error state when service errors with 500', () => {
    accountingServiceStub.listCreditMemos.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(el).toBeTruthy();
  });

  it('renders forbidden state when service errors with 403', () => {
    accountingServiceStub.listCreditMemos.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="forbidden-state"]');
    expect(el).toBeTruthy();
  });

  it('newMemo() navigates to the new credit memo route', () => {
    accountingServiceStub.listCreditMemos.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigate');
    component.newMemo();
    expect(spy).toHaveBeenCalledWith(['/app/accounting/credit-memos/new']);
  });

  it('openDetail(memo) navigates to the credit memo detail page', () => {
    accountingServiceStub.listCreditMemos.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigate');
    component.openDetail({
      creditMemoId: 'cm-99',
      originalInvoiceId: 'inv-1',
      customerId: 'cust-1',
      totalAmount: 100,
      status: 'POSTED',
      creationTimestamp: '2024-01-01',
    });
    expect(spy).toHaveBeenCalledWith(['/app/accounting/credit-memos', 'cm-99']);
  });

  it('load() resets pageState to loading when re-invoked', () => {
    accountingServiceStub.listCreditMemos.mockReturnValueOnce(
      of({
        items: [
          { creditMemoId: 'cm-1', originalInvoiceId: 'inv-1', customerId: 'cust-1', totalAmount: 100, status: 'ISSUED', creationTimestamp: '2024-01-01' },
        ],
        totalCount: 1,
      }),
    );
    fixture.detectChanges();
    expect(component.pageState()).toBe('ready');
    accountingServiceStub.listCreditMemos.mockReturnValueOnce(new Subject());
    component.load();
    expect(component.pageState()).toBe('loading');
  });
});
