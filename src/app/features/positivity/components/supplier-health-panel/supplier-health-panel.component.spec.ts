/**
 * Health tab: the contract has no health/breaker endpoint, so this panel renders
 * an informational "not yet available" region and — critically — issues no
 * request. The negative assertion below is the point of the file: it is what
 * stops the guessed `/health` call from being reintroduced.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { SupplierHealthPanelComponent } from './supplier-health-panel.component';

const PROFILE_ID = 'profile-1';

describe('SupplierHealthPanelComponent', () => {
  let fixture: ComponentFixture<SupplierHealthPanelComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SupplierHealthPanelComponent, TranslateModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SupplierHealthPanelComponent);
    fixture.componentRef.setInput('vendorProfileId', PROFILE_ID);
    fixture.detectChanges();
  });

  it('renders the tab with a translated not-yet-available explanation', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('POSITIVITY.HEALTH.UNAVAILABLE');
    expect(text).toContain('POSITIVITY.HEALTH.UNAVAILABLE_DETAIL');
  });

  it('issues no supplier health request — no such endpoint exists', () => {
    http.expectNone(() => true);
    http.verify();
  });

  it('is an informational region, not an error state', () => {
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.pos-banner--error')).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('.pos-banner--info')).not.toBeNull();
  });

  it('exposes no breaker reset, trip, retry or refresh control', () => {
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('button')).toHaveLength(0);
  });

  it('keeps the panel reachable: it renders a heading inside the tabpanel', () => {
    const heading = (fixture.nativeElement as HTMLElement).querySelector('h2');

    expect(heading?.textContent?.trim()).toBe('POSITIVITY.HEALTH.TITLE');
  });
});
