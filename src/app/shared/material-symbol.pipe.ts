import { Pipe, PipeTransform } from '@angular/core';
import { GLYPHS } from './material-symbols-glyphs.generated';

/**
 * Material Symbols Rounded — name → glyph codepoint.
 *
 * The self-hosted font instance ships icon glyphs addressable by their
 * Private-Use codepoint but WITHOUT usable `liga` ligature lookups, so the
 * familiar ligature names ("forum", "send", …) render as plain letters. This
 * pipe maps a readable icon name to its codepoint character so templates can
 * keep using names. The map is GENERATED from the vendored woff2 (full
 * coverage, no drift) — see scripts/icons/ and `npm run icons:generate`. An
 * unknown name resolves to an empty string (no glyph) rather than stray letters.
 */
@Pipe({ name: 'msIcon', standalone: true })
export class MaterialSymbolPipe implements PipeTransform {
  transform(name: string | null | undefined): string {
    if (!name) return '';
    return GLYPHS[name] ?? '';
  }
}
