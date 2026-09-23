import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import enUS from '../../../../../assets/i18n/en-US.json';
import { TechnicianAssignmentResponse, WorkorderDetailResponse, WorkorderResponse } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { WorkorderAssignPageComponent } from './workorder-assign-page.component';

const WORKORDER_ID = '01a0a459-65b0-7609-b8a2-58332d3af186';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** No shop and no technician: the page reaches 'ready' from the work order read alone. */
const workorder: WorkorderResponse = { id: WORKORDER_ID };
const detail: WorkorderDetailResponse = { id: WORKORDER_ID, workorderNumber: 'WO-2026-1041' };
const TECH_ID = '01a0a459-65b0-7609-b8a2-58332d3af195';
/** Everything the audit's uuid-on-screen rule reads: text, input values and picker option values. */
const visibleText = (el: HTMLElement): string => [
  el.textContent ?? '',
  ...Array.from(el.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden])')).map(i => (i as HTMLInputElement).value),
  ...Array.from(el.querySelectorAll('option')).map(o => o.value),
].join(' ');


const serviceMock = {
  getWorkorderById: vi.fn(),
  getWorkorderDetail: vi.fn(),
  listTechniciansForLocation: vi.fn(),
  getTechnicianAssignment: vi.fn(),
};

describe('WorkorderAssignPageComponent', () => {
  let fixture: ComponentFixture<WorkorderAssignPageComponent>;
  let component: WorkorderAssignPageComponent;

  const setup = async (
    detail$: Observable<WorkorderDetailResponse> = of(detail),
    wo: WorkorderResponse = workorder,
    assignment: TechnicianAssignmentResponse | null = null,
  ) => {
    vi.resetAllMocks();
    serviceMock.getWorkorderById.mockReturnValue(of(wo));
    serviceMock.getWorkorderDetail.mockReturnValue(detail$);
    serviceMock.listTechniciansForLocation.mockReturnValue(of([]));
    serviceMock.getTechnicianAssignment.mockReturnValue(of(assignment));

    await TestBed.configureTestingModule({
      imports: [WorkorderAssignPageComponent, TranslateModule.forRoot()],
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

    fixture = TestBed.createComponent(WorkorderAssignPageComponent);
    component = fixture.componentInstance;
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
    expect(visibleText(fixture.nativeElement as HTMLElement)).not.toMatch(UUID);
  });

  it('never falls back to the technician id when the assignment has no name', async () => {
    await setup(of(detail), { ...workorder, primaryTechnicianId: TECH_ID }, { workorderId: WORKORDER_ID, technicianId: TECH_ID });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="current-technician"]')?.textContent?.trim()).toBe(enUS.COMMON.NOT_AVAILABLE);
    expect(visibleText(el)).not.toMatch(UUID);
  });

  it('keeps the page usable and falls back to the plain label when the number read fails', async () => {
    await setup(throwError(() => new Error('boom')));

    expect(component.pageState()).toBe('ready');
    expect(overline()).toBe(enUS.WORKEXEC.WORKORDER_COMMON.WORK_ORDER);
    expect(visibleText(fixture.nativeElement as HTMLElement)).not.toMatch(UUID);
  });
});
