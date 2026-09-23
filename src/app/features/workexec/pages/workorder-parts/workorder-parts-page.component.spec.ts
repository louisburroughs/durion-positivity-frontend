import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import enUS from '../../../../../assets/i18n/en-US.json';
import { PartUsageResponse, SubstituteLinkResponse, WorkorderDetailResponse } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { WorkorderPartsPageComponent } from './workorder-parts-page.component';

const WORKORDER_ID = '01a0a459-65b0-7609-b8a2-58332d3af186';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const LINE_ID = '01a0a459-65b0-7609-b8a2-58332d3af190';
const detail: WorkorderDetailResponse = {
  id: WORKORDER_ID,
  workorderNumber: 'WO-2026-1041',
  items: [{ id: LINE_ID, workorderId: WORKORDER_ID, itemType: 'PART', description: 'Brake pad set' }],
};
const usage: PartUsageResponse[] = [{ id: '01a0a459-65b0-7609-b8a2-58332d3af191', partId: LINE_ID, quantityIssued: 2, issuedAt: '2026-09-20T10:00:00Z' }];
const substitutes: SubstituteLinkResponse[] = [
  { id: '01a0a459-65b0-7609-b8a2-58332d3af192', substitutePartId: '01a0a459-65b0-7609-b8a2-58332d3af193', substituteType: 'EQUIVALENT', priority: 1 },
];
/** Everything the audit's uuid-on-screen rule reads: text, input values and picker option values. */
const visibleText = (el: HTMLElement): string => [
  el.textContent ?? '',
  ...Array.from(el.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden])')).map(i => (i as HTMLInputElement).value),
  ...Array.from(el.querySelectorAll('option')).map(o => o.value),
].join(' ');


const serviceMock = {
  getWorkorderDetail: vi.fn(),
  getUsageHistory: vi.fn(),
  suggestSubstitutes: vi.fn(),
};

describe('WorkorderPartsPageComponent', () => {
  let fixture: ComponentFixture<WorkorderPartsPageComponent>;

  const setup = async (wo: WorkorderDetailResponse = detail) => {
    vi.resetAllMocks();
    serviceMock.getWorkorderDetail.mockReturnValue(of(wo));
    serviceMock.getUsageHistory.mockReturnValue(of(usage));
    serviceMock.suggestSubstitutes.mockReturnValue(of(substitutes));

    await TestBed.configureTestingModule({
      imports: [WorkorderPartsPageComponent, TranslateModule.forRoot()],
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

    fixture = TestBed.createComponent(WorkorderPartsPageComponent);
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

  it('shows the part line description in usage history, not the part id', async () => {
    await setup();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="usage-part"]')?.textContent?.trim()).toBe('Brake pad set');
    expect(visibleText(el)).not.toMatch(UUID);
  });

  it('labels substitute options by position and the source part by description', async () => {
    await setup();
    fixture.componentInstance.openSubstPanel(LINE_ID);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const parts = enUS.WORKEXEC.WORKORDER_PARTS;

    expect(el.textContent).toContain(parts.SUBST_PART.replace('{{name}}', 'Brake pad set'));
    expect(el.textContent).toContain(parts.SUBST_OPTION.replace('{{n}}', '1'));
    expect(visibleText(el)).not.toMatch(UUID);
  });

  it('shows the part description instead of prefilling an id input when an action opens from a row', async () => {
    await setup();
    fixture.componentInstance.openAction('issue', LINE_ID);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="action-part-label"]')?.textContent?.trim()).toBe('Brake pad set');
    expect(el.querySelector('#action-part-id')).toBeNull();
    expect(visibleText(el)).not.toMatch(UUID);
  });

  it('falls back to the plain label when the number is absent, still without a UUID', async () => {
    await setup({ id: WORKORDER_ID, items: [] });

    expect(overline()).toBe(enUS.WORKEXEC.WORKORDER_COMMON.WORK_ORDER);
    expect(visibleText(fixture.nativeElement as HTMLElement)).not.toMatch(UUID);
  });
});
