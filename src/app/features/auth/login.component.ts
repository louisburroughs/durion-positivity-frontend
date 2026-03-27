import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  private readonly fb          = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router      = inject(Router);
  private readonly route       = inject(ActivatedRoute);
  readonly themeService        = inject(ThemeService);

  readonly loading = signal(false);
  readonly error   = signal<string | null>(null);
  readonly sessionExpired = signal(false);

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(2)]],
    password: ['', [Validators.required, Validators.minLength(4)]],
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

    const { username, password } = this.form.getRawValue();

    this.authService.login({ username, password }).subscribe({
      next: () => {
        this.loading.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/app';
        const safeReturnUrl = returnUrl.startsWith('/') ? returnUrl : '/app';
        this.router.navigateByUrl(safeReturnUrl);
      },
      error: err => {
        this.loading.set(false);
        const status = err?.status;
        if (status === 401 || status === 403) {
          this.error.set('Invalid username or password. Please try again.');
        } else if (status === 0) {
          this.error.set('Cannot reach the server. Check your network or try again later.');
        } else {
          this.error.set(`Login failed (${status ?? 'unknown error'}). Please try again.`);
        }
      },
    });
  }

  get usernameCtrl() { return this.form.controls.username; }
  get passwordCtrl() { return this.form.controls.password; }
}
