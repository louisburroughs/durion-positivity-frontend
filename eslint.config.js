// @ts-check
// Flat ESLint config for the Angular 21 app. Run via `npm run lint` (→ `ng lint`).
// TS files get @eslint/js + typescript-eslint + @angular-eslint recommendations;
// component inline templates and *.html files get the Angular template rules.
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = tseslint.config(
  {
    // Build output, generated assets, and the static bootstrap document — never linted.
    // src/index.html is plain HTML, not an Angular component template; the template
    // parser + a11y rules would raise false positives on it.
    ignores: ['dist/**', 'coverage/**', '.angular/**', 'node_modules/**', 'src/index.html'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // Allow intentionally-unused identifiers when prefixed with `_`
      // (placeholder params, destructured drops, caught-and-ignored errors).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  {
    // In-editor mirrors of three architecture-suite rules (arch/README.md). The suite in arch/
    // is authoritative; these copies only give earlier feedback. Keep both in sync.
    files: ['src/app/**/*.ts'],
    ignores: ['src/**/*.spec.ts'],
    rules: {
      // SDK-01 (ADR-0041 §2): backend calls go through the generated @durion-sdk/* services.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@angular/common/http',
              importNames: ['HttpClient', 'HttpBackend'],
              message:
                '[SDK-01] Use the generated @durion-sdk/* service via a feature service (ADR-0041 §2).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        // SEC-01 (ADR-0065 §1): no raw HTML sinks and no sanitizer bypass.
        {
          selector:
            "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
          message: '[SEC-01] No innerHTML/outerHTML assignment (ADR-0065 §1).',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: '[SEC-01] No insertAdjacentHTML (ADR-0065 §1).',
        },
        {
          selector:
            "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
          message: '[SEC-01] No document.write (ADR-0065 §1).',
        },
        {
          selector: "Identifier[name='DomSanitizer'], Identifier[name=/^bypassSecurityTrust/]",
          message: '[SEC-01] No DomSanitizer / bypassSecurityTrust* (ADR-0065 §1).',
        },
        // SEC-03: no dynamic code evaluation.
        {
          selector: "CallExpression[callee.name='eval']",
          message: '[SEC-03] No eval().',
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: '[SEC-03] No new Function().',
        },
      ],
    },
  },
  {
    // SDK-01 allowlist: the transport layer itself.
    files: [
      'src/app/app.config.ts',
      'src/app/core/services/api-base.service.ts',
      'src/app/core/interceptors/**/*.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {},
  },
);
