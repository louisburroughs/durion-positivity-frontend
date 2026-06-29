import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrmService } from '../../services/crm.service';
import { CrmLandingPageComponent } from './crm-landing-page.component';

describe('CrmLandingPageComponent', () => {
  let component: CrmLandingPageComponent;
  const crmService = {
    searchParties: vi.fn().mockReturnValue(
      of({ parties: [{ partyId: 'P-1', legalName: 'Acme Co', customerNumber: '42', status: 'ACTIVE' }] }),
    ),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [CrmLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: CrmService, useValue: crmService }],
    });
    component = TestBed.createComponent(CrmLandingPageComponent).componentInstance;
  });

  it('supplies the crm landing config with a customer-resolved party section', () => {
    expect(component.config.titleKey).toBe('CRM.LANDING.TITLE');
    const partySection = component.config.sections.find(s => s.titleKey === 'CRM.LANDING.SECTION.PARTY.TITLE');
    expect(partySection?.recordKind).toBe('customer');
  });

  it('adapts party search results into finder hits', () => {
    expect(component.searchFns.customer).toBeDefined();
    let hits: ReadonlyArray<{ id: string; primary: string; secondary?: string }> = [];
    component.searchFns.customer!('acme').subscribe(r => (hits = r));
    expect(crmService.searchParties).toHaveBeenCalledWith('acme');
    expect(hits[0]).toEqual({ id: 'P-1', primary: 'Acme Co', secondary: '#42', tertiary: 'ACTIVE' });
  });
});
