import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ProductLandingPageComponent } from './product-landing-page.component';

describe('ProductLandingPageComponent', () => {
  let component: ProductLandingPageComponent;
  let fixture: ComponentFixture<ProductLandingPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('has the expected direct link count', () => {
    expect(component.directLinkCount).toBe(8);
  });

  it('contains the DATA_IMPORT section', () => {
    const dataImport = component.sections.find(
      section => section.titleKey === 'PRODUCT.LANDING.SECTION.DATA_IMPORT.TITLE',
    );

    expect(dataImport).toBeDefined();
  });

  it('has no guided launch cards', () => {
    expect(component.guidedLinkCount).toBe(0);
  });
});
