// Durion drift guardrail. Run: npx stylelint "src/**/*.css".
// See design/source/durion-style-guide.md and design/source/theme-tokens.md.
//
// JS rather than JSON so the drift list below can be shared between the base
// rule and the per-directory role rules without being copied.

/**
 * Token names the design system never defined, or retired. Applies to every
 * property. Also bans `var()` fallbacks outright.
 */
const DRIFT = [
  '/var\\([^,)]*,/',
  '/--surface-container[a-z0-9-]*/',
  '/--surfaceContainer[A-Za-z]*/',
  '/--secondary-container/',
  '/--on-surface[a-z-]*/',
  '/--on-(secondary|error)-container/',
  '/--error-container/',
  '/--color-[a-z0-9-]+/',
  '/--typescale-[a-z0-9-]+/',
  '/--spacing-[0-9]/',
  '/--durion-(on-surface|surface-container[a-z-]*)/',
  '/--brand-(primary-light|primary-hover|on-primary)/',
  '/--bodyColor/',
  '/--border-subtle/',
  '/--surface-(color|subtle|primary|secondary)/',
  '/--outline-variant-rgb/',
  '/--hoverBackground/',
  '/--hover-color/',
  '/--muted-color/',
  '/--error-color/',
  "/--text-(primary|on-brand|lg|xl)([^a-z-]|$)/",
  '/--status-warning-text/',
  '/--radius-(full|pill)/',
  '/--font-display-sm/',
  '/--inter[^a-z-]/',
  '/--publicSans/',
  '/var\\(--mono[,)]/',
  '/var\\(--surface[,)]/',
  '/var\\(--error[,)]/',
  '/var\\(--dur-elevation/',
  '/Michelin Unit Titling/',
  "/'Inter'/",
  "/'Public Sans'/",
  '/#cc9030/i',
];

const DRIFT_MESSAGE =
  'Unsanctioned token or var() fallback. var(--x, fallback) is banned outright: styles.css is the sole ' +
  'render-blocking stylesheet so fallbacks are dead code, they hide undefined names from the ' +
  'unknown-custom-properties rule, and a stale fallback paints light-theme colors in dark mode. Write bare ' +
  'var(--x) with a token defined in src/styles.css. Token mappings (design/source/theme-tokens.md): ' +
  '--border-color not --color-outline-variant/--border-subtle; --status-<kind>-bg/-fg not ' +
  '--color-danger/--color-warn*; --cardBackground/--surface-variant not --color-surface/--surface-color; ' +
  '--currentTextColor not --color-text/--bodyColor/--text-primary; --primaryA100 not --brand-primary-light; ' +
  '--font-mono not --mono; --font-primary/--font-body not Inter/Public Sans; --goldA400 not raw #cc9030.';

/**
 * Role rules: a token can be sanctioned and still be wrong for the property it
 * is on. The Tier-2 brand and functional tokens carry ONE value used in both
 * themes, so they are fills, not text — `color: var(--brand-primary)` is 7.8:1
 * in light and 1.3:1 on the dark card. Raw Tier-1 ramp values are theme-agnostic
 * for the same reason. `background: var(--brand-primary)` stays legal: a filled
 * button is exactly what that token is for.
 *
 * Keyed per property, so both this and the DRIFT entry above are checked.
 */
const ROLE = {
  color: [
    '/--brand-(primary|secondary|accent|gold)([^a-z-]|$)/',
    '/--functional-(error-red|warning|info-blue|success)/',
    '/--durion-[a-z]+-[0-9]+/',
  ],
  background: [
    '/--brand-(primary-soft|surface|background)([^a-z-]|$)/',
    '/--durion-[a-z]+-(50|100|200)([^0-9]|$)/',
  ],
  'background-color': [
    '/--brand-(primary-soft|surface|background)([^a-z-]|$)/',
    '/--durion-[a-z]+-(50|100|200)([^0-9]|$)/',
  ],
};

const ROLE_MESSAGE =
  'Theme-agnostic token used where the colour must follow the theme (design/source/theme-tokens.md). ' +
  'As TEXT use the Tier-3 pair, not the Tier-2 token: --text-muted (not --brand-secondary), --link-color ' +
  '(not --brand-primary), --status-<kind>-fg (not --functional-*), --accentA400 (not --brand-accent), ' +
  '--goldA400 (not --brand-gold), --currentTextColor (not a raw --durion-* ramp value). As a SURFACE use ' +
  '--cardBackground / --surface-inset / --surface-variant / --status-<kind>-bg / --primary50 — a raw light ' +
  'ramp value or --brand-surface stays near-white in dark mode. --brand-primary as a background is fine.';

/** Directories swept onto theme-aware tokens; the role rules are enforced here. */
const SWEPT = ['src/app/features/accounting/**/*.css', 'src/app/features/product/**/*.css'];

module.exports = {
  plugins: ['stylelint-value-no-unknown-custom-properties'],
  rules: {
    'csstools/value-no-unknown-custom-properties': [
      true,
      {
        importFrom: ['src/styles.css'],
        // Catches ANY undefined var(--x) (incl. fallback-less, which render broken).
        // Sanctioned tokens are defined in src/styles.css. Add new runtime tokens
        // there, not inline.
      },
    ],
    'selector-disallowed-list': [
      ['/\\.mic-(elevation|status)/'],
      {
        message:
          'Use the .dur-* utility prefix, not .mic-* (mic- is upstream-template drift). ' +
          'See design/source/durion-style-guide.md §05.',
        severity: 'error',
      },
    ],
    'declaration-property-value-disallowed-list': [
      { '/.+/': DRIFT },
      { message: DRIFT_MESSAGE, severity: 'error' },
    ],
  },
  overrides: [
    {
      files: SWEPT,
      rules: {
        'declaration-property-value-disallowed-list': [
          { '/.+/': DRIFT, ...ROLE },
          { message: `${DRIFT_MESSAGE} ${ROLE_MESSAGE}`, severity: 'error' },
        ],
      },
    },
  ],
};
