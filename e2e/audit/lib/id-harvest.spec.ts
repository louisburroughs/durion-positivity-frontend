import { describe, expect, it } from 'vitest';
import {
  apiService,
  collectResponseIds,
  fillTemplates,
  templateFields,
  type IdHarvest,
  type ParamRouteTemplate,
} from './id-harvest';
import { PARAM_TEMPLATES } from './route-seeds';

const ACCOUNTING_INVOICE = '11111111-1111-4111-8111-111111111111';
const BILLING_INVOICE = '22222222-2222-4222-8222-222222222222';
const INVENTORY_LOCATION = '33333333-3333-4333-8333-333333333333';
const LOCATION_LOCATION = '44444444-4444-4444-8444-444444444444';
const CATALOG_PRODUCT = '55555555-5555-4555-8555-555555555555';
const OTHER_PRODUCT = '66666666-6666-4666-8666-666666666666';
const WORKORDER = '77777777-7777-4777-8777-777777777777';
const INVOICE_WORKORDER = '88888888-8888-4888-8888-888888888888';

const fields = new Set([
  'invoiceId@accounting',
  'invoiceId@invoice',
  'locationId@inventory',
  'locationId@location',
  'id@location',
  'productId@catalog',
  'productId@order',
  'workorderId@workorder',
  'workorderId@invoice',
]);

describe('apiService', () => {
  it('returns the first path segment after /api/', () => {
    expect(apiService('https://durionpos.org/api/accounting/v1/events')).toBe('accounting');
    expect(apiService('https://durionpos.org/api/shop-manager/v1/appointments/x')).toBe('shop-manager');
  });

  it('returns an empty service for URLs without an /api/ segment', () => {
    expect(apiService('https://durionpos.org/assets/i18n/en-US.json')).toBe('');
    expect(apiService('not a url')).toBe('');
  });
});

describe('collectResponseIds', () => {
  it('stores ids under their owning service, never under the bare field name', () => {
    const harvest: IdHarvest = new Map();
    collectResponseIds(
      { invoiceId: ACCOUNTING_INVOICE },
      'https://durionpos.org/api/accounting/v1/events',
      fields,
      harvest,
    );
    collectResponseIds(
      { invoiceId: BILLING_INVOICE },
      'https://durionpos.org/api/invoice/v1/invoices',
      fields,
      harvest,
    );

    expect([...harvest.get('invoiceId@accounting')!]).toEqual([ACCOUNTING_INVOICE]);
    expect([...harvest.get('invoiceId@invoice')!]).toEqual([BILLING_INVOICE]);
    expect(harvest.has('invoiceId')).toBe(false);
  });

  it('keeps locationId, productId and workorderId apart by service', () => {
    const harvest: IdHarvest = new Map();
    collectResponseIds(
      { items: [{ locationId: INVENTORY_LOCATION }] },
      'https://durionpos.org/api/inventory/v1/inventory/locations',
      fields,
      harvest,
    );
    collectResponseIds(
      { locationId: LOCATION_LOCATION, id: LOCATION_LOCATION },
      'https://durionpos.org/api/location/v1/locations',
      fields,
      harvest,
    );
    collectResponseIds(
      { productId: CATALOG_PRODUCT },
      'https://durionpos.org/api/catalog/v1/products',
      fields,
      harvest,
    );
    collectResponseIds(
      { lines: [{ productId: OTHER_PRODUCT }] },
      'https://durionpos.org/api/order/v1/orders',
      fields,
      harvest,
    );
    collectResponseIds(
      { workorderId: WORKORDER },
      'https://durionpos.org/api/workorder/v1/workorders',
      fields,
      harvest,
    );
    collectResponseIds(
      { workorderId: INVOICE_WORKORDER },
      'https://durionpos.org/api/invoice/v1/invoices',
      fields,
      harvest,
    );

    expect([...harvest.get('locationId@inventory')!]).toEqual([INVENTORY_LOCATION]);
    expect([...harvest.get('locationId@location')!]).toEqual([LOCATION_LOCATION]);
    expect([...harvest.get('id@location')!]).toEqual([LOCATION_LOCATION]);
    expect([...harvest.get('productId@catalog')!]).toEqual([CATALOG_PRODUCT]);
    expect([...harvest.get('productId@order')!]).toEqual([OTHER_PRODUCT]);
    expect([...harvest.get('workorderId@workorder')!]).toEqual([WORKORDER]);
    expect([...harvest.get('workorderId@invoice')!]).toEqual([INVOICE_WORKORDER]);
    for (const bare of ['locationId', 'id', 'productId', 'workorderId']) {
      expect(harvest.has(bare), `bare ${bare} must not be harvested`).toBe(false);
    }
  });

  it('skips a response whose URL yields no service segment', () => {
    const harvest: IdHarvest = new Map();
    collectResponseIds({ invoiceId: BILLING_INVOICE }, 'https://durionpos.org/invoices', fields, harvest);
    expect(harvest.size).toBe(0);
  });

  it('ignores values that are not id-shaped', () => {
    const harvest: IdHarvest = new Map();
    collectResponseIds(
      { invoiceId: 'not an id at all!' },
      'https://durionpos.org/api/invoice/v1/invoices',
      fields,
      harvest,
    );
    expect(harvest.size).toBe(0);
  });
});

