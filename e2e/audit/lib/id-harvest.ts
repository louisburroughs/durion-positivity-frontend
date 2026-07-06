import type { Page } from '@playwright/test';

/**
 * Passive entity-id harvesting.
 *
 * Most list pages navigate to detail routes via click handlers rather than
 * <a href>, so anchor-based discovery misses nearly every parameterized route
 * (/app/billing/invoices/:invoiceId, …). Instead of clicking (which would
 * break the crawl's read-only guarantee), we watch the JSON API responses the
 * pages already fetch, remember every id-like field value (invoiceId,
 * partyId, …), and use those real ids to fill route templates.
 *
 * No extra requests are made: this only observes traffic the app generates.
 */

const UUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_VALUE = /^\d{1,18}$/;
const PREFIXED_VALUE = /^[A-Za-z]{1,6}-[A-Za-z0-9]{1,20}$/; // WO-123, PO-9, APT-1234
/** Only fields that are unambiguously identifiers are harvested. */
const ID_FIELD_NAME = /(Id|Uuid)$/;

const MAX_BODY_BYTES = 2_000_000;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 25;
const MAX_VALUES_PER_FIELD = 50;

/** field name (e.g. "invoiceId") → distinct values seen in API responses. */
export type IdHarvest = Map<string, Set<string>>;

export interface ParamRouteTemplate {
  /** Route with :param placeholders, e.g. '/app/billing/invoices/:invoiceId'. */
  template: string;
  /** For each placeholder, the response field names that can supply it, in preference order. */
  params: Record<string, readonly string[]>;
}

export interface TemplateCoverage {
  template: string;
  /** Concrete instances generated (and queued) for this template. */
  instances: string[];
  /** Placeholders no API response provided a value for (template stayed unvisitable). */
  missingParams: string[];
}

export function attachIdHarvester(page: Page): IdHarvest {
  const harvest: IdHarvest = new Map();
  page.on('response', res => {
    const type = res.request().resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    if (res.status() !== 200) return;
    if (!res.url().includes('/api/')) return;
    res
      .text()
      .then(body => {
        if (!body || body.length > MAX_BODY_BYTES) return;
        let json: unknown;
        try {
          json = JSON.parse(body);
        } catch {
          return;
        }
        collect(json, harvest, 0);
      })
      // Bodies of responses that raced a navigation are gone; that's fine.
      .catch(() => undefined);
  });
  return harvest;
}

function collect(node: unknown, harvest: IdHarvest, depth: number): void {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0, MAX_ARRAY_ITEMS)) collect(item, harvest, depth + 1);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number') {
      if (!ID_FIELD_NAME.test(key)) continue;
      const str = String(value);
      if (str.length === 0 || str.length > 64) continue;
      if (UUID_VALUE.test(str) || NUMERIC_VALUE.test(str) || PREFIXED_VALUE.test(str)) {
        let values = harvest.get(key);
        if (!values) harvest.set(key, (values = new Set()));
        if (values.size < MAX_VALUES_PER_FIELD) values.add(str);
      }
    } else {
      collect(value, harvest, depth + 1);
    }
  }
}

/**
 * Fill templates with harvested ids. Idempotent across calls: `generated`
 * accumulates what each template has produced so far, and instances are
 * capped at `perTemplate`, so calling again after more harvesting only adds
 * paths for ids that are genuinely new.
 */
export function fillTemplates(
  templates: readonly ParamRouteTemplate[],
  harvest: IdHarvest,
  perTemplate: number,
  generated: Map<string, Set<string>>,
): string[] {
  const fresh: string[] = [];
  for (const { template, params } of templates) {
    let done = generated.get(template);
    if (!done) generated.set(template, (done = new Set()));

    // Values for each placeholder: first candidate field that has any.
    const valuesByParam = new Map<string, string[]>();
    for (const [param, fields] of Object.entries(params)) {
      const field = fields.find(f => (harvest.get(f)?.size ?? 0) > 0);
      valuesByParam.set(param, field ? [...harvest.get(field)!] : []);
    }
    if ([...valuesByParam.values()].some(v => v.length === 0)) continue;

    const count = Math.min(
      perTemplate,
      ...[...valuesByParam.values()].map(v => v.length),
    );
    for (let i = 0; i < count && done.size < perTemplate; i++) {
      let path = template;
      for (const [param, values] of valuesByParam) {
        path = path.replace(`:${param}`, encodeURIComponent(values[i]));
      }
      if (!done.has(path)) {
        done.add(path);
        fresh.push(path);
      }
    }
  }
  return fresh;
}

/** Summarize, after the crawl, what each template produced and why gaps remain. */
export function templateCoverage(
  templates: readonly ParamRouteTemplate[],
  harvest: IdHarvest,
  generated: Map<string, Set<string>>,
): TemplateCoverage[] {
  return templates.map(({ template, params }) => ({
    template,
    instances: [...(generated.get(template) ?? [])],
    missingParams: Object.entries(params)
      .filter(([, fields]) => !fields.some(f => (harvest.get(f)?.size ?? 0) > 0))
      .map(([param]) => param),
  }));
}
