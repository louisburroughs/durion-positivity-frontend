import { routePattern } from './crawler';
import type { Finding } from './types';

/**
 * Findings that were investigated and accepted as intentional. They are NOT
 * removed from the report — they are downgraded to `info` with the recorded
 * rationale, so every run still shows them (and shows why they stand).
 *
 * Add entries only after verifying the behavior end-to-end; note what was
 * checked. Remove entries when the underlying behavior changes.
 */
interface AcceptedFinding {
  ruleId: string;
  /**
   * Page the acceptance applies to: an exact path for static routes, or a
   * collapsed pattern for detail routes (e.g. '/app/billing/invoices/{id}' —
   * concrete harvested ids change run to run, so patterns are the stable form).
   */
  page: string;
  /** Why this is intentional, and what was verified. */
  reason: string;
}

const ACCEPTED: readonly AcceptedFinding[] = [
  {
    ruleId: 'search-possibly-id-keyed',
    page: '/app/security/audit-logs',
    reason:
      'Verified: the filter maps to the security SDK searchAuditEvents(workorderId) param — ' +
      'an exact-id correlation lookup with no name/number-based alternative in the backend ' +
      'contract. The page is ROLE_ADMIN-only, which is the admin-tool exception the rule ' +
      'allows. Revisit if the audit search API gains human-readable terms.',
  },
];

/** Downgrade accepted findings to info, annotating them with the rationale. */
export function applyAcceptedFindings(findings: Finding[]): Finding[] {
  return findings.map(f => {
    const accepted = ACCEPTED.find(
      a => a.ruleId === f.ruleId && (a.page === f.page || a.page === routePattern(f.page)),
    );
    if (!accepted) return f;
    return {
      ...f,
      severity: 'info',
      summary: `[accepted] ${f.summary}`,
      recommendation: accepted.reason,
    };
  });
}