describe('fillTemplates with service-scoped candidates', () => {
  const byTemplate = new Map(PARAM_TEMPLATES.map(t => [t.template, t]));
  const pick = (template: string): ParamRouteTemplate => {
    const found = byTemplate.get(template);
    if (!found) throw new Error(`no template ${template}`);
    return found;
  };

  const harvestFrom = (responses: Array<[unknown, string]>): IdHarvest => {
    const harvest: IdHarvest = new Map();
    const allowed = templateFields(PARAM_TEMPLATES);
    for (const [json, url] of responses) collectResponseIds(json, url, allowed, harvest);
    return harvest;
  };

  it('does not fill a billing invoice template from an accounting invoiceId', () => {
    const harvest = harvestFrom([
      [{ invoiceId: ACCOUNTING_INVOICE }, 'https://durionpos.org/api/accounting/v1/events'],
    ]);
    const fresh = fillTemplates([pick('/app/billing/invoices/:invoiceId')], harvest, 5, new Map());
    expect(fresh).toEqual([]);
  });

  it('fills a billing invoice template from an invoice-service invoiceId', () => {
    const harvest = harvestFrom([
      [{ invoiceId: BILLING_INVOICE }, 'https://durionpos.org/api/invoice/v1/invoices'],
    ]);
    const fresh = fillTemplates([pick('/app/billing/invoices/:invoiceId')], harvest, 5, new Map());
    expect(fresh).toEqual([`/app/billing/invoices/${BILLING_INVOICE}`]);
  });

  it('does not fill a Location edit template from an inventory locationId', () => {
    const harvest = harvestFrom([
      [{ locationId: INVENTORY_LOCATION }, 'https://durionpos.org/api/inventory/v1/inventory/locations'],
    ]);
    const fresh = fillTemplates(
      [pick('/app/location/locations/:id'), pick('/app/location/locations/:locationId/defaults')],
      harvest,
      5,
      new Map(),
    );
    expect(fresh).toEqual([]);
  });

  it('fills workorder and fulfillment templates from a workorder-service id', () => {
    const harvest = harvestFrom([
      [{ items: [{ workorderId: WORKORDER }] }, 'https://durionpos.org/api/workorder/v1/workorders'],
    ]);
    const fresh = fillTemplates(
      [
        pick('/app/workexec/workorders/:workorderId'),
        pick('/app/inventory/fulfillment/workorders/:workorderId/pick-list'),
      ],
      harvest,
      5,
      new Map(),
    );
    expect(fresh).toEqual([
      `/app/workexec/workorders/${WORKORDER}`,
      `/app/inventory/fulfillment/workorders/${WORKORDER}/pick-list`,
    ]);
  });

  it('does not fill workorder templates from a workorderId seen on another service', () => {
    const harvest = harvestFrom([
      [{ workorderId: INVOICE_WORKORDER }, 'https://durionpos.org/api/invoice/v1/invoices'],
    ]);
    const fresh = fillTemplates([pick('/app/workexec/workorders/:workorderId')], harvest, 5, new Map());
    expect(fresh).toEqual([]);
  });
});
