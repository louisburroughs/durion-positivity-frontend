/**
 * Faro route tracker.
 * --------------------
 * Wires Angular Router `NavigationEnd` events into Faro's `setView()` so every
 * signal (spans, errors, events, measurements) recorded while a route is
 * active gets tagged with the route pattern — complementing the
 * `experimental.trackNavigation` timing data configured in `faro-init.ts`
 * (see `.sre/opentelemetry-agent-skills/faro-web-setup/advanced.md` section B
 * in the durion-positivity-backend repo).
 *
 * SSR-safe: `faro.api` is undefined on the server (Faro only initializes in
 * the browser via `main.ts`'s first import), so `faro.api?.setView(...)` is a
 * no-op during SSR.
 */
import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { faro } from '@grafana/faro-web-sdk';

@Injectable({ providedIn: 'root' })
export class FaroRouteTracker {
  constructor(private readonly router: Router) {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        try {
          faro.api?.setView({ name: event.urlAfterRedirects });
        } catch {
          // Telemetry must never break navigation.
        }
      });
  }
}
