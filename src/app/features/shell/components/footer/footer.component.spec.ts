import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('captures the current year at construction', () => {
    expect(fixture.componentInstance.year).toBe(new Date().getFullYear());
  });

  it('renders the copyright line with the interpolated year', () => {
    const span: HTMLElement = fixture.nativeElement.querySelector('span');
    expect(span.textContent).toContain(`© ${new Date().getFullYear()} Durion Support Services. All rights reserved.`);
  });

  it('renders a sitemap link with routerLink to /app/sitemap', () => {
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.shell-footer__link');
    expect(link.getAttribute('href')).toBe('/app/sitemap');
    expect(link.textContent?.trim()).toBe('Site Map');
  });

  it('marks the footer with role="contentinfo" for landmark navigation', () => {
    const footer: HTMLElement = fixture.nativeElement.querySelector('footer');
    expect(footer.getAttribute('role')).toBe('contentinfo');
  });
});
