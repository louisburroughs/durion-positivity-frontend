import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { MechanicRosterPageComponent } from './mechanic-roster-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { ApiBaseService } from '../../../../core/services/api-base.service';

const stubApiService = {
  get: vi.fn().mockReturnValue(of([{ personId: 'p1', firstName: 'Alex' }])),
  post: vi.fn().mockReturnValue(of({ personId: 'p2' })),
};

describe('MechanicRosterPageComponent [CAP-138]', () => {
  let fixture: ComponentFixture<MechanicRosterPageComponent>;
  let component: MechanicRosterPageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubApiService.get.mockReturnValue(of([{ personId: 'p1', firstName: 'Alex' }]));
    stubApiService.post.mockReturnValue(of({ personId: 'p2' }));

    await TestBed.configureTestingModule({
      imports: [MechanicRosterPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ApiBaseService, useValue: stubApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicRosterPageComponent);
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

  it('calls getAllPeople on init', async () => {
    await setup();
    expect(stubApiService.get).toHaveBeenCalledTimes(1);
  });

  it('renders .roster-row for each person', async () => {
    await setup();
    component.people.set([{ personId: 'p1' }, { personId: 'p2' }]);
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('.roster-row'));
    expect(rows.length).toBe(2);
  });

  it('opens .create-modal-overlay when clicked', async () => {
    await setup();
    const button = fixture.debugElement.query(By.css('.open-create-btn'));
    button.nativeElement.click();
    fixture.detectChanges();

    const modal = fixture.debugElement.query(By.css('.create-modal-overlay'));
    expect(modal).toBeTruthy();
  });

  it('calls createEmployee on submit', async () => {
    await setup();
    component.openCreateModal();
    component.createForm.setValue({
      firstName: 'Robin',
      lastName: 'Lane',
      email: 'robin@example.com',
      role: 'MECHANIC',
    });
    fixture.detectChanges();

    const submit = fixture.debugElement.query(By.css('.submit-create-btn'));
    submit.nativeElement.click();

    expect(stubApiService.post).toHaveBeenCalledWith(
      expect.any(String),
      {
        firstName: 'Robin',
        lastName: 'Lane',
        email: 'robin@example.com',
        role: 'MECHANIC',
      },
    );
  });
});
