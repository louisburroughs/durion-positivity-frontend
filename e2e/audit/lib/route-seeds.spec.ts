import { describe, expect, it } from 'vitest';
import { APP_SEEDS, PARAM_TEMPLATES, PUBLIC_SEEDS } from './route-seeds';

/**
 * Seeds must track the live route table. A stale seed is not a harmless miss:
 * the crawler visits it, the app answers 404, and the audit reports a broken
 * page the frontend does not own (#201).
 */
describe('route seeds', () => {
  it('seeds identity compliance under People, where the route now lives', () => {
    expect(APP_SEEDS).toContain('/app/people/identity-compliance');
    expect(APP_SEEDS).not.toContain('/app/security/identity-compliance');
  });

  it('seeds the screens added since the last seed refresh', () => {
    for (const seed of [
      '/app/sitemap',
      '/app/accounting/payables/vendor-invoices',
      '/app/accounting/payables/vendor-invoices/exceptions',
      '/app/product/catalog/enrichment/unmatched',
      '/app/shopmgmt/shop-dashboard',
      '/app/positivity',
      '/app/positivity/exchanges',
      '/app/positivity/manual-review',
      '/app/platform/tenants',
      '/app/platform/tenants/new',
    ]) {
      expect(APP_SEEDS).toContain(seed);
    }
    const templates = PARAM_TEMPLATES.map(t => t.template);
    expect(templates).toContain('/app/accounting/payables/vendor-invoices/:billId');
    expect(templates).toContain('/app/workexec/workorders/:workorderId/change-requests');
  });

  it('has no duplicate seeds', () => {
    const all = [...PUBLIC_SEEDS, ...APP_SEEDS];
    expect(new Set(all).size).toBe(all.length);
  });

  it('every template placeholder names at least one service-scoped source field', () => {
    for (const { template, params } of PARAM_TEMPLATES) {
      for (const [param, fields] of Object.entries(params)) {
        expect(template, `${template} declares :${param}`).toContain(`:${param}`);
        expect(fields.length, `${template} :${param} has candidates`).toBeGreaterThan(0);
        for (const field of fields) {
          expect(field, `${template} :${param} → ${field} is scoped`).toMatch(/^[A-Za-z]+@[a-z-]+$/);
        }
      }
    }
  });
});
