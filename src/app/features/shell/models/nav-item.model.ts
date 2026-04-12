export interface NavItem {
  /** Translation key under SHELL.NAV.* */
  key: string;
  /** SVG path data or text abbreviation used as icon */
  icon: string;
  /** Canonical route path */
  route: string;
  /** Use exact matching for active route detection (default: false) */
  exact?: boolean;
  /** Roles required to see this link; undefined = visible to all authenticated users */
  roles?: readonly string[];
  /** Display order */
  order: number;
  /** Navigation group for visual separation */
  group: 'main' | 'admin';
}
