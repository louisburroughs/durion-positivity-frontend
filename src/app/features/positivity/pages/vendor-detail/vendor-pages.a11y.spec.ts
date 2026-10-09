import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import axe from 'axe-core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { VENDOR_ROUTES } from '../../vendors.routes';
import {
  VENDOR_ID,
  VendorAuthStub,
  change,
  profileServiceMock,
  vendor,
  vendorPage,
  vendorProviders,
  vendorServiceMock,
} from '../../vendors.spec-helper';

/**
 * Genuine axe coverage of the RENDERED vendor pages (§5.7, §9.6, AC 12) in both
 * themes, with the real en-US copy. `scripts/a11y/smoke-routes.mjs` scans
 * `/app/positivity/vendors` too, but only sees the un-hydrated shell.
 */
async function seriousViolations(root: HTMLElement): Promise<{ id: string; targets: string[] }[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target.join(' ')) }));
}

const THEMES = ['light', 'dark'] as const;

describe('Vendor pages a11y (rendered DOM)', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.querySelectorAll('[data-a11y-host]').forEach(node => node.remove());
  });

  async function render(url: string): Promise<{ harness: RouterTestingHarness; host: HTMLElement }> {
    // The stub signs in as clerk.b, who requested the pending change: the self-approval state renders (review B8).
    const service = vendorServiceMock(vendor(), [change({ requestedBy: 'clerk.b' })]);
    service.listVendors.mockReturnValue(of(vendorPage([vendor(), vendor({ vendorId: 'v-2', vendorNumber: 'V-000124', status: 'INACTIVE' })])));
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([{ path: 'app/positivity/vendors', children: VENDOR_ROUTES }]),
        ...vendorProviders(service, new VendorAuthStub(), profileServiceMock()),
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    const host = harness.fixture.nativeElement as HTMLElement;
    host.setAttribute('data-a11y-host', '');
    document.body.appendChild(host);
    await harness.fixture.whenStable();
    harness.detectChanges();
    return { harness, host };
  }

  for (const theme of THEMES) {
    it(`list: no serious violation, one h1, real labels (${theme} theme)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const { host } = await render('/app/positivity/vendors');

      expect(host.querySelectorAll('h1').length).toBe(1);
      expect(host.querySelector('[data-testid="vendor-table"]')).not.toBeNull();
      expect(await seriousViolations(host)).toEqual([]);
    });

    it(`create: no serious violation with a tax registration row (${theme} theme)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const { harness, host } = await render('/app/positivity/vendors/new');
      (host.querySelector('[data-testid="vendor-tax-add"]') as HTMLButtonElement).click();
      harness.detectChanges();

      expect(host.querySelector('[data-testid="vendor-create-form"]')).not.toBeNull();
      for (const input of host.querySelectorAll('input:not([type="radio"]), textarea')) {
        expect(host.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
      }
      expect(await seriousViolations(host)).toEqual([]);
    });

    it(`detail: no serious violation with a pending change and the self-approval hint (${theme} theme)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const { host } = await render(`/app/positivity/vendors/${VENDOR_ID}`);

      expect(host.querySelector('[data-testid="remit-pending"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="remit-approve-blocked"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="remit-approve"]')?.getAttribute('aria-disabled')).toBe('true');
      expect(await seriousViolations(host)).toEqual([]);
    });

    it(`detail: no serious violation in the remit-to change dialog (${theme} theme)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const { harness, host } = await render(`/app/positivity/vendors/${VENDOR_ID}`);
      (host.querySelector('[data-testid="remit-reject"]') as HTMLButtonElement).click();
      harness.detectChanges();
      await harness.fixture.whenStable();

      expect(host.querySelector('dialog')?.matches(':modal')).toBe(true);
      expect(await seriousViolations(host)).toEqual([]);
    });
  }

  for (const theme of THEMES) {
    it(`detail: no serious violation in the status dialog (${theme} theme)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const { harness, host } = await render(`/app/positivity/vendors/${VENDOR_ID}`);
      (host.querySelector('[data-testid="vendor-status-action"]') as HTMLButtonElement).click();
      harness.detectChanges();
      await harness.fixture.whenStable();

      expect(host.querySelector('[data-testid="vendor-status-dialog"]')?.matches(':modal')).toBe(true);
      expect(await seriousViolations(host)).toEqual([]);
    });

    it(`detail: no serious violation in the reveal dialog showing a number (${theme} theme)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const { harness, host } = await render(`/app/positivity/vendors/${VENDOR_ID}`);
      (host.querySelector('[data-testid="vendor-tax-reveal"]') as HTMLButtonElement).click();
      harness.detectChanges();
      const reason = host.querySelector('[data-testid="vendor-tax-reveal-reason"]') as HTMLInputElement;
      reason.value = 'Checking the W-9 form';
      reason.dispatchEvent(new Event('input'));
      harness.detectChanges();
      (host.querySelector('[data-testid="vendor-tax-reveal-confirm"]') as HTMLButtonElement).click();
      harness.detectChanges();
      await harness.fixture.whenStable();

      expect(host.querySelector('[data-testid="vendor-tax-revealed-number"]')).not.toBeNull();
      expect(await seriousViolations(host)).toEqual([]);
    });
  }

  it('controls are at least 44px tall (§5.7)', async () => {
    const { host } = await render(`/app/positivity/vendors/${VENDOR_ID}`);
    const controls = [...host.querySelectorAll<HTMLElement>('.vendor-btn')];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  });
});
