import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { InventoryLandingPageComponent } from './inventory-landing-page.component';
import { INVENTORY_LANDING_CONFIG } from './inventory-landing.config';

describe('InventoryLandingPageComponent', () => {
  let fixture: ComponentFixture<InventoryLandingPageComponent>;
  let component: InventoryLandingPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(InventoryLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('exposes the inventory landing config', () => {
    expect(component.config).toBe(INVENTORY_LANDING_CONFIG);
    expect(component.config.titleKey).toBe('INVENTORY.LANDING.TITLE');
  });

  it('renders the fulfillment section as a plain id input (idMode)', () => {
    const fulfillment = component.config.sections.find(
      (section) => section.titleKey === 'INVENTORY.LANDING.SECTION.FULFILLMENT.TITLE',
    );

    expect(fulfillment).toBeDefined();
    expect(fulfillment?.recordKind).toBe('workorder');
    expect(fulfillment?.idMode).toBe(true);
  });
});
