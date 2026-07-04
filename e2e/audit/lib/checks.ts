import fs from 'node:fs';
import type { Page } from '@playwright/test';
import type { Finding, Severity } from './types';
import type { VisitResult } from './crawler';

const UUID_TEXT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

// ---------------------------------------------------------------------------
// Rule: no UUIDs published on screen
// ---------------------------------------------------------------------------

export async function checkUuidExposure(page: Page, path: string): Promise<Finding[]> {
  const { bodyText, inputValues } = await page.evaluate(() => ({
    bodyText: document.body?.innerText ?? '',
    inputValues: Array.from(document.querySelectorAll('input, textarea'))
      .filter(el => (el as HTMLElement).offsetParent !== null)
      .map(el => (el as HTMLInputElement).value)
      .filter(v => !!v),
  }));

  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const [source, text] of [
    ['visible text', bodyText],
    ['visible input value', inputValues.join('\n')],
  ] as const) {
    for (const match of text.matchAll(UUID_TEXT)) {
      const uuid = match[0].toLowerCase();
      if (seen.has(uuid)) continue;
      seen.add(uuid);
      findings.push({
        ruleId: 'uuid-on-screen',
        severity: 'high',
        page: path,
        summary: `UUID exposed in ${source}`,
        evidence: uuid,
        recommendation:
          'Replace the raw UUID with a human-readable identifier (name, invoice number, ' +
          'employee number, etc.). Keep UUIDs in route params and API payloads only.',
        reference: 'UI rule: no UUIDs published on screen',
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Rule: searches must be keyed by human-readable data
// (customer names, phone numbers, invoice numbers, employee names/numbers)
// ---------------------------------------------------------------------------

const HUMAN_TERMS =
  /\b(name|phone|email|invoice|customer|employee|vendor|supplier|number|no\.|vin|plate|sku|part|city|zip|postal|address|date)\b/i;
const ID_TERMS = /\b(uuid|guid)\b/i;
const BARE_ID = /\b(id|identifier)\b/i;

export async function checkSearchUsability(page: Page, path: string): Promise<Finding[]> {
  const searchFields = await page.evaluate(() => {
    const selector = [
      'input[type="search"]',
      '[role="searchbox"]',
      'input[placeholder*="search" i]',
      'input[aria-label*="search" i]',
      'input[name*="search" i]',
      'input[id*="search" i]',
      'input[placeholder*="filter" i]',
      'input[aria-label*="filter" i]',
    ].join(', ');

    return Array.from(document.querySelectorAll(selector))
      .filter(el => (el as HTMLElement).offsetParent !== null)
      .map(el => {
        const input = el as HTMLInputElement;
        const labelledBy = input.getAttribute('aria-labelledby');
        const labelForText = input.id
          ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent
          : null;
        const labelledByText = labelledBy
          ? document.getElementById(labelledBy)?.textContent
          : null;
        return {
          descriptor: [
            input.placeholder,
            input.getAttribute('aria-label'),
            labelForText,
            labelledByText,
            input.name,
            input.id,
          ]
            .filter(Boolean)
            .join(' | '),
          selector:
            (input.id && `#${input.id}`) ||
            (input.name && `input[name="${input.name}"]`) ||
            'input',
        };
      });
  });

  const findings: Finding[] = [];
  for (const field of searchFields) {
    if (ID_TERMS.test(field.descriptor)) {
      findings.push({
        ruleId: 'search-by-internal-id',
        severity: 'high',
        page: path,
        summary: 'Search field is keyed by UUID/GUID',
        evidence: `${field.selector} — "${field.descriptor}"`,
        recommendation:
          'Search must accept human-readable data: customer names, phone numbers, ' +
          'invoice numbers, employee names/numbers. Move UUID lookup to an admin-only tool if needed.',
        reference: 'UI rule: searches must use human-readable data',
      });
    } else if (BARE_ID.test(field.descriptor) && !HUMAN_TERMS.test(field.descriptor)) {
      findings.push({
        ruleId: 'search-possibly-id-keyed',
        severity: 'medium',
        page: path,
        summary: 'Search field appears to accept only an internal ID',
        evidence: `${field.selector} — "${field.descriptor}"`,
        recommendation:
          'Verify this search accepts human-readable terms (names, phone numbers, ' +
          'invoice/employee numbers). If it only takes an internal ID, add human-readable search.',
        reference: 'UI rule: searches must use human-readable data',
      });
    }
  }

  // Dropdowns/options that render UUIDs as their visible choice text.
  const uuidOptions = await page.evaluate(() => {
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    return Array.from(document.querySelectorAll('option, [role="option"]'))
      .map(o => o.textContent?.trim() ?? '')
      .filter(t => uuidRe.test(t))
      .slice(0, 5);
  });
  if (uuidOptions.length > 0) {
    findings.push({
      ruleId: 'uuid-in-picker-options',
      severity: 'high',
      page: path,
      summary: 'Select/picker options display UUIDs as their labels',
      evidence: uuidOptions.join(' ; '),
      recommendation:
        'Render the entity\'s display name in the option label and keep the UUID as the option value.',
      reference: 'UI rule: no UUIDs published on screen',
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Rule: no rendering artifacts / raw i18n keys (ADR-0030, ADR-0038)
// ---------------------------------------------------------------------------

// Requires at least two dot-separated ALL-CAPS segments after the first,
// e.g. CRM.ERROR.LOAD / AUTH.LOGIN.USERNAME — avoids false hits on "U.S." etc.
const RAW_I18N_KEY = /\b[A-Z][A-Z0-9_]{2,}(?:\.[A-Z0-9_]{2,}){2,}\b/g;

export async function checkRenderingArtifacts(page: Page, path: string): Promise<Finding[]> {
  const bodyText: string = await page.evaluate(() => document.body?.innerText ?? '');
  const findings: Finding[] = [];

  const artifacts: Array<{ re: RegExp; label: string; severity: Severity; ref: string }> = [
    { re: /\bInvalid Date\b/, label: '"Invalid Date" rendered', severity: 'high', ref: 'ADR-0038 date-only string handling' },
    { re: /(^|\s)NaN(\s|$)/, label: '"NaN" rendered', severity: 'high', ref: 'ADR-0038 / data formatting' },
    { re: /\[object Object\]/, label: '"[object Object]" rendered', severity: 'high', ref: 'data formatting' },
    { re: /(^|\s)undefined(\s|$)/, label: 'standalone "undefined" rendered', severity: 'medium', ref: 'data formatting' },
  ];
  for (const a of artifacts) {
    const m = bodyText.match(a.re);
    if (m) {
      const idx = bodyText.indexOf(m[0]);
      findings.push({
        ruleId: 'rendering-artifact',
        severity: a.severity,
        page: path,
        summary: a.label,
        evidence: bodyText.slice(Math.max(0, idx - 60), idx + 60).replace(/\s+/g, ' '),
        recommendation:
          'Fix the formatting bug: guard missing values, and for YYYY-MM-DD strings follow ' +
          'ADR-0038 (append T00:00:00 before DatePipe; never new Date("YYYY-MM-DD")).',
        reference: a.ref,
      });
    }
  }

  const keys = new Set<string>();
  for (const m of bodyText.matchAll(RAW_I18N_KEY)) keys.add(m[0]);
  for (const key of [...keys].slice(0, 10)) {
    findings.push({
      ruleId: 'raw-i18n-key',
      severity: 'high',
      page: path,
      summary: 'Untranslated i18n key rendered to the user',
      evidence: key,
      recommendation:
        `Add "${key}" to all 4 locale files (en-US, es-US, fr-CA, qps-ploc) or fix the ` +
        'translate pipe usage on this page.',
      reference: 'ADR-0030 frontend i18n/l10n policy',
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Rule: accessibility baseline (ADR-0029) + contrast (ADR-0039) via axe-core
// ---------------------------------------------------------------------------

const AXE_SEVERITY: Record<string, Severity> = {
  critical: 'high',
  serious: 'medium',
  moderate: 'low',
  minor: 'info',
};

let axeSource: string | null = null;
function loadAxeSource(): string {
  if (!axeSource) {
    axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  }
  return axeSource;
}

export async function checkA11y(page: Page, path: string): Promise<Finding[]> {
  try {
    await page.evaluate(loadAxeSource());
    interface AxeViolation {
      id: string;
      impact: string | null;
      help: string;
      helpUrl: string;
      nodes: Array<{ target: string[] }>;
    }
    interface AxeRunner {
      run(
        context: Document,
        options: { runOnly: { type: string; values: string[] } },
      ): Promise<{ violations: AxeViolation[] }>;
    }
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: AxeRunner }).axe;
      const results = await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
      });
      return (results.violations as AxeViolation[]).map(v => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        nodeCount: v.nodes.length,
        sampleTargets: v.nodes.slice(0, 3).map(n => n.target.join(' ')),
      }));
    });

    return violations.map(v => ({
      ruleId: `a11y/${v.id}`,
      severity: AXE_SEVERITY[v.impact ?? 'minor'] ?? 'info',
      page: path,
      summary: `${v.help} (${v.nodeCount} element${v.nodeCount === 1 ? '' : 's'})`,
      evidence: v.sampleTargets.join(' ; '),
      recommendation: `Fix per ${v.helpUrl}`,
      reference: 'ADR-0029 accessibility baseline / ADR-0039 contrast',
    }));
  } catch (err) {
    return [
      {
        ruleId: 'a11y/scan-failed',
        severity: 'info',
        page: path,
        summary: 'axe-core scan could not run on this page',
        evidence: String(err).slice(0, 200),
        recommendation: 'Re-run the audit; if persistent, scan this page manually with axe DevTools.',
        reference: 'ADR-0029',
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Rule: SPA navigation policy (ADR-0037)
// ---------------------------------------------------------------------------

export async function checkNavigationPolicy(page: Page, path: string): Promise<Finding[]> {
  const nav = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a')).filter(
      a => (a as HTMLElement).offsetParent !== null,
    );
    return {
      actionAnchors: anchors
        .filter(a => /^(retry|reload|refresh|try again|submit|save|delete|cancel)\b/i.test(a.textContent?.trim() ?? ''))
        .map(a => a.textContent?.trim().slice(0, 40) ?? '')
        .slice(0, 5),
      deadAnchors: anchors
        .filter(a => {
          const href = a.getAttribute('href') ?? '';
          return href === '#' || href.startsWith('javascript:');
        })
        .map(a => a.textContent?.trim().slice(0, 40) ?? '(no text)')
        .slice(0, 5),
      untypedFormButtons: Array.from(document.querySelectorAll('form button:not([type])'))
        .map(b => b.textContent?.trim().slice(0, 40) ?? '(no text)')
        .slice(0, 5),
    };
  });

  const findings: Finding[] = [];
  if (nav.actionAnchors.length > 0) {
    findings.push({
      ruleId: 'anchor-as-action',
      severity: 'medium',
      page: path,
      summary: 'Action/retry control rendered as a link instead of a button',
      evidence: nav.actionAnchors.join(' ; '),
      recommendation:
        'Retry/reload/action controls must be <button type="button">, not <a> elements.',
      reference: 'ADR-0037 SPA navigation policy',
    });
  }
  if (nav.deadAnchors.length > 0) {
    findings.push({
      ruleId: 'dead-anchor-href',
      severity: 'medium',
      page: path,
      summary: 'Anchor with href="#" or javascript: pseudo-URL',
      evidence: nav.deadAnchors.join(' ; '),
      recommendation:
        'Use <button type="button"> for click handlers, or routerLink for navigation.',
      reference: 'ADR-0037 SPA navigation policy',
    });
  }
  if (nav.untypedFormButtons.length > 0) {
    findings.push({
      ruleId: 'untyped-form-button',
      severity: 'medium',
      page: path,
      summary: 'Button inside a form without an explicit type (defaults to submit)',
      evidence: nav.untypedFormButtons.join(' ; '),
      recommendation: 'Add type="button" (or type="submit" where submission is intended).',
      reference: 'ADR-0037 SPA navigation policy',
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Rule: design-system conformance (Durion style guide / theme tokens)
// ---------------------------------------------------------------------------

const EXPECTED_BODY_FONTS = ['Noto Sans', 'Inter', 'Public Sans'];
const EXPECTED_HEADING_FONTS = ['Barlow Semi Condensed', 'Public Sans', 'Noto Sans'];
const REQUIRED_TOKENS = ['--brand-primary', '--brand-accent', '--themeBackground', '--currentTextColor'];

export async function checkDesignConformance(page: Page, path: string): Promise<Finding[]> {
  const design = await page.evaluate(
    ({ tokens }) => {
      const rootStyle = getComputedStyle(document.documentElement);
      const heading = document.querySelector('h1, h2, h3');
      return {
        themeAttr: document.documentElement.getAttribute('data-theme'),
        bodyFont: getComputedStyle(document.body).fontFamily,
        headingFont: heading ? getComputedStyle(heading).fontFamily : null,
        missingTokens: tokens.filter(t => !rootStyle.getPropertyValue(t).trim()),
        hasH1: !!document.querySelector('h1'),
      };
    },
    { tokens: REQUIRED_TOKENS },
  );

  const findings: Finding[] = [];
  if (!design.themeAttr) {
    findings.push({
      ruleId: 'missing-theme-attribute',
      severity: 'low',
      page: path,
      summary: 'html[data-theme] is not set (light/dark theming inactive)',
      recommendation: 'ThemeService should stamp data-theme="light|dark" on <html>.',
      reference: 'Durion style guide §4 theme mapping',
    });
  }
  if (design.missingTokens.length > 0) {
    findings.push({
      ruleId: 'missing-theme-tokens',
      severity: 'low',
      page: path,
      summary: 'Core design tokens are not defined on :root',
      evidence: design.missingTokens.join(', '),
      recommendation: 'Ensure styles.css token definitions are loaded on this page.',
      reference: 'design/handoff/theme-tokens.md',
    });
  }
  if (design.bodyFont && !EXPECTED_BODY_FONTS.some(f => design.bodyFont.includes(f))) {
    findings.push({
      ruleId: 'body-font-drift',
      severity: 'low',
      page: path,
      summary: 'Body font does not match the style guide stack',
      evidence: design.bodyFont.slice(0, 120),
      recommendation: `Body/UI text should use one of: ${EXPECTED_BODY_FONTS.join(', ')}.`,
      reference: 'Durion style guide §2 typography',
    });
  }
  if (design.headingFont && !EXPECTED_HEADING_FONTS.some(f => design.headingFont!.includes(f))) {
    findings.push({
      ruleId: 'heading-font-drift',
      severity: 'low',
      page: path,
      summary: 'Heading font does not match the style guide stack',
      evidence: design.headingFont.slice(0, 120),
      recommendation: `Headings should use one of: ${EXPECTED_HEADING_FONTS.join(', ')}.`,
      reference: 'Durion style guide §2 typography',
    });
  }
  if (!design.hasH1) {
    findings.push({
      ruleId: 'missing-h1',
      severity: 'low',
      page: path,
      summary: 'Page has no <h1> landmark heading',
      recommendation: 'Every routed page should declare exactly one <h1> for structure and a11y.',
      reference: 'ADR-0029 accessibility baseline',
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Console / network observations → findings
// ---------------------------------------------------------------------------

export function monitorFindings(visitResult: VisitResult, path: string): Finding[] {
  const findings: Finding[] = [];

  for (const err of [...new Set(visitResult.pageErrors)].slice(0, 5)) {
    findings.push({
      ruleId: 'uncaught-exception',
      severity: 'critical',
      page: path,
      summary: 'Uncaught JavaScript exception while rendering the page',
      evidence: err,
      recommendation: 'Fix the exception; pages must never throw during load.',
    });
  }
  for (const err of [...new Set(visitResult.consoleErrors)].slice(0, 5)) {
    findings.push({
      ruleId: 'console-error',
      severity: 'high',
      page: path,
      summary: 'console.error emitted during page load',
      evidence: err,
      recommendation: 'Eliminate the error or downgrade expected conditions to handled states.',
    });
  }

  const seen = new Set<string>();
  for (const req of visitResult.failedRequests) {
    const key = `${req.status}:${req.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const isApi = req.resourceType === 'xhr' || req.resourceType === 'fetch';
    const is5xx = typeof req.status === 'number' && req.status >= 500;
    findings.push({
      ruleId: isApi ? 'failed-api-request' : 'failed-asset-request',
      severity: isApi ? (is5xx ? 'critical' : 'high') : 'medium',
      page: path,
      summary: `${isApi ? 'API call' : 'Asset'} failed with ${req.status}`,
      evidence: req.url,
      recommendation: isApi
        ? 'Fix the backend/API contract, and ensure the page shows its error state (ADR-0031).'
        : 'Fix the broken asset reference.',
      reference: isApi ? 'ADR-0031 mutation/load error state convention' : undefined,
    });
  }

  return findings;
}

/** All DOM checks that run on a successfully audited page. */
export async function runPageChecks(page: Page, path: string): Promise<Finding[]> {
  return [
    ...(await checkUuidExposure(page, path)),
    ...(await checkSearchUsability(page, path)),
    ...(await checkRenderingArtifacts(page, path)),
    ...(await checkNavigationPolicy(page, path)),
    ...(await checkDesignConformance(page, path)),
    ...(await checkA11y(page, path)),
  ];
}
