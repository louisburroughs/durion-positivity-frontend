import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { BulkImportProgressStepperComponent } from './bulk-import-progress-stepper.component';
import { JobStatus } from '../../models/bulk-import.models';

describe('BulkImportProgressStepperComponent', () => {
  let component: BulkImportProgressStepperComponent;
  let fixture: ComponentFixture<BulkImportProgressStepperComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulkImportProgressStepperComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(BulkImportProgressStepperComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('default status is CREATED', () => {
    expect(component.status).toBe('CREATED');
  });

  it('has the expected wizard steps', () => {
    expect(component.steps.length).toBe(6);
  });

  describe('getStepState()', () => {
    it('returns active for the step matching the current status', () => {
      component.status = 'DETECTING' as JobStatus;
      const detectStep = component.steps[1]; // DETECTING is index 1
      expect(component.getStepState(detectStep)).toBe('active');
    });

    it('returns complete for steps before the current status step', () => {
      component.status = 'MAPPING_REVIEW' as JobStatus;
      const uploadStep = component.steps[0]; // CREATED/UPLOADING
      const detectStep = component.steps[1]; // DETECTING
      expect(component.getStepState(uploadStep)).toBe('complete');
      expect(component.getStepState(detectStep)).toBe('complete');
    });

    it('returns pending for steps after the current status step', () => {
      component.status = 'DETECTING' as JobStatus;
      const mappingStep = component.steps[2]; // MAPPING_REVIEW is index 2
      const processStep = component.steps[4]; // PROCESSING is index 4
      expect(component.getStepState(mappingStep)).toBe('pending');
      expect(component.getStepState(processStep)).toBe('pending');
    });

    it('returns active for the first step when status is CREATED', () => {
      component.status = 'CREATED' as JobStatus;
      const firstStep = component.steps[0];
      expect(component.getStepState(firstStep)).toBe('active');
    });

    it('returns active for UPLOADING (same step as CREATED)', () => {
      component.status = 'UPLOADING' as JobStatus;
      const uploadStep = component.steps[0];
      expect(component.getStepState(uploadStep)).toBe('active');
    });

    it('returns active for last step when status is COMPLETED', () => {
      component.status = 'COMPLETED' as JobStatus;
      const doneStep = component.steps[5]; // DONE is index 5
      expect(component.getStepState(doneStep)).toBe('active');
    });

    it('returns active for last step when status is FAILED', () => {
      component.status = 'FAILED' as JobStatus;
      const doneStep = component.steps[5]; // DONE is index 5
      expect(component.getStepState(doneStep)).toBe('active');
    });
  });
});
