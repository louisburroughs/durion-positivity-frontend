import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

// Fixture mirror of the real core/services/api-base.service.ts (plan §5.2 allowlist).
export class FxlayApiBaseService {
  private readonly baseUrl = environment.apiBaseUrl;
  constructor(private readonly http: HttpClient) {}
  get(path: string) {
    return this.http.get(`${this.baseUrl}${path}`);
  }
}
