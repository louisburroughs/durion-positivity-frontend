import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Server routing configuration.
 *
 * All routes use Client render mode because:
 * 1. The entire application is behind authentication — prerendering authenticated
 *    pages has no SEO benefit and breaks with parameterised routes.
 * 2. TranslateHttpLoader requires a running HTTP server to load i18n assets,
 *    which is unavailable during static prerender.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
