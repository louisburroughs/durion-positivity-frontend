import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Options accepted by mutating ApiBaseService methods (POST, PUT, PATCH, DELETE).
 * Extend this interface when additional per-request options are needed.
 */
export interface ApiRequestOptions {
  /** Arbitrary request headers to merge into the outgoing request. */
  headers?: Record<string, string>;
}

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

  constructor(private readonly http: HttpClient) { }

  get<T>(path: string, params?: HttpParams, options?: ApiRequestOptions): Observable<T> {
    return this.http.get<T>(this.url(path), { params, headers: this.toHeaders(options?.headers) });
  }

  post<T>(path: string, body: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.post<T>(this.url(path), body, { headers: this.toHeaders(options?.headers) });
  }

  put<T>(path: string, body: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.put<T>(this.url(path), body, { headers: this.toHeaders(options?.headers) });
  }

  patch<T>(path: string, body: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.patch<T>(this.url(path), body, { headers: this.toHeaders(options?.headers) });
  }

  delete<T>(path: string, options?: ApiRequestOptions): Observable<T> {
    return this.http.delete<T>(this.url(path), { headers: this.toHeaders(options?.headers) });
  }

  deleteWithBody<T>(path: string, body: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.delete<T>(this.url(path), { body, headers: this.toHeaders(options?.headers) });
  }

  private toHeaders(record?: Record<string, string>): HttpHeaders | undefined {
    return record ? new HttpHeaders(record) : undefined;
  }

  private url(path: string): string {
    return `${this.base}${path.startsWith('/') ? path : '/' + path}`;
  }
}
