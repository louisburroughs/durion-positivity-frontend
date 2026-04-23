import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ProductLandingPageComponent } from './product-landing-page.component';
import { BulkImportService } from '../../../bulk-import/services/bulk-import.service';

describe('ProductLandingPageComponent', () => {
  let component: ProductLandingPageComponent;
  let fixture: ComponentFixture<ProductLandingPageComponent>;
  const bulkImportService = {
    getActiveJobDomains: vi.fn(),
  };

  beforeEach(async () => {
    bulkImportService.getActiveJobDomains.mockReturnValue(of(new Set()));

    await TestBed.configureTestingModule({
      imports: [ProductLandingPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BulkImportService, useValue: bulkImportService },
      ],
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

  it('fetches and renders active import indicators for product import cards', () => {
    bulkImportService.getActiveJobDomains.mockReturnValue(of(new Set(['CATALOG', 'PRICE'])));
    fixture = TestBed.createComponent(ProductLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const activeIndicators = fixture.debugElement.queryAll(By.css('.product-card__active-import'));

    expect(bulkImportService.getActiveJobDomains).toHaveBeenCalled();
    expect(activeIndicators).toHaveLength(2);
  });
});
