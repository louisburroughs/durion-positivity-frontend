import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
import { PostingRulesListPageComponent } from './posting-rules-list-page.component';

describe('PostingRulesListPageComponent', () => {
  let fixture: ComponentFixture<PostingRulesListPageComponent>;
  let component: PostingRulesListPageComponent;

  const accountingServiceStub = {
    listPostingRuleSets: vi.fn().mockReturnValue(of({ items: [], totalCount: 0 })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PostingRulesListPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PostingRulesListPageComponent);
    component = fixture.componentInstance;
  });

  it('renders loading state initially', () => {
    accountingServiceStub.listPostingRuleSets.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="loading-state"]');
    expect(el).toBeTruthy();
  });

  it('renders rule set rows when service returns data', () => {
    accountingServiceStub.listPostingRuleSets.mockReturnValueOnce(
      of({
        items: [
          {
            postingRuleSetId: 'rs-1',
            name: 'Invoice Rules',
            eventType: 'InvoiceIssued',
            latestVersionNumber: 1,
            latestState: 'PUBLISHED',
          },
        ],
        totalCount: 1,
      }),
    );
    fixture.detectChanges();
    expect(component.ruleSets().length).toBe(1);
    expect(component.pageState()).toBe('ready');
  });

  it('renders error state when service errors with 500', () => {
    accountingServiceStub.listPostingRuleSets.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(el).toBeTruthy();
  });

  it('renders forbidden state when service errors with 403', () => {
    accountingServiceStub.listPostingRuleSets.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="forbidden-state"]');
    expect(el).toBeTruthy();
  });

  it('openDetail(item) navigates to posting rule set detail page', () => {
    accountingServiceStub.listPostingRuleSets.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigate');
    component.openDetail({
      postingRuleSetId: 'rs-99',
      name: 'Invoice Rules',
      eventType: 'InvoiceIssued',
      latestVersionNumber: 1,
      latestState: 'PUBLISHED' as any,
    });
    expect(spy).toHaveBeenCalledWith(['/app/accounting/posting-rules', 'rs-99']);
  });

  it('openDetail(item) does not navigate when postingRuleSetId is falsy', () => {
    accountingServiceStub.listPostingRuleSets.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigate');
    component.openDetail({
      postingRuleSetId: '',
      name: 'Draft',
      eventType: 'InvoiceIssued',
      latestVersionNumber: 0,
      latestState: 'DRAFT' as any,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('newRuleSet() navigates to posting-rules/new', () => {
    accountingServiceStub.listPostingRuleSets.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigate');
    component.newRuleSet();
    expect(spy).toHaveBeenCalledWith(['/app/accounting/posting-rules/new']);
  });
});
