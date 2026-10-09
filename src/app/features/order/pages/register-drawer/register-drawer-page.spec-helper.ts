import { HttpErrorResponse } from '@angular/common/http';
import { WritableSignal, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { CashMovementApprovalRequest, CashMovementRequest } from '@durion-sdk/order';
import { Observable, of } from 'rxjs';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../core/services/auth.service';
import { DRAWER_CLOCK } from '../../components/drawer-movement-dialog/drawer-movement-dialog.component';
import {
  DrawerApproval,
  DrawerMovement,
  DrawerOptions,
  DrawerSession,
} from '../../models/register-drawer.models';
import { RegisterSessionService } from '../../services/register-session.service';
import { RegisterDrawerPageComponent } from './register-drawer-page.component';

export const SESSION_ID = '018f2a6e-0000-7000-8000-00000000a001';
export const OTHER_SESSION_ID = '018f2a6e-0000-7000-8000-00000000a002';
export const CLERK_ID = '018f2a6e-0000-7000-8000-00000000c001';
export const APPROVER_ID = '018f2a6e-0000-7000-8000-00000000c003';
export const VENDOR_ID = '018f2a6e-0000-7000-8000-00000000v001';
/** The fixed instant the dialog reads for token expiry. */
export const NOW = new Date('2026-10-07T14:00:00Z');

/** Every permission the drawer gates on (CAP:550 S22). */
export const ALL_DRAWER_PERMISSIONS = ['order:session:view', 'order:session:cash_movement'] as const;

/** An OPEN drawer stamped in CAD, so no amount can pass by falling back to USD (ADR-0067 PC-14). */
export const openSession: DrawerSession = {
  sessionId: SESSION_ID,
  terminalId: 'DEFAULT',
  status: 'OPEN',
  openedAt: '2026-10-07T13:00:00Z',
  openingFloat: 150,
  currencyCode: 'CAD',
};

export const closingSession: DrawerSession = { ...openSession, status: 'CLOSING' };

export const pettyMovement: DrawerMovement = {
  movementId: 'mv-1',
  occurredAt: '2026-10-07T13:30:00Z',
  reason: 'PETTY_EXPENSE',
  movementType: 'PAID_OUT',
  amount: 12.5,
  currencyCode: 'CAD',
  categoryCode: 'OFFICE',
  note: 'Printer paper',
  receiptReference: 'R-100',
  clerkId: CLERK_ID,
  approvedBy: APPROVER_ID,
};

/** A reason code this build does not know: it reads Unknown and is never offered. */
export const unknownMovement: DrawerMovement = {
  movementId: 'mv-2',
  occurredAt: '2026-10-07T13:40:00Z',
  reason: 'CUSTOMER_REFUND',
  movementType: 'PAID_OUT',
  amount: 5,
  currencyCode: 'CAD',
  clerkId: CLERK_ID,
};

export const vendorMovement: DrawerMovement = {
  movementId: 'mv-3',
  occurredAt: '2026-10-07T13:50:00Z',
  reason: 'VENDOR_COD',
  movementType: 'PAID_OUT',
  amount: 40,
  currencyCode: 'CAD',
  vendorId: VENDOR_ID,
  clerkId: CLERK_ID,
};

export const drawerOptions: DrawerOptions = {
  sessionId: SESSION_ID,
  currencyCode: 'CAD',
  reasons: [
    {
      reason: 'PETTY_EXPENSE',
      direction: 'PAID_OUT',
      allowedNow: true,
      cashierLimit: 50,
      alwaysNeedsManager: false,
      requiredFields: ['categoryCode', 'receiptReference', 'note'],
    },
    {
      reason: 'VENDOR_COD',
      direction: 'PAID_OUT',
      allowedNow: false,
      cashierLimit: null,
      alwaysNeedsManager: false,
      requiredFields: ['vendorId'],
    },
    {
      reason: 'BANK_DROP',
      direction: 'PAID_OUT',
      allowedNow: true,
      cashierLimit: null,
      alwaysNeedsManager: false,
      requiredFields: ['bagNumber'],
    },
    {
      reason: 'FLOAT_INCREASE',
      direction: 'PAID_IN',
      allowedNow: true,
      cashierLimit: null,
      alwaysNeedsManager: true,
      requiredFields: [],
    },
    {
      reason: 'FLOAT_DECREASE',
      direction: 'PAID_OUT',
      allowedNow: true,
      cashierLimit: null,
      alwaysNeedsManager: true,
      requiredFields: [],
    },
  ],
  categories: [
    { code: 'OFFICE', label: 'Office supplies', examples: 'Pens, paper, printer ink', offeredRegimes: [] },
    { code: 'CLEANING', label: 'Cleaning', examples: null, offeredRegimes: [] },
  ],
  evidenceRule: null,
};

/** The same options with one reason's `allowedNow` replaced. */
export function withAllowed(options: DrawerOptions, reason: string, allowedNow: boolean): DrawerOptions {
  return {
    ...options,
    reasons: options.reasons.map(option => (option.reason === reason ? { ...option, allowedNow } : option)),
  };
}

export const approval: DrawerApproval = { approvalToken: 'approval-token-1', expiresAt: '2026-10-07T14:05:00Z' };

export function refusal(status: number, code?: string, fields: readonly string[] = []): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: code
      ? { code, message: 'refused', status, fieldErrors: fields.map(field => ({ field, message: 'bad' })) }
      : null,
  });
}

