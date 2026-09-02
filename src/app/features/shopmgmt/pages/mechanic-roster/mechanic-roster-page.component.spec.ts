import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import {
  MechanicRosterEntryResponseStatusEnum,
  type PagedModelMechanicRosterEntryResponse,
} from '@durion-sdk/shop-manager';
import { Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShopmgmtRosterService } from '../../services/shopmgmt-roster.service';
import { MechanicRosterPageComponent } from './mechanic-roster-page.component';

const readyPage: PagedModelMechanicRosterEntryResponse = {
  content: [
    {
      mechanicId: 'mechanic-1',
      personId: 'person-1',
      firstName: 'Alex',
      lastName: 'Smith',
      status: MechanicRosterEntryResponseStatusEnum.Active,
      skills: ['BRAKES', 'ALIGNMENT'],
      lastSyncedAt: '2026-08-31T14:30:00Z',
    },
  ],
  page: { number: 0, size: 20, totalElements: 21, totalPages: 2 },
};

const rosterServiceStub = {
  listMechanics: vi.fn(),
};

describe('MechanicRosterPageComponent [CAP-138]', () => {
  let fixture: ComponentFixture<MechanicRosterPageComponent>;
  let component: MechanicRosterPageComponent;

  const setup = async (
    response$: Observable<PagedModelMechanicRosterEntryResponse> = of(readyPage),
  ) => {
    rosterServiceStub.listMechanics.mockReturnValue(response$);

    await TestBed.configureTestingModule({
      imports: [MechanicRosterPageComponent, TranslateModule.forRoot()],
      providers: [{ provide: ShopmgmtRosterService, useValue: rosterServiceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicRosterPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('loads the first ACTIVE page with the default page size', async () => {
    await setup();

    expect(rosterServiceStub.listMechanics).toHaveBeenCalledWith({
      status: MechanicRosterEntryResponseStatusEnum.Active,
      page: 0,
      size: 20,
    });
    expect(component.state()).toBe('ready');
    expect(component.mechanics()).toEqual(readyPage.content);
    expect(component.page()).toBe(0);
    expect(component.totalPages()).toBe(2);
    expect(component.totalElements()).toBe(21);
  });

  it('shows loading while the current request is pending', async () => {
    const response$ = new Subject<PagedModelMechanicRosterEntryResponse>();
    await setup(response$);

    expect(component.state()).toBe('loading');
    expect(fixture.debugElement.query(By.css('[data-testid="roster-loading"]'))).toBeTruthy();
  });

  it('treats absent or malformed content as an empty ready page', async () => {
    await setup(of({ content: undefined, page: undefined }));

    expect(component.state()).toBe('ready');
    expect(component.mechanics()).toEqual([]);
    expect(component.totalPages()).toBe(0);
    expect(component.totalElements()).toBe(0);
    expect(fixture.debugElement.query(By.css('[data-testid="roster-empty"]'))).toBeTruthy();
  });

  it('shows a retryable translated error state when loading fails', async () => {
    await setup(throwError(() => new Error('network failure')));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('SHOPMGMT.MECHANIC_ROSTER.ERROR.LOAD_MECHANICS');
    expect(fixture.debugElement.query(By.css('[data-testid="roster-error"]'))).toBeTruthy();
    const retryButton = fixture.debugElement.query(By.css('[data-testid="roster-retry"]'));
    expect(retryButton.attributes['aria-label']).toBe('SHOPMGMT.MECHANIC_ROSTER.RETRY');
    expect(retryButton.attributes['title']).toBe('SHOPMGMT.MECHANIC_ROSTER.RETRY');
  });

  it('retries the current query after an error', async () => {
    rosterServiceStub.listMechanics
      .mockReturnValueOnce(throwError(() => new Error('network failure')))
      .mockReturnValueOnce(of(readyPage));
    await setup();

    component.retry();
    fixture.detectChanges();

    expect(rosterServiceStub.listMechanics).toHaveBeenCalledTimes(2);
    expect(rosterServiceStub.listMechanics).toHaveBeenLastCalledWith({
      status: MechanicRosterEntryResponseStatusEnum.Active,
      page: 0,
      size: 20,
    });
    expect(component.state()).toBe('ready');
  });

  it('resets to page zero when the status changes', async () => {
    await setup();
    component.nextPage();
    fixture.detectChanges();

    component.changeStatus(MechanicRosterEntryResponseStatusEnum.Inactive);
    fixture.detectChanges();

    expect(component.page()).toBe(0);
    expect(rosterServiceStub.listMechanics).toHaveBeenLastCalledWith({
      status: MechanicRosterEntryResponseStatusEnum.Inactive,
      page: 0,
      size: 20,
    });
  });

  it('enforces previous and next page boundaries', async () => {
    await setup();

    component.previousPage();
    fixture.detectChanges();
    expect(component.page()).toBe(0);
    expect(rosterServiceStub.listMechanics).toHaveBeenCalledTimes(1);

    component.nextPage();
    fixture.detectChanges();
    expect(component.page()).toBe(1);
    expect(rosterServiceStub.listMechanics).toHaveBeenCalledTimes(2);

    component.nextPage();
    fixture.detectChanges();
    expect(component.page()).toBe(1);
    expect(rosterServiceStub.listMechanics).toHaveBeenCalledTimes(2);

    component.previousPage();
    fixture.detectChanges();
    expect(component.page()).toBe(0);
    expect(rosterServiceStub.listMechanics).toHaveBeenCalledTimes(3);
  });

  it('renders mechanic names and skill codes from generated roster entries', async () => {
    await setup();

    const row = fixture.debugElement.query(By.css('[data-testid="mechanic-row"]'));
    expect(row.nativeElement.textContent).toContain('Alex Smith');
    expect(row.nativeElement.textContent).toContain('BRAKES');
    expect(row.nativeElement.textContent).toContain('ALIGNMENT');
  });

  it('cancels the previous request when a query input changes', async () => {
    const firstResponse$ = new Subject<PagedModelMechanicRosterEntryResponse>();
    const secondResponse$ = new Subject<PagedModelMechanicRosterEntryResponse>();
    rosterServiceStub.listMechanics
      .mockReturnValueOnce(firstResponse$)
      .mockReturnValueOnce(secondResponse$);
    await setup();

    expect(firstResponse$.observed).toBe(true);
    component.changeStatus(MechanicRosterEntryResponseStatusEnum.OnLeave);
    fixture.detectChanges();

    expect(firstResponse$.observed).toBe(false);
    expect(secondResponse$.observed).toBe(true);
    firstResponse$.next(readyPage);
    expect(component.mechanics()).toEqual([]);
  });

  it('cancels the current request when destroyed', async () => {
    const response$ = new Subject<PagedModelMechanicRosterEntryResponse>();
    await setup(response$);

    expect(response$.observed).toBe(true);
    fixture.destroy();
    expect(response$.observed).toBe(false);
  });

  it('does not expose person creation controls', async () => {
    await setup();

    expect(fixture.debugElement.query(By.css('.open-create-btn'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.create-modal-overlay'))).toBeNull();
    expect(fixture.debugElement.query(By.css('form'))).toBeNull();
  });
});
