import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import { throwError } from 'rxjs';
import {
  ConfirmReceiptRequest,
  ReceiptResult,
  ReceivingDocumentResponse,
} from '../../../models/inventory.models';
import { InventoryReceivingService } from '../../../services/inventory-receiving.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-receive-into-staging',
  standalone: true,
  imports: [CommonModule, TranslatePipe, FormsModule],
  templateUrl: './receive-into-staging.component.html',
  styleUrl: './receive-into-staging.component.css',
})
export class ReceiveIntoStagingComponent {
  private readonly receivingService = inject(InventoryReceivingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly asnMode = signal<'asn-entry' | 'fallback'>('asn-entry');
  readonly asnId = signal<string | null>(null);
  readonly document = signal<ReceivingDocumentResponse | null>(null);
  readonly submitting = signal(false);
  readonly lineQuantities = signal<Record<string, number>>({});
  readonly receiptResult = signal<ReceiptResult | null>(null);

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const asnId = params.get('asnId');
    const documentId = params.get('documentId');
    const documentType = params.get('documentType');

    if (asnId) {
      this.asnId.set(asnId);
      this.asnMode.set('asn-entry');
      this.loadAsn(asnId);
      return;
    }

    if (documentId && documentType) {
      this.asnMode.set('fallback');
      this.loadDocument(documentId, documentType);
    }
  }

  loadAsn(asnIdInput: string): void {
    const locationId = this.route.snapshot.queryParamMap.get('locationId');
    if (!locationId) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.RECEIVING.ERROR.ASN_LOCATION_REQUIRED');
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    this.receivingService
      .getAsn(asnIdInput)
      .pipe(
        switchMap(asn =>
          this.receivingService
            .createReceivingSessionFromAsn({ asnId: asn.asnId, locationId })
            .pipe(
              catchError(error => {
                this.state.set('error');
                this.errorKey.set('INVENTORY.RECEIVING.ERROR.ASN_SESSION');
                return throwError(() => error);
              }),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: doc => {
          this.document.set(doc);
          const initial: Record<string, number> = {};
          doc.lines.forEach(line => {
            initial[line.receivingLineId] = line.expectedQty;
          });
          this.lineQuantities.set(initial);
          this.state.set('ready');
        },
        error: () => {
          if (this.errorKey() === 'INVENTORY.RECEIVING.ERROR.ASN_SESSION') {
            return;
          }
          this.state.set('error');
          this.errorKey.set('INVENTORY.RECEIVING.ERROR.ASN_LOAD');
        },
      });
  }

  switchToFallback(): void {
    this.asnMode.set('fallback');
    if (!this.document()) {
      this.state.set('idle');
      this.errorKey.set(null);
    }
  }

  loadDocument(documentId: string, documentType: string): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.receivingService
      .getReceivingDocument(documentId, documentType)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: doc => {
          this.document.set(doc);
          const initial: Record<string, number> = {};
          doc.lines.forEach(line => {
            initial[line.receivingLineId] = line.expectedQty;
          });
          this.lineQuantities.set(initial);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.RECEIVING.ERROR.LOAD');
        },
      });
  }

  updateLineQty(lineId: string, qty: number): void {
    if (!Number.isFinite(qty)) {
      return;
    }
    const safeQty = Math.max(0, qty);
    this.lineQuantities.update(current => ({ ...current, [lineId]: safeQty }));
  }

  confirmReceipt(): void {
    const doc = this.document();
    if (!doc) {
      return;
    }

    const request: ConfirmReceiptRequest = {
      documentId: doc.documentId,
      documentType: doc.documentType,
      locationId: doc.locationId,
      stagingStorageLocationId: doc.stagingStorageLocationId,
      lines: doc.lines
        .filter(line => line.isReceivable)
        .map(line => ({
          receivingLineId: line.receivingLineId,
          actualQty: this.lineQuantities()[line.receivingLineId] ?? line.expectedQty,
          actualUomId: line.expectedUomId,
        })),
    };

    this.submitting.set(true);
    this.errorKey.set(null);

    this.receivingService
      .confirmReceipt(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: result => {
          this.receiptResult.set(result);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.RECEIVING.ERROR.CONFIRM');
        },
      });
  }

  receiveAnother(): void {
    this.router.navigate(['/app/inventory/receiving/receive-into-staging']);
  }
}
