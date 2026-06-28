import { Injectable, afterNextRender, signal } from '@angular/core';

/** Probe string for the CSS Font Loading API (`size family`). */
const ICON_FONT = '24px "Material Symbols Rounded"';

/**
 * Tracks whether the self-hosted Material Symbols woff2 is loaded and usable.
 *
 * Icon-only UI (e.g. the collapsed nav rail) renders a text fallback while this
 * is `false`, so a font that never loads — strict CSP, offline, or the brief
 * `font-display: block` window — shows a readable letter instead of a blank/tofu
 * glyph. Stays `false` on the server and in browsers without the Font Loading
 * API, where the fallback is the only safe choice.
 *
 * Detection runs in `afterNextRender`, so it never touches the DOM on the server
 * and only flips `ready` AFTER the first client render — the initial client
 * paint matches the SSR markup (fallback), avoiding a hydration mismatch even
 * when the font is already cached.
 */
@Injectable({ providedIn: 'root' })
export class IconFontService {
  readonly ready = signal(false);

  constructor() {
    afterNextRender(() => {
      const fonts = document.fonts;
      if (!fonts) return; // unsupported → keep text fallback

      const mark = (): void => {
        if (fonts.check(ICON_FONT)) this.ready.set(true);
      };

      mark(); // already cached from a previous load?
      fonts.load(ICON_FONT).then(mark).catch(() => {/* CSP/offline → stay false */});
      fonts.ready.then(mark).catch(() => {/* ignore */});
    });
  }
}
