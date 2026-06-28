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
    files: ['**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {},
  },
);
