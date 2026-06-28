#!/usr/bin/env python3
"""Extract a name->codepoint map from the vendored Material Symbols woff2.

The self-hosted font is the single source of truth for which glyphs exist and
at which Private-Use codepoints. This script reads the font's glyph names
(`post` table) and reverse-maps them through the `cmap` to emit a `.codepoints`
file (the same `name<space>hexcodepoint` format Google ships), guaranteed to
match the actual font binary — no version drift.

Run after replacing the woff2:
    pip install fonttools brotli
    python scripts/icons/extract-codepoints.py
Then regenerate the TS map:
    npm run icons:generate
"""
import hashlib
import re
import sys
from pathlib import Path
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
WOFF2 = ROOT / "src/assets/fonts/material-symbols/material-symbols-rounded.woff2"
OUT = ROOT / "src/assets/fonts/material-symbols/material-symbols-rounded.codepoints"
HASH_OUT = ROOT / "src/assets/fonts/material-symbols/material-symbols-rounded.woff2.sha256"

NAME_RE = re.compile(r"^[a-z0-9_]+$")

def main() -> int:
    font = TTFont(str(WOFF2))
    cmap = font.getBestCmap()
    glyph_to_cps: dict[str, list[int]] = {}
    for cp, glyph in cmap.items():
        glyph_to_cps.setdefault(glyph, []).append(cp)

    rows: list[tuple[str, int]] = []
    for glyph, cps in glyph_to_cps.items():
        if not NAME_RE.match(glyph):
            continue  # skip .notdef, *.fill variants, etc.
        # OpenType forbids digit-leading glyph names, so the font stores e.g.
        # icon "10k" as glyph "_10k"; strip the prefix back to the real name.
        name = glyph[1:] if glyph.startswith("_") else glyph
        rows.append((name, min(cps)))  # min cp reproduces upstream-stable values

    rows.sort(key=lambda r: r[0])
    OUT.write_text("".join(f"{name} {cp:04x}\n" for name, cp in rows), encoding="utf-8")
    print(f"wrote {len(rows)} icons -> {OUT.relative_to(ROOT)}")

    # Pin the font this map was extracted from. `npm run icons:check` recomputes
    # this hash so a woff2 swap without re-running this script fails CI — closing
    # the codepoints<->font drift gap with no Python dependency in the Node CI.
    digest = hashlib.sha256(WOFF2.read_bytes()).hexdigest()
    HASH_OUT.write_text(f"{digest}  {WOFF2.name}\n", encoding="utf-8")
    print(f"pinned woff2 sha256 -> {HASH_OUT.relative_to(ROOT)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
