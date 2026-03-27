import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
import { CreditMemoDetailPageComponent } from './credit-memo-detail-page.component';

describe('CreditMemoDetailPageComponent', () => {
  let fixture: ComponentFixture<CreditMemoDetailPageComponent>;
  let component: CreditMemoDetailPageComponent;

  const accountingServiceStub = {
    getCreditMemo: vi.fn().mockReturnValue(
      of({
        creditMemoId: 'memo-1',
        originalInvoiceId: 'inv-1',
        customerId: 'cust-1',
        creditAmount: 50,
        totalAmount: 50,
        status: 'ISSUED',
        reasonCode: 'RETURN',
        justificationNote: 'Customer return',
        creationTimestamp: '2024-01-01',
      }),
    ),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreditMemoDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AccountingService, useValue: accountingServiceStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ memoId: 'memo-1' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreditMemoDetailPageComponent);
    component = fixture.componentInstance;
  });

  it('renders loading state initially', () => {
    accountingServiceStub.getCreditMemo.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="loading-state"]');
    expect(el).toBeTruthy();
  });

  it('renders memo detail when service returns data', () => {
    accountingServiceStub.getCreditMemo.mockReturnValueOnce(
      of({
        creditMemoId: 'memo-1',
        originalInvoiceId: 'inv-1',
        customerId: 'cust-1',
        creditAmount: 50,
        totalAmount: 50,
        status: 'ISSUED',
        reasonCode: 'RETURN',
        justificationNote: 'Customer return',
        creationTimestamp: '2024-01-01',
      }),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="memo-detail"]');
    expect(el).toBeTruthy();
  });

  it('renders error state when service errors with 500', () => {
    accountingServiceStub.getCreditMemo.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(el).toBeTruthy();
  });

  it('renders forbidden state when service errors with 403', () => {
    accountingServiceStub.getCreditMemo.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="forbidden-state"]');
    expect(el).toBeTruthy();
  });

  it('renders not-found state when service errors with 404', () => {
    accountingServiceStub.getCreditMemo.mockReturnValueOnce(
      throwError(() => ({ status: 404 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="empty-state"]');
    expect(el).toBeTruthy();
  });
});
