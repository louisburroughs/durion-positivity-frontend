import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

// Fixture mirror of the real app.config.ts (plan §5.2 allowlist): environment + HttpClient wiring
// is legitimate only here.
export const FXLAY_APP_CONFIG_BASE_URL = environment.apiBaseUrl;
export type AppConfigHttpClient = HttpClient;