export interface DrawerMocks {
  currentSession: ReturnType<typeof vi.fn<(terminalId: string) => Observable<DrawerSession | null>>>;
  movements: ReturnType<typeof vi.fn<(sessionId: string) => Observable<DrawerMovement[]>>>;
  options: ReturnType<typeof vi.fn<(sessionId: string) => Observable<DrawerOptions>>>;
  recordMovement: ReturnType<
    typeof vi.fn<(sessionId: string, request: CashMovementRequest) => Observable<DrawerMovement>>
  >;
  requestApproval: ReturnType<
    typeof vi.fn<(sessionId: string, request: CashMovementApprovalRequest) => Observable<DrawerApproval>>
  >;
}

/** Auth calls the drawer must never make (AW31): no manager sign-in, refresh or sign-out. */
export interface AuthSpies {
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  logoutWithRedirect: ReturnType<typeof vi.fn>;
  refreshTokens: ReturnType<typeof vi.fn>;
  validateSessionOnResume: ReturnType<typeof vi.fn>;
}

export interface DrawerHarness {
  fixture: ComponentFixture<RegisterDrawerPageComponent>;
  component: RegisterDrawerPageComponent;
  root: HTMLElement;
  mocks: DrawerMocks;
  auth: AuthSpies;
  /** The caller's granted codes; null models a token without perm_bits. */
  granted: WritableSignal<ReadonlySet<string> | null>;
  /** The caller's `sub` and tenant, driving the ADR-0063 §7 identity reset. */
  identity: WritableSignal<{ readonly sub: string; readonly tenant: string }>;
  render(): void;
  q<T extends Element = HTMLElement>(testId: string): T | null;
  all<T extends Element = HTMLElement>(testId: string): T[];
}

export interface DrawerSetup {
  readonly permissions?: readonly string[] | null;
  readonly session?: DrawerSession | null;
  readonly movements?: DrawerMovement[];
  readonly options?: DrawerOptions;
  /** Adjusts the read mocks before the page is created (its first reads run in the constructor). */
  readonly before?: (mocks: DrawerMocks) => void;
  /** The locale bundle to render with; en-US by default. */
  readonly locale?: { readonly name: string; readonly bundle: unknown };
}

