import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';

import { LoginRequest } from '@durion-sdk/security';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { normalizeTenantSlug } from '../../core/security/tenant';
import { tenantSlug } from '../../core/util/form-validators';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly themeService = inject(ThemeService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly sessionExpired = signal(false);

  /**
   * Tenant named by the page host (ADR-0062 §3). When set, the gateway resolves
   * the tenant from the Host header, so the form shows it read-only and sends
   * no slug; when null the host carries no tenant and the form asks for one.
   */
  readonly hostTenantSlug = signal<string | null>(this.authService.hostTenantSlug());

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(2)]],
    password: ['', [Validators.required, Validators.minLength(4)]],
    // Optional: an empty slug lets the gateway fall back to its own resolution.
    tenantSlug: ['', [tenantSlug]],
  });

  ngOnInit(): void {
    const sessionExpired = this.route.snapshot.queryParamMap.get('sessionExpired');
    if (sessionExpired === 'true') {
      this.sessionExpired.set(true);
    }
  }

  submit(): void {
    if (this.form.invalid || this.loading()) return;

    this.error.set(null);
    this.loading.set(true);

    const { username, password, tenantSlug } = this.form.getRawValue();
    const request: LoginRequest = { username, password };
    const slug = normalizeTenantSlug(tenantSlug);
    if (!this.hostTenantSlug() && slug) {
      request.tenantSlug = slug;
    }

    this.authService.login(request).subscribe({
      next: () => {
        this.loading.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/chat';
        const safeReturnUrl = returnUrl.startsWith('/') ? returnUrl : '/chat';
        this.router.navigateByUrl(safeReturnUrl);
      },
      error: err => {
        this.loading.set(false);
        const status = err?.status;
        // An unknown or inactive tenant answers the same 401 as bad credentials,
        // and is reported the same way — the form never confirms a tenant exists.
        if (status === 401 || status === 403) {
          this.error.set('AUTH.LOGIN.ERROR.INVALID_CREDENTIALS');
        } else if (status === 0) {
          this.error.set('AUTH.LOGIN.ERROR.NETWORK');
        } else {
          this.error.set('AUTH.LOGIN.ERROR.GENERIC');
        }
      },
    });
  }

  get usernameCtrl() { return this.form.controls.username; }
  get passwordCtrl() { return this.form.controls.password; }
  get tenantSlugCtrl() { return this.form.controls.tenantSlug; }
}
