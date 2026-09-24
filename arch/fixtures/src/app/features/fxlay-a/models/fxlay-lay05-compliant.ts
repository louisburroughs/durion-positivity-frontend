import type { Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

export interface FxlayLay05Compliant {
  readonly decorator?: typeof Injectable;
  readonly stream$?: Observable<void>;
}
