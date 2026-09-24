// A literal that merely resembles a path must not trip the finder: no leading slash / no /vN/ segment.
export const FXLAY_SDK05_COMPLIANT_A = '/assets/images/logo.png';
export const FXLAY_SDK05_COMPLIANT_B = 'v1.2.3';
// A backend-path-shaped literal inside a comment, e.g. '/billing/v1/invoices', must never be flagged.
