import { describe, it, expect, afterEach, vi } from 'vitest';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OperationalContextPageComponent } from './operational-context-page.component';
import { WorkexecService } from '../../services/workexec.service';
import { OperationalContextResponse } from '../../models/workexec.models';
import enUS from '../../../../../assets/i18n/en-US.json';

const stubWorkexecService = {
  getOperationalContext: vi.fn(),
  overrideOperationalContext: vi.fn(),
};

describe('OperationalContextPageComponent [CAP-140]', () => {
  let fixture: ComponentFixture<OperationalContextPageComponent>;
  let component: OperationalContextPageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubWorkexecService.getOperationalContext.mockReturnValue(of({ workorderId: 'wo-1', status: 'OPEN' }));
    stubWorkexecService.overrideOperationalContext.mockReturnValue(of({ workorderId: 'wo-1', status: 'OVERRIDDEN' }));

    await TestBed.configureTestingModule({
      imports: [OperationalContextPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: WorkexecService, useValue: stubWorkexecService },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'wo-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OperationalContextPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('renders without crashing', async () => {
    await setup();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('loads operational context on init with route param', async () => {
    await setup();
    expect(stubWorkexecService.getOperationalContext).toHaveBeenCalledWith('wo-1');
  });

  it('renders .context-panel', async () => {
    await setup();
    const panel = fixture.debugElement.query(By.css('.context-panel'));
    expect(panel).toBeTruthy();
  });

  it('shows .override-panel when override form opened', async () => {
    await setup();
    component.openOverrideForm();
    fixture.detectChanges();
    const panel = fixture.debugElement.query(By.css('.override-panel'));
    expect(panel).toBeTruthy();
  });

  it('calls overrideOperationalContext with workorderId and form data', async () => {
    await setup();
    component.openOverrideForm();
    component.overrideForm.setValue({
      contextKey: 'priority',
      contextValue: 'HIGH',
      overrideReason: 'Manager override',
    });

    component.submitOverride();

    expect(stubWorkexecService.overrideOperationalContext).toHaveBeenCalledWith('wo-1', {
      contextKey: 'priority',
      contextValue: 'HIGH',
      overrideReason: 'Manager override',
    });
  });

  it('shows .success-banner on success', async () => {
    await setup();
    component.openOverrideForm();
    component.overrideForm.setValue({
      contextKey: 'eta',
      contextValue: '30m',
      overrideReason: 'Traffic condition',
    });
    component.submitOverride();
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.success-banner'));
    expect(banner).toBeTruthy();
  });

  describe('related-entity ids are never rendered (issue #285)', () => {
    const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const context: OperationalContextResponse = {
      locationId: '01a0a459-65b0-7609-b8a2-58332d3af186',
      resourceId: '01a0a459-65b0-7609-b8a2-58332d3af187',
      resourceType: 'BAY',
      assignedMechanics: ['01a0a459-65b0-7609-b8a2-58332d3af188', '01a0a459-65b0-7609-b8a2-58332d3af189'],
      assignedResources: [],
      constraints: ['LIFT_REQUIRED'],
      locked: true,
      scheduledStartAt: '2026-09-23T14:00:00Z',
      version: '01a0a459-65b0-7609-b8a2-58332d3af190',
    };

    const setupWithBundle = async () => {
      await setup();
      stubWorkexecService.getOperationalContext.mockReturnValue(of(context));
      // ADR-0035 §8: copy asserted against the shipped bundle.
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en-US', enUS);
      translate.use('en-US');
      component.loadContext();
      fixture.detectChanges();
    };

    it('renders translated labels and counts instead of ids', async () => {
      await setupWithBundle();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      const ops = enUS.WORKEXEC.OPS_CONTEXT;

      expect(text).not.toMatch(UUID);
      expect(text).toContain(ops.FIELD.ASSIGNED_MECHANICS);
      expect(text).toContain(ops.ASSIGNED_COUNT.replace('{{count}}', '2'));
      expect(text).toContain(ops.RESOURCE_TYPE.BAY);
      expect(text).toContain(ops.LOCKED_YES);
      expect(text).toContain('LIFT_REQUIRED');
      // Raw DTO keys are no longer echoed as labels.
      expect(text).not.toContain('locationId');
    });

    it('does not report an omitted locked flag as "No"', async () => {
      await setupWithBundle();
      stubWorkexecService.getOperationalContext.mockReturnValue(of({ ...context, locked: undefined }));
      component.loadContext();
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

      expect(text).not.toContain(enUS.WORKEXEC.OPS_CONTEXT.LOCKED_NO);
      expect(text).not.toContain(enUS.WORKEXEC.OPS_CONTEXT.LOCKED_YES);
    });

    it('shows the empty placeholder for an unknown resource type and a missing date', async () => {
      await setupWithBundle();
      stubWorkexecService.getOperationalContext.mockReturnValue(of({ ...context, resourceType: 'SOMETHING_NEW', scheduledStartAt: undefined }));
      component.loadContext();
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

      expect(text).not.toContain('SOMETHING_NEW');
      expect(text).toContain(enUS.COMMON.EMPTY_VALUE);
    });
  });
});
