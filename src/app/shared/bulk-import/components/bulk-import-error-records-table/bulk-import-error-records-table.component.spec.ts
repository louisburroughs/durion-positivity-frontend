import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkImportErrorRecordsTableComponent, CorrectionSubmitEvent } from './bulk-import-error-records-table.component';
import { BulkLoadRecordAudit } from '../../models/bulk-import.models';

const mockRecord: BulkLoadRecordAudit = {
  recordId: 'rec-001',
  jobId: 'job-001',
  entityType: 'INVENTORY',
  rowNumber: 1,
  reviewStatus: 'PENDING',
  reasonCodes: ['INVALID_SKU'],
  originalValues: { sku: 'BAD-SKU', qty: '0' },
};

describe('BulkImportErrorRecordsTableComponent', () => {
  let component: BulkImportErrorRecordsTableComponent;
  let fixture: ComponentFixture<BulkImportErrorRecordsTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulkImportErrorRecordsTableComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(BulkImportErrorRecordsTableComponent);
    component = fixture.componentInstance;
    component.records = [mockRecord];
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('getDraft returns empty string before any update', () => {
    expect(component.getDraft('rec-001', 'sku')).toBe('');
  });

  it('updateDraft stores the value and getDraft retrieves it', () => {
    component.updateDraft('rec-001', 'sku', 'GOOD-SKU');
    expect(component.getDraft('rec-001', 'sku')).toBe('GOOD-SKU');
  });

  it('updateDraft accumulates multiple fields for the same record', () => {
    component.updateDraft('rec-001', 'sku', 'GOOD-SKU');
    component.updateDraft('rec-001', 'qty', '10');
    expect(component.getDraft('rec-001', 'sku')).toBe('GOOD-SKU');
    expect(component.getDraft('rec-001', 'qty')).toBe('10');
  });

  it('hasDraft returns false before any update', () => {
    expect(component.hasDraft('rec-001')).toBe(false);
  });

  it('hasDraft returns true after updateDraft', () => {
    component.updateDraft('rec-001', 'sku', 'GOOD-SKU');
    expect(component.hasDraft('rec-001')).toBe(true);
  });

  it('hasDraft returns false for a different recordId', () => {
    component.updateDraft('rec-001', 'sku', 'GOOD-SKU');
    expect(component.hasDraft('rec-999')).toBe(false);
  });

  it('onSubmit does not emit when no draft exists', () => {
    const emitted: CorrectionSubmitEvent[] = [];
    component.submitCorrection.subscribe(e => emitted.push(e));
    component.onSubmit(mockRecord);
    expect(emitted.length).toBe(0);
  });

  it('onSubmit emits submitCorrection with correct CorrectionSubmitEvent', () => {
    const emitted: CorrectionSubmitEvent[] = [];
    component.submitCorrection.subscribe(e => emitted.push(e));

    component.updateDraft('rec-001', 'sku', 'GOOD-SKU');
    component.onSubmit(mockRecord);

    expect(emitted.length).toBe(1);
    expect(emitted[0].record).toEqual(mockRecord);
    expect(emitted[0].request).toEqual({ correctedValues: { sku: 'GOOD-SKU' } });
  });

  it('onSubmit includes all draft fields in the submitted correction', () => {
    const emitted: CorrectionSubmitEvent[] = [];
    component.submitCorrection.subscribe(e => emitted.push(e));

    component.updateDraft('rec-001', 'sku', 'GOOD-SKU');
    component.updateDraft('rec-001', 'qty', '5');
    component.onSubmit(mockRecord);

    expect(emitted[0].request.correctedValues).toEqual({ sku: 'GOOD-SKU', qty: '5' });
  });

  it('getFieldKeys returns keys from originalValues', () => {
    expect(component.getFieldKeys(mockRecord)).toEqual(['sku', 'qty']);
  });
});
