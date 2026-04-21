import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkImportColumnMappingTableComponent } from './bulk-import-column-mapping-table.component';
import { BulkLoadColumnMapping, ColumnMappingOverride } from '../../models/bulk-import.models';

const mockMapping: BulkLoadColumnMapping = {
  mappingId: 'map-001',
  jobId: 'job-001',
  sourceColumn: 'SKU',
  targetField: 'productSku',
  confidence: 0.95,
  overriddenByUser: false,
};

const lowConfidenceMapping: BulkLoadColumnMapping = {
  mappingId: 'map-002',
  jobId: 'job-001',
  sourceColumn: 'DESC',
  targetField: 'description',
  confidence: 0.3,
  overriddenByUser: false,
};

const mediumConfidenceMapping: BulkLoadColumnMapping = {
  mappingId: 'map-003',
  jobId: 'job-001',
  sourceColumn: 'QTY',
  targetField: 'quantity',
  confidence: 0.65,
  overriddenByUser: false,
};

describe('BulkImportColumnMappingTableComponent', () => {
  let component: BulkImportColumnMappingTableComponent;
  let fixture: ComponentFixture<BulkImportColumnMappingTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulkImportColumnMappingTableComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(BulkImportColumnMappingTableComponent);
    component = fixture.componentInstance;
    component.mappings = [mockMapping];
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('onApprove emits empty array when no overrides set', () => {
    const emitted: ColumnMappingOverride[][] = [];
    component.approve.subscribe(v => emitted.push(v));
    component.onApprove();
    expect(emitted.length).toBe(1);
    expect(emitted[0]).toEqual([]);
  });

  it('onApprove emits correct ColumnMappingOverride list from collected overrides', () => {
    const emitted: ColumnMappingOverride[][] = [];
    component.approve.subscribe(v => emitted.push(v));

    component.overrideMapping('map-001', 'sku');
    component.onApprove();

    expect(emitted.length).toBe(1);
    expect(emitted[0]).toEqual([{ mappingId: 'map-001', targetField: 'sku' }]);
  });

  it('onApprove emits multiple overrides when multiple are set', () => {
    component.mappings = [mockMapping, lowConfidenceMapping];
    const emitted: ColumnMappingOverride[][] = [];
    component.approve.subscribe(v => emitted.push(v));

    component.overrideMapping('map-001', 'newSku');
    component.overrideMapping('map-002', 'longDescription');
    component.onApprove();

    expect(emitted[0]).toHaveLength(2);
    expect(emitted[0]).toContainEqual({ mappingId: 'map-001', targetField: 'newSku' });
    expect(emitted[0]).toContainEqual({ mappingId: 'map-002', targetField: 'longDescription' });
  });

  it('getOverrideOrDefault returns the override when one exists', () => {
    component.overrideMapping('map-001', 'overriddenField');
    expect(component.getOverrideOrDefault(mockMapping)).toBe('overriddenField');
  });

  it('getOverrideOrDefault returns mapping.targetField when no override set', () => {
    expect(component.getOverrideOrDefault(mockMapping)).toBe('productSku');
  });

  describe('confidenceClass()', () => {
    it('returns confidence--high for value >= 0.8', () => {
      expect(component.confidenceClass(0.95)).toBe('confidence--high');
      expect(component.confidenceClass(0.8)).toBe('confidence--high');
    });

    it('returns confidence--medium for value >= 0.5 and < 0.8', () => {
      expect(component.confidenceClass(0.65)).toBe('confidence--medium');
      expect(component.confidenceClass(0.5)).toBe('confidence--medium');
    });

    it('returns confidence--low for value < 0.5', () => {
      expect(component.confidenceClass(0.3)).toBe('confidence--low');
      expect(component.confidenceClass(0)).toBe('confidence--low');
    });
  });

  describe('confidenceLabel()', () => {
    it('returns HIGH translation key for value >= 0.8', () => {
      expect(component.confidenceLabel(0.9)).toBe('BULK_IMPORT.MAPPING.CONFIDENCE.HIGH');
    });

    it('returns MEDIUM translation key for value >= 0.5 and < 0.8', () => {
      expect(component.confidenceLabel(0.65)).toBe('BULK_IMPORT.MAPPING.CONFIDENCE.MEDIUM');
    });

    it('returns LOW translation key for value < 0.5', () => {
      expect(component.confidenceLabel(0.2)).toBe('BULK_IMPORT.MAPPING.CONFIDENCE.LOW');
    });
  });
});
