import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { ContentPanelComponent } from './content-panel.component';

@Component({ selector: 'app-stub-page', standalone: true, template: '<p>stub page content</p>' })
class StubPageComponent {}

describe('ContentPanelComponent', () => {
  let fixture: ComponentFixture<ContentPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentPanelComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([{ path: 'stub', component: StubPageComponent }]),
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(ContentPanelComponent);
  });

  it('creates the component', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('applies the translated aria-label to the content section', () => {
    fixture.detectChanges();
    const section: HTMLElement = fixture.nativeElement.querySelector('.content-panel');
    expect(section.getAttribute('aria-label')).toBe('Main content area');
  });

  it('renders a routed component through its router-outlet', async () => {
    fixture.detectChanges();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/stub');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('stub page content');
  });
});
