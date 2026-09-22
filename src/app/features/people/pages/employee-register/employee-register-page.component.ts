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
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { AuthService } from '../../../../core/services/auth.service';
import { PEOPLE_SECTION } from '../../../../core/security/route-permissions';
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
  imports: [RouterLink, TranslatePipe, ModalDialogDirective],
  templateUrl: './employee-register-page.component.html',
  styleUrl: './employee-register-page.component.css',
})
export class EmployeeRegisterPageComponent implements OnInit {
  private readonly registerService = inject(EmployeeRegisterService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

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

  /** The row awaiting deactivate confirmation, or null (DECISION-PEOPLE-024). */
  readonly confirmRow = signal<EmployeeRegisterRow | null>(null);
  readonly assignmentEndDate = signal(toLocalIsoDate(new Date()));

  readonly statusFilters = STATUS_FILTERS;

  private readonly searchSubject = new Subject<string>();
  private loadSub: Subscription | null = null;
  private writeSub: Subscription | null = null;
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

  readonly filtered = computed<readonly EmployeeRegisterRow[]>(() => {
    const status = this.statusFilter();
    const rows = status === 'ALL' ? this.allRows() : this.allRows().filter(r => r.status === status);
    const dir = this.sortDir();
    return [...rows].sort((a, b) => {
      const cmp = (a.lastName ?? '').localeCompare(b.lastName ?? '');
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));

  readonly paged = computed<readonly EmployeeRegisterRow[]>(() => {
    const start = this.pageIndex() * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

  readonly activeCount = computed(() => this.allRows().filter(r => r.status === 'ACTIVE').length);

  /** True when the tenant has more employees than one fetch returned — see #2158. */
  readonly truncated = computed(() => this.totalElements() > this.allRows().length);

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
    this.load();
  }

  prevPage(): void {
    if (this.pageIndex() > 0) this.pageIndex.update(p => p - 1);
  }

  nextPage(): void {
    if (this.pageIndex() < this.totalPages() - 1) this.pageIndex.update(p => p + 1);
  }

  displayName(row: EmployeeRegisterRow): string {
    const last = row.lastName?.trim();
    const first = row.firstName?.trim();
    if (last && first) return `${last}, ${first}`;
    return last || first || '';
  }

  isPending(row: EmployeeRegisterRow): boolean {
    return this.pendingIds().has(row.employeeId);
  }

  /**
   * The switch is offered only for a row the viewer may change *and* whose status it can
   * legally move (DECISION-PEOPLE-001). `ENABLE` has no endpoint yet (backend issue #2156),
   * so a DISABLED row renders a read-only badge rather than a control that cannot work.
   *
   * When the backend publishes `allowedActions` (#2159) that list wins outright, and this
   * status reasoning drops out.
   */
  canSwitch(row: EmployeeRegisterRow): boolean {
    if (this.isPending(row)) return false;
    if (row.allowedActions) return row.allowedActions.includes('DISABLE');
    return this.canDeactivate() && isSwitchableStatus(row.status) && row.status === 'ACTIVE';
  }

  openConfirm(row: EmployeeRegisterRow): void {
    if (!this.canSwitch(row)) return; // re-checked at click time, not only at the control
    this.assignmentEndDate.set(toLocalIsoDate(new Date()));
    this.confirmRow.set(row);
  }

  cancelConfirm(): void {
    this.confirmRow.set(null);
  }

  onEndDateInput(event: Event): void {
    this.assignmentEndDate.set((event.target as HTMLInputElement).value);
  }

  confirmDeactivate(): void {
    const row = this.confirmRow();
    const endDate = this.assignmentEndDate();
    if (!row || !endDate) return;
    if (!this.canSwitch(row)) {
      this.confirmRow.set(null);
      return;
    }

    this.confirmRow.set(null);
    this.markPending(row.employeeId, true);

    this.writeSub?.unsubscribe();
    this.writeSub = this.registerService
      .disableEmployee(row.employeeId, endDate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.markPending(row.employeeId, false);
          // Re-read rather than patching locally: the disable runs a saga
          // (DECISION-PEOPLE-002) and the server is the only authority on the settled status.
          this.load();
        },
        error: (err: unknown) => {
          this.markPending(row.employeeId, false);
          this.state.set('error'); // ADR-0031 §1 — state always before errorKey
          this.errorKey.set(
            err instanceof HttpErrorResponse && err.status === 409
              ? 'PEOPLE.EMPLOYEE_REGISTER.ERROR.CONFLICT'
              : 'PEOPLE.EMPLOYEE_REGISTER.ERROR.DEACTIVATE',
          );
        },
      });
  }

  private allows(permissions: readonly string[]): boolean {
    return !this.auth.permissionsKnown() || this.auth.hasAnyPermission(permissions);
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

    this.state.set('loading');
    this.errorKey.set(null);

    const query = this.searchInputValue().trim();

    this.loadSub = this.registerService
      .searchEmployees(query || undefined, FETCH_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => {
          if (seq !== this.readSeq) return; // superseded read — never writes
          this.allRows.set(page.rows);
          this.totalElements.set(page.totalElements);
          this.state.set(page.rows.length ? 'ready' : 'empty');
          this.errorKey.set(null);
        },
        error: (err: unknown) => {
          if (seq !== this.readSeq) return;
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
