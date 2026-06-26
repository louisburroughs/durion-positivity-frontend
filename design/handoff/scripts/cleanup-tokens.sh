#!/usr/bin/env bash
# =============================================================================
# Durion component-CSS token cleanup.
#   Dry run : bash handoff/scripts/cleanup-tokens.sh
#   Apply   : bash handoff/scripts/cleanup-tokens.sh --apply
#
# Auto-fixes ONLY the safe, unambiguous replacements (the intended target is
# already encoded in each token's existing var() fallback). Everything that
# needs a human decision is reported but NOT changed — see 06-token-cleanup.md.
# Scope: src/**/*.css
# =============================================================================
set -euo pipefail
ROOT="${ROOT:-src}"
CSS=(--include='*.css')

echo "=== Token drift audit ($ROOT/**/*.css) ==="
echo
echo "## AUTO-FIXABLE (this script will rewrite these):"
grep -rnE '\-\-spacing-[0-9]|\-\-color-(primary|secondary|error|warning|success|on-[a-z-]+)' "$ROOT" "${CSS[@]}" || echo "  none"
echo
echo "## NEEDS HUMAN JUDGMENT (left untouched — resolve per 06-token-cleanup.md):"
grep -rnE '\-\-surface-container[a-z-]*|\-\-on-surface[a-z-]*|\-\-secondary-container|\-\-error-container|\-\-on-(secondary|error)-container|\-\-typescale-[a-z-]+|\-\-space-5\b' "$ROOT" "${CSS[@]}" || echo "  none"

if [[ "${1:-}" != "--apply" ]]; then
  echo; echo "Dry run only. Re-run with --apply to perform the safe replacements."
  exit 0
fi

# Portable in-place sed (GNU vs BSD/macOS)
if sed --version >/dev/null 2>&1; then SED=(sed -i -E); else SED=(sed -i '' -E); fi

grep -rlE '\-\-spacing-[0-9]|\-\-color-(primary|secondary|error|warning|success|on-)' "$ROOT" "${CSS[@]}" | while read -r f; do
  "${SED[@]}" \
    -e 's/--spacing-([0-9])/--space-\1/g' \
    -e 's/--color-on-surface-variant/--text-muted/g' \
    -e 's/--color-on-surface/--currentTextColor/g' \
    -e 's/--color-on-[a-z-]+/--currentTextColor/g' \
    -e 's/--color-primary/--brand-primary/g' \
    -e 's/--color-secondary/--brand-secondary/g' \
    -e 's/--color-error/--functional-error-red/g' \
    -e 's/--color-warning/--functional-warning/g' \
    -e 's/--color-success/--functional-success/g' \
    "$f"
  echo "fixed (safe) $f"
done

echo
echo "Safe pass done. Now resolve the 'needs judgment' items by hand, then run"
echo "the stylelint guardrail (handoff/.stylelintrc.json) until it's green."
