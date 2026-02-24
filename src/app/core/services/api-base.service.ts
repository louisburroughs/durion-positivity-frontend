import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * ApiBaseService
 * --------------
 * Thin wrapper around HttpClient that prepends the configured API base URL.
 * All feature services should inject this instead of HttpClient directly so
 * the base URL is managed from a single place.
 *
 * Base URL is driven by src/environments/environment.ts (dev) and
 * src/environments/environment.prod.ts (production build).
 */
@Injectable({ providedIn: 'root' })
export class ApiBaseService {
  private readonly base = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  get<T>(path: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(this.url(path), { params });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body);
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body);
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path));
  }

  private url(path: string): string {
    return `${this.base}${path.startsWith('/') ? path : '/' + path}`;
  }
}
