import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkImportResultsSummaryComponent } from './bulk-import-results-summary.component';
import { BulkLoadJob } from '../../models/bulk-import.models';

const mockJob: BulkLoadJob = {
  jobId: 'job-001',
  domainType: 'INVENTORY',
  status: 'COMPLETED',
  fileName: 'test.csv',
  totalRows: 100,
  successCount: 80,
  failureCount: 20,
};

describe('BulkImportResultsSummaryComponent', () => {
  let component: BulkImportResultsSummaryComponent;
  let fixture: ComponentFixture<BulkImportResultsSummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulkImportResultsSummaryComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(BulkImportResultsSummaryComponent);
    component = fixture.componentInstance;
    component.job = mockJob;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('renders with a valid BulkLoadJob input', () => {
    expect(component.job).toEqual(mockJob);
  });

  it('downloadReport output emits when downloadReport is triggered', () => {
    let callCount = 0;
    component.downloadReport.subscribe(() => callCount++);
    component.downloadReport.emit();
    expect(callCount).toBe(1);
  });

  it('retry output emits when retry is triggered', () => {
    let callCount = 0;
    component.retry.subscribe(() => callCount++);
    component.retry.emit();
    expect(callCount).toBe(1);
  });

  it('downloadReport emits when download button is clicked in the DOM', () => {
    let callCount = 0;
    component.downloadReport.subscribe(() => callCount++);
    const buttons = fixture.debugElement.queryAll(By.css('button[type="button"]'));
    expect(buttons.length).toBeGreaterThan(0);
    buttons[0].triggerEventHandler('click', null);
    expect(callCount).toBe(1);
  });

  it('retry emits when retry button is clicked in the DOM', () => {
    let callCount = 0;
    component.retry.subscribe(() => callCount++);
    const buttons = fixture.debugElement.queryAll(By.css('button[type="button"]'));
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    buttons[1].triggerEventHandler('click', null);
    expect(callCount).toBe(1);
  });
});
