import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApprovalDetailPageComponent } from './approval-detail-page.component';
import { BASE_PATH } from '@durion-sdk/workorder';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const mockRoute = {
  snapshot: {
    paramMap: {
      get: (k: string) => {
        if (k === 'estimateId') return 'est-123';
        if (k === 'approvalId') return 'approval-456';
        return null;
      }
    }
  }
};

const TRANSLATIONS = {
  WORKEXEC: {
    ERROR: {
      APPROVAL_EXPIRED:
        'This approval has expired. No actions can be taken on this approval. Create a revision to restart the approval process.',
      APPROVAL_EXPIRED_ON:
        'This approval has expired on {{date}}. No actions can be taken on this approval. Create a revision to restart the approval process.',
    },
  },
};

describe('ApprovalDetailPageComponent [Story 268]', () => {
  let fixture: ComponentFixture<ApprovalDetailPageComponent>;
  let component: ApprovalDetailPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApprovalDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: BASE_PATH, useValue: environment.apiBaseUrl },
      ],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', TRANSLATIONS);
    translate.use('en-US');
    fixture = TestBed.createComponent(ApprovalDetailPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    expect(component).toBeTruthy();
  });

  it('should show expired state when estimate status is EXPIRED', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'EXPIRED', customerId: 'c', vehicleId: 'v',
      expiresAt: '2024-01-01T00:00:00Z'
    });
    fixture.detectChanges();
    expect(component.pageState()).toBe('expired');
    expect(component.errorMessage()).toContain('expired');
  });

  it('should detect expiration via expiresAt date even if status is not EXPIRED', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'PENDING_APPROVAL', customerId: 'c', vehicleId: 'v',
      expiresAt: '2020-01-01T00:00:00Z'
    });
    fixture.detectChanges();
    expect(component.isExpired()).toBe(true);
    expect(component.pageState()).toBe('expired');
  });

  it('should be ready when estimate is not expired', () => {
    fixture.detectChanges();
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'PENDING_APPROVAL', customerId: 'c', vehicleId: 'v',
      expiresAt: futureDate
    });
    fixture.detectChanges();
    expect(component.pageState()).toBe('ready');
    expect(component.isExpired()).toBe(false);
  });

  it('should disable actions in expired state — no approval endpoint calls possible', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'EXPIRED', customerId: 'c', vehicleId: 'v', expiresAt: '2024-01-01T00:00:00Z'
    });
    fixture.detectChanges();
    // Confirm no approval POST attempts pending
    http.expectNone(`${BASE}/v1/workorders/estimates/est-123/approval`);
    expect(component.pageState()).toBe('expired');
  });
});
