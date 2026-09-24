import { HttpErrorResponse, HttpParams } from '@angular/common/http';

export function fxlaySdk01Compliant(err: HttpErrorResponse, params: HttpParams) {
  return { err, params };
}
