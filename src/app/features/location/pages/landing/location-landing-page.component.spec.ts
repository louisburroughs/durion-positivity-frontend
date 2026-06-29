import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocationLandingPageComponent } from './location-landing-page.component';

describe('LocationLandingPageComponent', () => {
  let component: LocationLandingPageComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LocationLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    });
    component = TestBed.createComponent(LocationLandingPageComponent).componentInstance;
  });

  it('is created', () => {
    expect(component).toBeTruthy();
  });

  it('supplies the location landing config', () => {
    expect(component.config.titleKey).toBe('LOCATION.LANDING.TITLE');
    expect(component.config.sections.length).toBe(3);
  });

  it('gates the Locations section on a location record with guided cards', () => {
    const locations = component.config.sections[0];
    expect(locations.recordKind).toBe('location');
    expect(locations.cards.some(c => c.kind === 'guided')).toBe(true);
  });
});
