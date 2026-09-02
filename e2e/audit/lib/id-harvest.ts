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

import { isIdShaped } from './id-patterns';

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

export interface IdHarvester {
  harvest: IdHarvest;
  /**
   * Resolves when all response bodies observed so far have been parsed.
   * Body parsing runs in detached promises; callers deciding whether the
   * crawl is done (refill-from-harvest) must await this first, or ids from
   * the last-visited pages can be missed nondeterministically.
   */
  idle(): Promise<void>;
}

/**
 * `fields` is the exact set of harvest keys the route templates consume (see
 * PARAM_TEMPLATES) — everything else is skipped unparsed.
 *
 * Every harvested field is scoped to the gateway service that answered:
 * `invoiceId` seen on `/api/accounting/...` is stored as `invoiceId@accounting`
 * and never under bare `invoiceId`. Named ids collide across services (an
 * accounting event's `invoiceId` is not a billing invoice), and an unscoped
 * harvest fed valid detail routes ids from unrelated services (#201).
 */
export function attachIdHarvester(page: Page, fields: ReadonlySet<string>): IdHarvester {
  const harvest: IdHarvest = new Map();
  const pending = new Set<Promise<void>>();

  page.on('response', res => {
    const type = res.request().resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    if (res.status() !== 200) return;
    if (!res.url().includes('/api/')) return;
    // Gate on headers before transferring the body out of the browser.
    const headers = res.headers();
    if (!(headers['content-type'] ?? '').includes('json')) return;
    const declaredLength = Number(headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return;

    const url = res.url();
    const task = res
      .text()
      .then(body => {
        if (!body || body.length > MAX_BODY_BYTES) return;
        let json: unknown;
        try {
          json = JSON.parse(body);
        } catch {
          return;
        }
        collectResponseIds(json, url, fields, harvest);
      })
      // Bodies of responses that raced a navigation are gone; that's fine.
      .catch(() => undefined)
      .finally(() => pending.delete(task));
    pending.add(task);
  });

  return {
    harvest,
    idle: () => Promise.all([...pending]).then(() => undefined),
  };
}

/**
 * Harvest id-shaped values from one parsed JSON response body.
 *
 * Every allowed field is stored as `${field}@${apiService(url)}`; bare `id`
 * follows the same rule. A response whose URL yields no service segment is
 * skipped entirely rather than stored unscoped.
 */
export function collectResponseIds(
  json: unknown,
  url: string,
  fields: ReadonlySet<string>,
  harvest: IdHarvest,
): void {
  const service = apiService(url);
  if (!service) return;
  collect(json, harvest, fields, service, 0, false);
}

/** First path segment after `/api/` (e.g. `/api/inventory/v1/...` → "inventory"). */
export function apiService(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return '';
  }
  const segments = pathname.split('/').filter(Boolean);
  const apiIndex = segments.indexOf('api');
  return apiIndex >= 0 ? (segments[apiIndex + 1] ?? '') : '';
}

/**
 * `embedded` is true when `node` was reached through an object-valued key
 * (e.g. a location's `type: { id, name }`). A bare `id` there identifies a
 * different entity of unknown kind — the location-type seed id, not a
 * location — so it is never harvested; only entity roots (the top-level
 * object, or elements of an array such as a page's `content`) may supply a
 * bare `id`. Named fields (`locationId`, `partyId`, …) say what they are and
 * are harvested at any depth.
 */
function collect(
  node: unknown,
  harvest: IdHarvest,
  fields: ReadonlySet<string>,
  service: string,
  depth: number,
  embedded: boolean,
): void {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0, MAX_ARRAY_ITEMS)) {
      collect(item, harvest, fields, service, depth + 1, false);
    }
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number') {
      if (key === 'id' && embedded) continue;
      const harvestKey = `${key}@${service}`;
      if (!fields.has(harvestKey)) continue;
      const str = String(value);
      if (str.length === 0 || str.length > 64) continue;
      // Only shapes routePattern() collapses to {id} — anything else would
      // dodge per-pattern sampling when it becomes a path segment.
      if (isIdShaped(str)) {
        let values = harvest.get(harvestKey);
        if (!values) harvest.set(harvestKey, (values = new Set()));
        if (values.size < MAX_VALUES_PER_FIELD) values.add(str);
      }
    } else {
      collect(value, harvest, fields, service, depth + 1, !Array.isArray(value));
    }
  }
}

/** All response field names referenced by a template set (harvester allowlist). */
export function templateFields(templates: readonly ParamRouteTemplate[]): Set<string> {
  return new Set(templates.flatMap(t => Object.values(t.params).flat()));
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
