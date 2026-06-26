#!/usr/bin/env bash
# =============================================================================
# Rename the drifted utility prefix .mic-* -> .dur-* across the app.
# Targets ONLY the two real utilities (elevation, status). Word-boundary scoped
# so it can't corrupt unrelated substrings like "dynamic-", "atomic-", "ceramic-".
#
# Usage:
#   bash handoff/scripts/rename-mic-to-dur.sh          # dry run (shows hits)
#   bash handoff/scripts/rename-mic-to-dur.sh --apply  # perform the rename
# =============================================================================
set -euo pipefail

ROOT="${ROOT:-src}"
PATTERN='\bmic-(elevation|status)\b'
FILES_GLOB=(--include='*.css' --include='*.html' --include='*.ts')

echo "Scanning $ROOT for .mic-elevation / .mic-status ..."
if ! grep -rnE "$PATTERN" "$ROOT" "${FILES_GLOB[@]}"; then
  echo "  no occurrences found — nothing to do."
  exit 0
fi

if [[ "${1:-}" != "--apply" ]]; then
  echo
  echo "Dry run only. Re-run with --apply to rewrite these files."
  exit 0
fi

# Portable in-place sed (GNU vs BSD/macOS).
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(sed -i -E)        # GNU
else
  SED_INPLACE=(sed -i '' -E)     # BSD / macOS
fi

grep -rlE "$PATTERN" "$ROOT" "${FILES_GLOB[@]}" | while read -r f; do
  "${SED_INPLACE[@]}" 's/\bmic-(elevation|status)\b/dur-\1/g' "$f"
  echo "updated $f"
done

echo
echo "Done. Verify zero matches remain:"
echo "  grep -rnE '$PATTERN' $ROOT"
