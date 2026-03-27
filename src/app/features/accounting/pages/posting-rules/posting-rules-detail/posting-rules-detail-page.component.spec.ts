import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
import { PostingRulesDetailPageComponent } from './posting-rules-detail-page.component';

describe('PostingRulesDetailPageComponent', () => {
  let fixture: ComponentFixture<PostingRulesDetailPageComponent>;
  let component: PostingRulesDetailPageComponent;

  const accountingServiceStub = {
    getPostingRuleSet: vi.fn().mockReturnValue(
      of({
        postingRuleSetId: 'rule-1',
        name: 'Invoice Rules',
        eventType: 'InvoiceIssued',
        description: 'Rules for invoice events',
        createdAt: '2024-01-01',
        modifiedAt: '2024-01-02',
        versions: [],
      }),
    ),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PostingRulesDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AccountingService, useValue: accountingServiceStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ ruleSetId: 'rule-1' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PostingRulesDetailPageComponent);
    component = fixture.componentInstance;
  });

  it('renders loading state initially', () => {
    accountingServiceStub.getPostingRuleSet.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="loading-state"]');
    expect(el).toBeTruthy();
  });

  it('renders rule set detail when service returns data', () => {
    accountingServiceStub.getPostingRuleSet.mockReturnValueOnce(
      of({
        postingRuleSetId: 'rule-1',
        name: 'Invoice Rules',
        eventType: 'InvoiceIssued',
        description: 'Rules for invoice events',
        createdAt: '2024-01-01',
        modifiedAt: '2024-01-02',
        versions: [],
      }),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="rule-set-detail"]');
    expect(el).toBeTruthy();
  });

  it('renders error state when service errors with 500', () => {
    accountingServiceStub.getPostingRuleSet.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(el).toBeTruthy();
  });

  it('renders forbidden state when service errors with 403', () => {
    accountingServiceStub.getPostingRuleSet.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="forbidden-state"]');
    expect(el).toBeTruthy();
  });

  it('renders not-found state when service errors with 404', () => {
    accountingServiceStub.getPostingRuleSet.mockReturnValueOnce(
      throwError(() => ({ status: 404 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="empty-state"]');
    expect(el).toBeTruthy();
  });

  it('retry button calls load() again', () => {
    accountingServiceStub.getPostingRuleSet.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    fixture.detectChanges();

    accountingServiceStub.getPostingRuleSet.mockReturnValueOnce(
      of({
        postingRuleSetId: 'rule-1',
        name: 'Invoice Rules',
        eventType: 'InvoiceIssued',
        description: 'Rules for invoice events',
        createdAt: '2024-01-01',
        modifiedAt: '2024-01-02',
        versions: [],
      }),
    );

    const retryBtn = fixture.nativeElement.querySelector('[data-testid="error-state"] button');
    retryBtn.click();
    fixture.detectChanges();

    const detail = fixture.nativeElement.querySelector('[data-testid="rule-set-detail"]');
    expect(detail).toBeTruthy();
  });
});
