import { Pipe, PipeTransform } from '@angular/core';

/**
 * Material Symbols Rounded — name → glyph codepoint.
 *
 * The self-hosted font instance (v355) ships icon glyphs addressable by their
 * Private-Use codepoint but WITHOUT usable `liga` ligature lookups, so the
 * familiar ligature names ("forum", "send", …) render as plain letters. This
 * pipe maps a readable icon name to its codepoint character so templates can
 * keep using names. Add new entries here as icons are introduced; an unknown
 * name resolves to an empty string (no glyph) rather than stray letters.
 */
const GLYPHS: Readonly<Record<string, string>> = {
  // Navigation
  space_dashboard: '\ue66b',
  construction: '\uea3c',
  groups: '\uf233',
  storefront: '\uea12',
  account_balance: '\ue84f',
  receipt_long: '\uef6e',
  badge: '\uea67',
  inventory_2: '\ue1a1',
  category: '\ue574',
  location_city: '\ue7f1',
  shield: '\ue75b',
  admin_panel_settings: '\uef3d',
  // Dashboard quick actions
  assignment_add: '\uf848',
  person_add: '\ue7fe',
  payments: '\uef63',
  event: '\ue24f',
  // Shared UI
  chevron_right: '\ue409',
  star: '\ue838',
  forum: '\ue0bf',
  send: '\ue163',
  close: '\ue14c',
};

@Pipe({ name: 'msIcon', standalone: true })
export class MaterialSymbolPipe implements PipeTransform {
  transform(name: string | null | undefined): string {
    if (!name) return '';
    return GLYPHS[name] ?? '';
  }
}
