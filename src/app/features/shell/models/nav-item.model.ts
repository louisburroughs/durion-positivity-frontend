export interface NavItem {
  /** Translation key under SHELL.NAV.* */
  key: string;
  /** SVG path data or text abbreviation used as icon */
  icon: string;
  /** Canonical route path */
  route: string;
  /** Use exact matching for active route detection (default: false) */
  exact?: boolean;
  /** Roles required to see this link; undefined = not role-gated */
  roles?: readonly string[];
  /**
   * Permission codes (any of) required to see this link. Must mirror the
   * matching route's `data.permissions` so the nav never offers a link the
   * route guard will refuse. Undefined = not permission-gated.
   */
  permissions?: readonly string[];
  /** Display order */
  order: number;
  /** Navigation group for visual separation */
  group: 'main' | 'admin';
}
