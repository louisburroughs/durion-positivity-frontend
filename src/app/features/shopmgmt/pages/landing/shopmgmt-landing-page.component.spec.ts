import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ShopmgmtLandingPageComponent } from './shopmgmt-landing-page.component';

describe('ShopmgmtLandingPageComponent', () => {
  let component: ShopmgmtLandingPageComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ShopmgmtLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    });
    component = TestBed.createComponent(ShopmgmtLandingPageComponent).componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('supplies the shopmgmt landing config', () => {
    expect(component.config.titleKey).toBe('SHOPMGMT.LANDING.TITLE');
  });

  it('gates the appointments section on an appointment record', () => {
    const appointments = component.config.sections.find(
      s => s.titleKey === 'SHOPMGMT.LANDING.SECTION.APPOINTMENTS.TITLE',
    );
    expect(appointments?.recordKind).toBe('appointment');
  });
});