/** Renders the drawer page over mocked reads with the real en-US copy. */
export function renderDrawer(setup: DrawerSetup = {}): DrawerHarness {
  const permissions = setup.permissions === undefined ? ALL_DRAWER_PERMISSIONS : setup.permissions;
  const granted = signal<ReadonlySet<string> | null>(permissions ? new Set(permissions) : null);
  const identity = signal({ sub: 'cashier-1', tenant: 'tenant-1' });
  const session = setup.session === undefined ? openSession : setup.session;
  const mocks: DrawerMocks = {
    currentSession: vi.fn<(terminalId: string) => Observable<DrawerSession | null>>().mockReturnValue(of(session)),
    movements: vi
      .fn<(sessionId: string) => Observable<DrawerMovement[]>>()
      .mockReturnValue(of(setup.movements ?? [pettyMovement])),
    options: vi
      .fn<(sessionId: string) => Observable<DrawerOptions>>()
      .mockReturnValue(of(setup.options ?? drawerOptions)),
    recordMovement: vi.fn<(sessionId: string, request: CashMovementRequest) => Observable<DrawerMovement>>(),
    requestApproval: vi.fn<(sessionId: string, request: CashMovementApprovalRequest) => Observable<DrawerApproval>>(),
  };
  const auth: AuthSpies = {
    login: vi.fn(),
    logout: vi.fn(),
    logoutWithRedirect: vi.fn(),
    refreshTokens: vi.fn(),
    validateSessionOnResume: vi.fn(),
  };

  TestBed.configureTestingModule({
    imports: [RegisterDrawerPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: RegisterSessionService, useValue: mocks },
      { provide: DRAWER_CLOCK, useValue: () => NOW },
      {
        provide: AuthService,
        useValue: {
          ...auth,
          currentUserClaims: computed(() => ({ sub: identity().sub })),
          tenantId: computed(() => identity().tenant),
          permissionsKnown: () => granted() !== null,
          hasPermission: (code: string) => granted()?.has(code) ?? false,
          hasAnyPermission: (codes: readonly string[]) => codes.some(code => granted()?.has(code) ?? false),
          hasAnyRole: () => false,
        },
      },
    ],
  });

  const translate = TestBed.inject(TranslateService);
  const locale = setup.locale ?? { name: 'en-US', bundle: enUS };
  translate.setTranslation(locale.name, locale.bundle as TranslationObject);
  translate.use(locale.name);

  setup.before?.(mocks);
  const fixture = TestBed.createComponent(RegisterDrawerPageComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;

  return {
    fixture,
    component: fixture.componentInstance,
    root,
    mocks,
    auth,
    granted,
    identity,
    render: () => fixture.detectChanges(),
    q: <T extends Element = HTMLElement>(testId: string) => root.querySelector<T>(`[data-testid="${testId}"]`),
    all: <T extends Element = HTMLElement>(testId: string) =>
      Array.from(root.querySelectorAll<T>(`[data-testid="${testId}"]`)),
  };
}

export function text(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function click(h: DrawerHarness, testId: string): void {
  const element = h.q<HTMLElement>(testId);
  if (!element) {
    throw new Error(`nothing rendered at ${testId}`);
  }
  element.click();
  h.render();
}

/** Types into an input (or picks a select option) the way a cashier would. */
export function type(h: DrawerHarness, testId: string, value: string): void {
  const element = h.q<HTMLInputElement | HTMLSelectElement>(testId);
  if (!element) {
    throw new Error(`no field rendered at ${testId}`);
  }
  element.value = value;
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input'));
  h.render();
}

/** The offered reasons, in order. */
export function offered(h: DrawerHarness): string[] {
  return Array.from(h.root.querySelectorAll<HTMLInputElement>('input[name="drawer-reason"]')).map(input => input.value);
}

/** Opens Pay out, picks a petty expense and fills every field. */
export function fillPettyExpense(h: DrawerHarness, amount = '12.50'): void {
  if (!h.q('drawer-dialog')) {
    click(h, 'drawer-pay-out');
  }
  click(h, 'drawer-reason-PETTY_EXPENSE');
  type(h, 'drawer-category', 'OFFICE');
  type(h, 'drawer-amount', amount);
  type(h, 'drawer-note', 'Printer paper');
  type(h, 'drawer-receipt-reference', 'R-200');
}

export function recordButton(h: DrawerHarness): HTMLButtonElement {
  const button = h.q<HTMLButtonElement>('drawer-record');
  if (!button) {
    throw new Error('no Record button rendered');
  }
  return button;
}

export async function flush(h: DrawerHarness): Promise<void> {
  await new Promise(resolve => setTimeout(resolve));
  h.render();
}
