import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import enUS from '../../../../../assets/i18n/en-US.json';
import { PartyDetail } from '../../models/crm.models';
import { CrmService } from '../../services/crm.service';
import { CreateVehicleComponent } from './create-vehicle.component';

const PARTY_ID = '01a0a45a-3a50-702a-9e4d-20c91ddc3250';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const party: PartyDetail = { partyId: PARTY_ID, legalName: 'Northwind Logistics LLC' };

const crmServiceStub = {
  getParty: vi.fn(),
  createVehicleForParty: vi.fn(),
};

describe('CreateVehicleComponent', () => {
  let fixture: ComponentFixture<CreateVehicleComponent>;

  const setup = async (party$: Observable<PartyDetail> = of(party)) => {
    vi.resetAllMocks();
    crmServiceStub.getParty.mockReturnValue(party$);

    await TestBed.configureTestingModule({
      imports: [CreateVehicleComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: CrmService, useValue: crmServiceStub },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ partyId: PARTY_ID }) } } },
      ],
    }).compileComponents();

    // ADR-0035 §8: copy asserted against the shipped bundle.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(CreateVehicleComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  afterEach(() => fixture?.destroy());

  const subtitle = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="page-subtitle"]')?.textContent?.trim();
  const visibleText = () => {
    const el = fixture.nativeElement as HTMLElement;
    const inputValues = Array.from(el.querySelectorAll('input')).map(i => i.value).join(' ');
    return `${el.textContent} ${inputValues}`;
  };

  it('names the party in the subtitle, never the route UUID (issue #285)', async () => {
    await setup();

    expect(crmServiceStub.getParty).toHaveBeenCalledWith(PARTY_ID);
    expect(subtitle()).toBe(enUS.CRM.CREATE_VEHICLE.SUBTITLE_FOR.replace('{{name}}', party.legalName));
    expect(visibleText()).not.toMatch(UUID);
  });

  it('prefers the trading name when one is on file', async () => {
    await setup(of({ ...party, dba: 'Northwind' }));

    expect(subtitle()).toBe(enUS.CRM.CREATE_VEHICLE.SUBTITLE_FOR.replace('{{name}}', 'Northwind'));
  });

  it('falls back to the generic subtitle when the party read fails, still without a UUID', async () => {
    await setup(throwError(() => new Error('boom')));

    expect(subtitle()).toBe(enUS.CRM.CREATE_VEHICLE.SUBTITLE);
    expect(visibleText()).not.toMatch(UUID);
  });
});
