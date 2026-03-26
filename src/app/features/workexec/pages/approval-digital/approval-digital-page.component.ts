import {
  Component, inject, signal, OnInit, DestroyRef,
  ViewChild, ElementRef, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateResponse, PageState } from '../../models/workexec.models';

/**
 * ApprovalDigitalPageComponent — Story 271 (CAP-003)
 * Route: /app/workexec/estimates/:estimateId/approval/digital
 * operationId: approveEstimate
 *   (Contract normalization: operation_ids was empty in AGENT_WORKSET.yaml.
 *   OpenAPI inspection identifies `approveEstimate` →
 *   POST /v1/workorders/estimates/{estimateId}/approval with signatureData.)
 *
 * Captures customer digital signature via native <canvas> element.
 * No third-party library (per Designer constraint #4).
 * Encodes strokes as base64 PNG and submits to approveEstimate.
 */
@Component({
  selector: 'app-approval-digital-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './approval-digital-page.component.html',
  styleUrl: './approval-digital-page.component.css',
})
export class ApprovalDigitalPageComponent implements OnInit, AfterViewInit {
  @ViewChild('signatureCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly workexec   = inject(WorkexecService);
  private readonly route      = inject(ActivatedRoute);
  private readonly router     = inject(Router);
  private readonly fb         = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState     = signal<PageState>('loading');
  readonly submitState   = signal<'idle' | 'saving' | 'success' | 'error'>('idle');
  readonly estimate      = signal<EstimateResponse | null>(null);
  readonly errorMessage  = signal<string | null>(null);
  readonly signatureEmpty = signal(true);

  estimateId = '';
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;

  readonly signerForm = this.fb.nonNullable.group({
    customerId: ['', Validators.required],
    signerName: ['', Validators.required],
    notes: [''],
    purchaseOrderNumber: [''],
  });

  ngOnInit(): void {
    this.estimateId = this.route.snapshot.paramMap.get('estimateId') ?? '';
    this.loadEstimate();
  }

  ngAfterViewInit(): void {
    if (this.canvasRef?.nativeElement) {
      this.ctx = this.canvasRef.nativeElement.getContext('2d');
      if (this.ctx) {
        this.ctx.strokeStyle = '#181c1e';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
      }
    }
  }

  loadEstimate(): void {
    this.pageState.set('loading');
    this.workexec.getEstimateById(this.estimateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: est => {
          this.estimate.set(est);
          this.pageState.set('ready');
        },
        error: err => {
          this.pageState.set('error');
          this.errorMessage.set(err.status === 404 ? 'Estimate not found.' : 'Failed to load estimate.');
        },
      });
  }

  // ── Signature canvas event handlers ──────────────────────────────────────

  onPointerDown(event: PointerEvent): void {
    if (!this.ctx || !this.canvasRef?.nativeElement) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    this.drawing = true;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.signatureEmpty.set(false);
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.drawing || !this.ctx || !this.canvasRef?.nativeElement) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    this.ctx.lineTo(x, y);
    this.ctx.stroke();
  }

  onPointerUp(): void {
    this.drawing = false;
  }

  clearSignature(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (canvas && this.ctx) {
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.signatureEmpty.set(true);
    }
  }

  private getSignatureDataUrl(): string | null {
    const canvas = this.canvasRef?.nativeElement;
    return canvas ? canvas.toDataURL('image/png') : null;
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  submitApproval(): void {
    if (this.signerForm.invalid) {
      this.signerForm.markAllAsTouched();
      return;
    }
    if (this.signatureEmpty()) {
      this.errorMessage.set('Please provide a signature before submitting.');
      return;
    }
    const signatureData = this.getSignatureDataUrl();
    if (!signatureData) return;

    this.submitState.set('saving');
    this.errorMessage.set(null);

    const { customerId, signerName, notes, purchaseOrderNumber } = this.signerForm.getRawValue();

    this.workexec.approveEstimate(this.estimateId, {
      customerId,
      signatureData,
      signatureMimeType: 'image/png',
      signerName,
      notes: notes || undefined,
      purchaseOrderNumber: purchaseOrderNumber || undefined,
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: est => {
          this.estimate.set(est);
          this.submitState.set('success');
        },
        error: err => {
          this.submitState.set('error');
          const body = err.error;
          if (err.status === 400 && (body?.code === 'APPROVAL_EXPIRED' || body?.message?.toLowerCase().includes('expired'))) {
            this.pageState.set('expired');
            this.errorMessage.set('This approval has expired. Please create a new revision and resubmit.');
          } else if (err.status === 403) {
            this.errorMessage.set('You are not authorized to approve this estimate.');
          } else if (err.status === 409) {
            this.errorMessage.set('Estimate was modified concurrently. Please reload and try again.');
            this.loadEstimate();
          } else {
            this.errorMessage.set(body?.message ?? 'Failed to submit approval.');
          }
        },
      });
  }
}
