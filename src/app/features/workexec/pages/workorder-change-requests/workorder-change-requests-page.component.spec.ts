import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import enUS from '../../../../../assets/i18n/en-US.json';
import { ChangeRequestResponse, WorkorderDetailResponse } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { WorkorderChangeRequestsPageComponent } from './workorder-change-requests-page.component';

const WORKORDER_ID = '01a0a459-65b0-7609-b8a2-58332d3af186';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const detail: WorkorderDetailResponse = { id: WORKORDER_ID, workorderNumber: 'WO-2026-1041' };
const requests: ChangeRequestResponse[] = [
  { id: '01a0a459-65b0-7609-b8a2-58332d3af194', workorderId: WORKORDER_ID, description: 'Add wiper blades', status: 'APPROVED', createdAt: '2026-09-20T10:00:00Z' },
];
/** Everything the audit's uuid-on-screen rule reads: text, input values and picker option values. */
const visibleText = (el: HTMLElement): string => [
  el.textContent ?? '',
  ...Array.from(el.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden])')).map(i => (i as HTMLInputElement).value),
  ...Array.from(el.querySelectorAll('option')).map(o => o.value),
].join(' ');


const serviceMock = {
  getChangeRequestsByWorkorder: vi.fn(),
  getWorkorderDetail: vi.fn(),
};

describe('WorkorderChangeRequestsPageComponent', () => {
  let fixture: ComponentFixture<WorkorderChangeRequestsPageComponent>;
  let component: WorkorderChangeRequestsPageComponent;

  const setup = async (detail$: Observable<WorkorderDetailResponse> = of(detail)) => {
    vi.resetAllMocks();
    serviceMock.getChangeRequestsByWorkorder.mockReturnValue(of(requests));
    serviceMock.getWorkorderDetail.mockReturnValue(detail$);

    await TestBed.configureTestingModule({
      imports: [WorkorderChangeRequestsPageComponent, TranslateModule.forRoot()],
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

    fixture = TestBed.createComponent(WorkorderChangeRequestsPageComponent);
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

  it('labels each request by position, not by its id', async () => {
    await setup();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.cr-id')?.textContent?.trim()).toBe(enUS.WORKEXEC.WORKORDER_CR.REQUEST_LABEL.replace('{{n}}', '1'));
    expect(el.textContent).toContain('Add wiper blades');
    expect(visibleText(el)).not.toMatch(UUID);
  });

  it('keeps the page usable and falls back to the plain label when the number read fails', async () => {
    await setup(throwError(() => new Error('boom')));

    expect(component.pageState()).toBe('ready');
    expect(overline()).toBe(enUS.WORKEXEC.WORKORDER_COMMON.WORK_ORDER);
    expect(visibleText(fixture.nativeElement as HTMLElement)).not.toMatch(UUID);
  });
});
