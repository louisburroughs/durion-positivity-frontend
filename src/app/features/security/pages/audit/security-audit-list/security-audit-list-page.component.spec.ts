import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SecurityAuditListPageComponent } from './security-audit-list-page.component';
import { SecurityService } from '../../../services/security.service';

const stubSecurityService = {
  searchAudit: vi.fn(),
};

describe('SecurityAuditListPageComponent [CAP-141]', () => {
  let fixture: ComponentFixture<SecurityAuditListPageComponent>;
  let component: SecurityAuditListPageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubSecurityService.searchAudit.mockReturnValue(of([{ id: 'audit-1' }]));

    await TestBed.configureTestingModule({
      imports: [SecurityAuditListPageComponent],
      providers: [
        provideRouter([]),
        { provide: SecurityService, useValue: stubSecurityService },
        { provide: ActivatedRoute, useValue: { queryParams: of({ appointmentId: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SecurityAuditListPageComponent);
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

  it('calls searchAudit with appointmentId from query params', async () => {
    await setup();
    expect(stubSecurityService.searchAudit).toHaveBeenCalledWith('appt-1');
  });

  it('renders .audit-list', async () => {
    await setup();
    const list = fixture.debugElement.query(By.css('.audit-list'));
    expect(list).toBeTruthy();
  });

  it('renders .audit-entry for each entry', async () => {
    await setup();
    component.auditEntries.set([{ id: 'a' }, { id: 'b' }]);
    fixture.detectChanges();
    const entries = fixture.debugElement.queryAll(By.css('.audit-entry'));
    expect(entries.length).toBe(2);
  });

  it('shows .empty-state when no entries', async () => {
    await setup();
    component.auditEntries.set([]);
    component.loading.set(false);
    fixture.detectChanges();
    const empty = fixture.debugElement.query(By.css('.empty-state'));
    expect(empty).toBeTruthy();
  });

  it('sets selectedEntry on viewEntry', async () => {
    await setup();
    component.viewEntry({ id: 'entry-22' });
    expect(component.selectedEntry()).toEqual({ id: 'entry-22' });
  });

  it('shows .error-banner on load error', async () => {
    vi.clearAllMocks();
    stubSecurityService.searchAudit.mockReturnValue(throwError(() => new Error('boom')));

    await TestBed.configureTestingModule({
      imports: [SecurityAuditListPageComponent],
      providers: [
        provideRouter([]),
        { provide: SecurityService, useValue: stubSecurityService },
        { provide: ActivatedRoute, useValue: { queryParams: of({ appointmentId: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SecurityAuditListPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner).toBeTruthy();
  });
});
