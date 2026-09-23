import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import enUS from '../../../../../assets/i18n/en-US.json';
import { WorkorderDetailResponse } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { WorkorderLaborPageComponent } from './workorder-labor-page.component';

const WORKORDER_ID = '01a0a459-65b0-7609-b8a2-58332d3af186';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const detail: WorkorderDetailResponse = { id: WORKORDER_ID, workorderNumber: 'WO-2026-1041', items: [] };

const serviceMock = {
  getWorkorderDetail: vi.fn(),
  getLaborHistory: vi.fn(),
};

describe('WorkorderLaborPageComponent', () => {
  let fixture: ComponentFixture<WorkorderLaborPageComponent>;

  const setup = async (wo: WorkorderDetailResponse = detail) => {
    vi.resetAllMocks();
    serviceMock.getWorkorderDetail.mockReturnValue(of(wo));
    serviceMock.getLaborHistory.mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [WorkorderLaborPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: WorkexecService, useValue: serviceMock },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ workorderId: WORKORDER_ID }) } } },
      ],
    }).compileComponents();

    // ADR-0035 §8: copy asserted against the shipped bundle.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(WorkorderLaborPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  afterEach(() => fixture?.destroy());

  const overline = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="wo-overline"]')?.textContent?.trim();

  it('shows the work order number in the overline, never the route UUID (issue #285)', async () => {
    await setup();

    expect(serviceMock.getWorkorderDetail).toHaveBeenCalledWith(WORKORDER_ID);
    expect(overline()).toBe(enUS.WORKEXEC.WORKORDER_COMMON.WO_OVERLINE.replace('{{id}}', 'WO-2026-1041'));
    expect((fixture.nativeElement as HTMLElement).textContent).not.toMatch(UUID);
  });

  it('falls back to the plain label when the number is absent, still without a UUID', async () => {
    await setup({ id: WORKORDER_ID, items: [] });

    expect(overline()).toBe(enUS.WORKEXEC.WORKORDER_COMMON.WORK_ORDER);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toMatch(UUID);
  });
});
