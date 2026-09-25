import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import enUS from '../../../../../../assets/i18n/en-US.json';
import { ShortageResolutionPageComponent } from './shortage-resolution-page.component';

type Bundle = Record<string, unknown>;
const lookup = (bundle: Bundle, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);

// (issue #378) `ShortageController` requires allocationId, sku, shortQuantity,
// workorderLineId and siteId, none of which this page's route or any cheap existing
// read can supply, so it never calls the backend and always shows the notice below.
describe('ShortageResolutionPageComponent', () => {
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [ShortageResolutionPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');

    const fixture = TestBed.createComponent(ShortageResolutionPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('creates the component', async () => {
    const fixture = await setup();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the not-available notice (issue #378) instead of calling the backend', async () => {
    const fixture = await setup();
    const expectedText = lookup(enUS, 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.NOT_AVAILABLE');
    expect(expectedText).toBeTypeOf('string');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain(expectedText as string);
  });

  it('links back to the fulfillment landing page', async () => {
    const fixture = await setup();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[routerLink]');
    expect(link?.getAttribute('routerLink')).toBe('/app/inventory/fulfillment');
  });
});
