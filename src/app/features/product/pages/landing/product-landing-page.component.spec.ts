import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProductLandingPageComponent } from './product-landing-page.component';

describe('ProductLandingPageComponent', () => {
  let component: ProductLandingPageComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProductLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    });
    component = TestBed.createComponent(ProductLandingPageComponent).componentInstance;
  });

  it('supplies the product landing config (all direct links)', () => {
    expect(component.config.titleKey).toBe('PRODUCT.LANDING.TITLE');
    const cards = component.config.sections.flatMap(s => s.cards);
    expect(cards.every(c => c.kind === 'direct')).toBe(true);
    expect(component.config.sections.some(s => s.recordKind)).toBe(false);
  });
});
