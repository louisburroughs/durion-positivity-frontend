import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { AuthService } from '../../../../core/services/auth.service';
import { PEOPLE_PAGE, PEOPLE_SECTION } from '../../../../core/security/route-permissions';
import { safeMailtoHref } from '../../../../core/util/mailto-href';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { EmployeeRegisterService } from '../../services/employee-register.service';
import {
  EmployeeRegisterRow,
  EmploymentStatus,
  isSwitchableStatus,
} from '../../models/employee-register.models';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';
type StatusFilter = 'ALL' | EmploymentStatus;
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;

/**
 * One fetch backs the whole register. `searchEmployees` offers no status filter and no sort
 * (backend issue #2158), so filtering and ordering a *page* of results would silently describe
 * only that page. Fetching a generous slice and working over it client-side — the shape the
 * sibling People directory already uses — keeps the filter honest, and `truncated()` tells the
 * user when the tenant outgrew it.
 */
const FETCH_SIZE = 200;

const STATUS_FILTERS: readonly StatusFilter[] = ['ALL', 'ACTIVE', 'DISABLED', 'TERMINATED'];

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-employee-register-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, DecimalPipe, ModalDialogDirective],
  templateUrl: './employee-register-page.component.html',
  styleUrl: './employee-register-page.component.css',
})
export class EmployeeRegisterPageComponent implements OnInit {
  private readonly registerService = inject(EmployeeRegisterService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly translate = inject(TranslateService);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly searchInputValue = signal('');
  readonly statusFilter = signal<StatusFilter>('ALL');
  readonly sortDir = signal<SortDir>('asc');
  readonly pageIndex = signal(0);

  readonly allRows = signal<readonly EmployeeRegisterRow[]>([]);
  readonly totalElements = signal(0);

  /** Employee ids with a status write in flight; their switch is replaced by a busy label. */
  readonly pendingIds = signal<ReadonlySet<string>>(new Set());

  /**
   * A refused write belongs to the row that attempted it, not to the page (ADR-0063).
   *
   * Page-level `state`/`errorKey` is the READ outcome. Routing write failures through it let a
   * sibling row erase an unresolved refusal: a 409 on row A set the page to `error`, then a
   * success on row B re-read and settled it back to `ready` with `errorKey` null, so the
   * refusal for A vanished and its switch looked ordinary again.
   */
  readonly writeErrors = signal<ReadonlyMap<string, string>>(new Map());

  /**
   * True while a read is in flight. `allRows` deliberately holds the PREVIOUS result until the
   * new one settles, so during that window the row lookup in `confirmDeactivate` is looking at
   * data that may already be stale — it would find an ACTIVE row the in-flight read is about to
   * report as DISABLED. The confirm refuses in that window rather than writing on a guess
   * (ADR-0063); the dialog stays open and the accept re-enables when the read settles.
   */
  readonly readInFlight = signal(false);

  /** The row awaiting deactivate confirmation, or null (DECISION-PEOPLE-024). */
  readonly confirmRow = signal<EmployeeRegisterRow | null>(null);
  /**
   * The control that opened the confirm. Closing the dialog removes the focused element from
   * the DOM, so focus would otherwise fall to <body> and strand a keyboard user behind the
   * page (ADR-0029 §8.7). Captured on open, restored once the dialog has unmounted.
   */
  private confirmOpener: HTMLElement | null = null;
  /**
   * Set when a read disables the accept button out from under the keyboard. Disabling a focused
   * control drops focus to <body>, which inside a modal strands the user completely — so focus
   * is parked on Cancel first and handed back once the button is live again (ADR-0029 §8.7,
   * the same rule the dialog close obeys).
   */
  private acceptFocusParked = false;
  readonly assignmentEndDate = signal(toLocalIsoDate(new Date()));

  readonly statusFilters = STATUS_FILTERS;

  private readonly searchSubject = new Subject<string>();
  private loadSub: Subscription | null = null;
  /**
   * One subscription per employee. A single shared slot would let confirming a second row
   * unsubscribe the first — its handlers would never run, leaving that row's pending id set
   * and the switch busy forever (ADR-0063: one owner per independent writer).
   */
  private readonly writeSubs = new Map<string, Subscription>();
  /** ADR-0063: the read that owns the current result. Stale reads never write. */
  private readSeq = 0;

  // ── Write-control gating (ADR-0040 §6a) ─────────────────────────────────────────────
  // An unknown permission set (legacy token without `perm_bits`) allows the control; the
  // backend refuses independently. Each gate names the authority its destination declares.

  readonly canViewPii = computed(() => this.allows(PEOPLE_SECTION.registerPii));
  readonly canViewRoles = computed(() => this.allows(PEOPLE_SECTION.registerRoles));
  readonly canApproveTime = computed(() => this.allows(PEOPLE_SECTION.registerTime));
  readonly canViewLocations = computed(() => this.allows(PEOPLE_SECTION.registerLocations));
  readonly canDeactivate = computed(() => this.allows(PEOPLE_SECTION.registerDeactivate));
  readonly canCreate = computed(() => this.allows(PEOPLE_SECTION.registerCreate));
  /**
   * The forbidden state offers the People directory as a fallback, but that page declares a
   * different authority (`people-contact:person:view`) than this one. Without this gate the
   * fallback link leads straight to another refusal.
   */
  readonly canViewDirectory = computed(() => this.allows(PEOPLE_PAGE.directory));

  readonly filtered = computed<readonly EmployeeRegisterRow[]>(() => {
    const status = this.statusFilter();
    const rows = status === 'ALL' ? this.allRows() : this.allRows().filter(r => r.status === status);
    const dir = this.sortDir();
    return [...rows].sort((a, b) => {
      const cmp = (a.lastName ?? '').localeCompare(b.lastName ?? '');
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  /**
   * What the template renders. `state` is the READ outcome; the status filter runs
   * client-side (backend #2158), so a filter matching nothing has to show the empty panel —
   * and its clear-filters action — even though the read itself succeeded.
   */
  readonly viewState = computed<PageState>(() => {
    const readState = this.state();
    if (readState === 'ready' && this.filtered().length === 0) return 'empty';
    return readState;
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));

  readonly paged = computed<readonly EmployeeRegisterRow[]>(() => {
    const start = this.pageIndex() * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

  readonly activeCount = computed(() => this.allRows().filter(r => r.status === 'ACTIVE').length);

  /** True when the tenant has more employees than one fetch returned — see #2158. */
  readonly truncated = computed(() => this.totalElements() > this.allRows().length);

  /**
   * `allRows` and `totalElements` keep the last successful response while a new read runs or
   * fails, so the truncation notice is shown only alongside the data it describes. Otherwise a
   * 403 or a failed search would carry stale counts above the panel explaining the failure
   * (ADR-0064).
   */
  readonly showTruncationNotice = computed(
    () => this.truncated() && (this.viewState() === 'ready' || this.viewState() === 'empty'),
  );

  ngOnInit(): void {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pageIndex.set(0);
        this.load();
      });

    this.load();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchInputValue.set(value);
    this.searchSubject.next(value);
  }

  clearFilters(): void {
    this.searchInputValue.set('');
    this.statusFilter.set('ALL');
    this.pageIndex.set(0);
    this.load();
  }

  setStatusFilter(status: StatusFilter): void {
    this.statusFilter.set(status);
    this.pageIndex.set(0);
  }

  toggleSort(): void {
    this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    this.pageIndex.set(0);
  }

  ariaSort(): 'ascending' | 'descending' {
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  reload(): void {
    // A user-initiated reload is a fresh look at everything, so stale per-row refusals go with
    // it. A read triggered by a write does NOT clear them — that is the bug above.
    this.writeErrors.set(new Map());
    this.load();
  }

  prevPage(): void {
    if (this.pageIndex() > 0) this.pageIndex.update(p => p - 1);
  }

  nextPage(): void {
    if (this.pageIndex() < this.totalPages() - 1) this.pageIndex.update(p => p + 1);
  }

  /**
   * Both name fields are nullable, and an empty string here does not just leave the cell blank:
   * it is interpolated into every one of the row's accessible names, giving "Profile for " and
   * "Deactivate  (Active)" — controls a screen-reader user cannot tell apart (ADR-0029 §8).
   * The employee number identifies the row when the name cannot; the localized fallback covers
   * a row that has neither.
   */
  displayName(row: EmployeeRegisterRow): string {
    const last = row.lastName?.trim();
    const first = row.firstName?.trim();
    if (last && first) return `${last}, ${first}`;
    const name = last || first || row.employeeNumber?.trim();
    return name || this.translate.instant('PEOPLE.EMPLOYEE_REGISTER.UNNAMED');
  }

  /** ADR-0065 §2 — shared with the people directory (#306); null renders as plain text. */
  mailtoHref(email: string | null | undefined): string | null {
    return safeMailtoHref(email);
  }

  isPending(row: EmployeeRegisterRow): boolean {
    return this.pendingIds().has(row.employeeId);
  }

  /** The i18n key for this row's last refused write, or null. */
  writeErrorFor(row: EmployeeRegisterRow): string | null {
    return this.writeErrors().get(row.employeeId) ?? null;
  }

  /**
   * The switch is offered only for a row the viewer may change *and* whose status it can
   * legally move (DECISION-PEOPLE-001). `ENABLE` has no endpoint yet (backend issue #2156),
   * so a DISABLED row renders a read-only badge rather than a control that cannot work.
   *
   * When the backend publishes `allowedActions` (#2159) that list NARROWS this — it never
   * replaces the status reasoning. The lifecycle guard below is load-bearing: without it a
   * stale or malformed `['DISABLE']` on a DISABLED row would offer the switch again and send
   * a second disable. Do not remove it when the capability list lands.
   */
  canSwitch(row: EmployeeRegisterRow): boolean {
    if (this.isPending(row)) return false;
    // Every gate below only ever NARROWS. The permission is independent and always applies
    // (ADR-0040 §6a), and so is the lifecycle rule: a stale or malformed `['DISABLE']` on a
    // DISABLED row must not resurrect a deactivate switch and send the request again.
    // `allowedActions` is a rendering hint from the server (backend #2159), not authority.
    if (!this.canDeactivate()) return false;
    if (!isSwitchableStatus(row.status) || row.status !== 'ACTIVE') return false;
    if (row.allowedActions) return row.allowedActions.includes('DISABLE');
    return true;
  }

  /**
   * PII is gated per row, not only per caller. The permission is still required, and where
   * the projection publishes `allowedActions` (backend #2159) an absent `VIEW_PII` withholds
   * this row's contact details and profile link — the server list narrows, never widens.
   */
  canViewPiiFor(row: EmployeeRegisterRow): boolean {
    if (!this.canViewPii()) return false;
    if (row.allowedActions) return row.allowedActions.includes('VIEW_PII');
    return true;
  }

  openConfirm(row: EmployeeRegisterRow): void {
    if (!this.canSwitch(row)) return; // re-checked at click time, not only at the control
    this.assignmentEndDate.set(toLocalIsoDate(new Date()));
    const active = this.document.activeElement;
    this.confirmOpener = active instanceof HTMLElement ? active : null;
    this.confirmRow.set(row);
  }

  cancelConfirm(): void {
    this.closeConfirm();
  }

  /**
   * Closes the dialog and hands focus back. The `@if` removes the dialog during the next
   * change detection, so the restore is deferred past it. After a confirm the row's switch is
   * itself replaced by the pending label, so an opener that is no longer connected falls back
   * to the search field — a stable control at the top of the page.
   */
  private closeConfirm(): void {
    this.acceptFocusParked = false;
    const opener = this.confirmOpener;
    this.confirmOpener = null;
    this.confirmRow.set(null);
    setTimeout(() => {
      if (opener?.isConnected) {
        opener.focus();
        return;
      }
      this.document.getElementById('register-search-input')?.focus();
    });
  }

  onEndDateInput(event: Event): void {
    this.assignmentEndDate.set((event.target as HTMLInputElement).value);
  }

  confirmDeactivate(): void {
    const snapshot = this.confirmRow();
    const endDate = this.assignmentEndDate();
    if (!snapshot || !endDate) return;

    // The dialog holds a SNAPSHOT taken when it opened, and a debounced search issued before
    // the click can settle while it is open — replacing the rows underneath it. Re-checking
    // the snapshot would then let a disable go out against a row the latest read already
    // shows as DISABLED, sending the write a second time. Gate on the current row instead,
    // and stand down if the read no longer has it (ADR-0063).
    // Refuse while a read is settling: the lookup below would be answered from the previous
    // result. The dialog stays open and the accept button is disabled, so the click is not
    // lost — it just waits for the page to agree with the server.
    if (this.readInFlight()) return;

    const row = this.allRows().find(r => r.employeeId === snapshot.employeeId);
    if (!row || !this.canSwitch(row)) {
      this.closeConfirm();
      return;
    }

    this.closeConfirm();
    this.markPending(row.employeeId, true);

    this.writeSubs.get(row.employeeId)?.unsubscribe();
    const sub = this.registerService
      .disableEmployee(row.employeeId, endDate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.writeSubs.delete(row.employeeId);
          this.markPending(row.employeeId, false);
          this.setWriteError(row.employeeId, null);
          // Re-read rather than patching locally: the disable runs a saga
          // (DECISION-PEOPLE-002) and the server is the only authority on the settled status.
          this.load();
        },
        error: (err: unknown) => {
          this.writeSubs.delete(row.employeeId);
          this.markPending(row.employeeId, false);
          const conflict = err instanceof HttpErrorResponse && err.status === 409;
          this.setWriteError(
            row.employeeId,
            conflict
              ? 'PEOPLE.EMPLOYEE_REGISTER.ERROR.CONFLICT'
              : 'PEOPLE.EMPLOYEE_REGISTER.ERROR.DEACTIVATE',
          );
          // DECISION-PEOPLE-017: a conflict means this row moved under us, so re-read to show
          // what the server actually holds. Safe to do now that the refusal lives on the row —
          // when it was page-level, a re-read settled the page back to `ready` and took the
          // explanation with it, which is why this used to wait for the user to select Retry.
          if (conflict) this.load();
        },
      });
    this.writeSubs.set(row.employeeId, sub);
  }

  private allows(permissions: readonly string[]): boolean {
    return !this.auth.permissionsKnown() || this.auth.hasAnyPermission(permissions);
  }

  /**
   * Moves focus off the accept button before a read disables it. Only acts when that button is
   * the focused element — a read while the user is typing a date, or not in the dialog at all,
   * must not steal focus from where they are.
   */
  private parkAcceptFocus(): void {
    if (!this.confirmRow()) return;
    const accept = this.document.querySelector<HTMLElement>('.confirm-dialog__accept');
    if (!accept || this.document.activeElement !== accept) return;
    this.document.querySelector<HTMLElement>('.confirm-dialog__cancel')?.focus();
    this.acceptFocusParked = true;
  }

  /**
   * Hands focus back once the read has settled and the button is enabled again — but only if
   * the user has not moved in the meantime. The park is guarded on where focus is; the handback
   * has to be too, or a reader who tabbed into the date field while the read was in flight gets
   * the cursor pulled out from under them on settle (ADR-0029 §8.7).
   */
  private restoreAcceptFocus(): void {
    if (!this.acceptFocusParked) return;
    this.acceptFocusParked = false;
    if (!this.confirmRow()) return;
    const parkedOn = this.document.querySelector<HTMLElement>('.confirm-dialog__cancel');
    const active = this.document.activeElement;
    if (active !== parkedOn && active !== this.document.body && active !== null) return;
    // The binding re-enables on the next change detection, and focus() is a no-op on a
    // disabled control, so the handback waits for it.
    setTimeout(() => {
      const accept = this.document.querySelector<HTMLButtonElement>('.confirm-dialog__accept');
      if (accept && !accept.disabled) accept.focus();
    });
  }

  /**
   * Closes an open confirm only when the read that just settled actually invalidated ITS row.
   *
   * Closing on every read start was the wider version of this guard: `load()` also runs after a
   * successful write, so disabling row A tore down a dialog the user had since opened for row B.
   * A read that leaves B switchable is no reason to interrupt them; one that disables or removes
   * B is. `confirmDeactivate` re-checks the current row regardless, so this is about not
   * interrupting the user rather than about safety.
   */
  private dismissConfirmIfInvalidated(): void {
    const open = this.confirmRow();
    if (!open) return;
    const current = this.allRows().find(r => r.employeeId === open.employeeId);
    if (!current || !this.canSwitch(current)) this.closeConfirm();
  }

  private setWriteError(employeeId: string, key: string | null): void {
    const next = new Map(this.writeErrors());
    if (key) next.set(employeeId, key);
    else next.delete(employeeId);
    this.writeErrors.set(next);
  }

  private markPending(employeeId: string, pending: boolean): void {
    const next = new Set(this.pendingIds());
    if (pending) next.add(employeeId);
    else next.delete(employeeId);
    this.pendingIds.set(next);
  }

  private load(): void {
    this.loadSub?.unsubscribe();
    const seq = ++this.readSeq;

    this.readInFlight.set(true);
    this.parkAcceptFocus();
    this.state.set('loading');
    this.errorKey.set(null);

    const query = this.searchInputValue().trim();

    this.loadSub = this.registerService
      .searchEmployees(query || undefined, FETCH_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => {
          if (seq !== this.readSeq) return; // superseded read — never writes
          this.readInFlight.set(false);
          this.restoreAcceptFocus();
          this.allRows.set(page.rows);
          this.totalElements.set(page.totalElements);
          // A re-read after a write can return fewer rows than the current page starts at —
          // disabling the only row on page 2 leaves pageIndex past the end, and `paged()`
          // would slice an empty window out of a `ready` page.
          const lastPage = this.totalPages() - 1;
          if (this.pageIndex() > lastPage) this.pageIndex.set(lastPage);
          this.state.set(page.rows.length ? 'ready' : 'empty');
          this.errorKey.set(null);
          this.dismissConfirmIfInvalidated();
        },
        error: (err: unknown) => {
          if (seq !== this.readSeq) return;
          this.readInFlight.set(false);
          // A failed read replaces the table with a panel, so any open confirm is floating
          // over rows that are no longer shown.
          if (this.confirmRow()) this.closeConfirm();
          if (err instanceof HttpErrorResponse && err.status === 403) {
            this.state.set('forbidden');
            this.errorKey.set(null);
            return;
          }
          this.state.set('error'); // ADR-0031 §1 — state always before errorKey
          this.errorKey.set('PEOPLE.EMPLOYEE_REGISTER.ERROR.LOAD');
        },
      });
  }
}
