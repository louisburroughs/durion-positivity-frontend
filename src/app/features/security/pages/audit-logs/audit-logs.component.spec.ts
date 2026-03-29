import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AuditLogsComponent } from './audit-logs.component';
import { SecurityAuditService } from '../../services/security-audit.service';

const mockAuditService = {
  searchAuditEvents: vi.fn(),
  requestAuditExport: vi.fn(),
};

describe('AuditLogsComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AuditLogsComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SecurityAuditService, useValue: mockAuditService },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AuditLogsComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should start in idle state', () => {
    const fixture = TestBed.createComponent(AuditLogsComponent);
    expect(fixture.componentInstance.state()).toBe('idle');
  });

  it('should transition to ready after successful search', () => {
    mockAuditService.searchAuditEvents.mockReturnValue(of({ items: [{ eventId: 'ev1' }], nextPageToken: null }));
    const fixture = TestBed.createComponent(AuditLogsComponent);
    const component = fixture.componentInstance;

    component.search();

    expect(component.state()).toBe('ready');
    expect(component.events()).toHaveLength(1);
  });

  it('should transition to empty when no events returned', () => {
    mockAuditService.searchAuditEvents.mockReturnValue(of({ items: [], nextPageToken: null }));
    const fixture = TestBed.createComponent(AuditLogsComponent);
    const component = fixture.componentInstance;

    component.search();

    expect(component.state()).toBe('empty');
  });

  it('should set error state before errorKey on search failure', () => {
    mockAuditService.searchAuditEvents.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(AuditLogsComponent);
    const component = fixture.componentInstance;
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

    component.search();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
  });

  it('should set error state before errorKey on export failure', () => {
    mockAuditService.requestAuditExport.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(AuditLogsComponent);
    const component = fixture.componentInstance;
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

    component.requestExport();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
  });
});
