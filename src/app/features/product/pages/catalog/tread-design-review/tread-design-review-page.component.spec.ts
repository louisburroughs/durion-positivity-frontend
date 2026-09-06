import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NEVER, of, throwError } from 'rxjs';
import { TreadDesignReviewPageComponent } from './tread-design-review-page.component';
import { ProductTreadDesignService } from '../../../services/product-tread-design.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { TreadDesignCandidate } from '../../../models/tread-design-enrichment.models';

const TREAD_DESIGN_ID = 'td-1';

const treadDesignServiceStub = {
  listCandidates: vi.fn(),
  resolve: vi.fn(),
};

const routerStub = {
  // Nav state captured at construction; overridden per test.
  getCurrentNavigation: vi.fn().mockReturnValue(null),
  navigate: vi.fn(),
};

const authServiceStub = {
  hasAnyRole: vi.fn().mockReturnValue(false),
};

describe('TreadDesignReviewPageComponent', () => {
  let fixture: ComponentFixture<TreadDesignReviewPageComponent>;
  let component: TreadDesignReviewPageComponent;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TreadDesignReviewPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ProductTreadDesignService, useValue: treadDesignServiceStub },
        { provide: Router, useValue: routerStub },
        { provide: AuthService, useValue: authServiceStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => TREAD_DESIGN_ID } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TreadDesignReviewPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.clearAllMocks();
    routerStub.getCurrentNavigation.mockReturnValue(null);
    authServiceStub.hasAnyRole.mockReturnValue(false);
  });

  describe('design metadata (router state)', () => {
    it('shows the design carried via router navigation state', async () => {
      routerStub.getCurrentNavigation.mockReturnValue({
        extras: { state: { treadDesign: { id: TREAD_DESIGN_ID, brand: 'Acme', matchState: 'REVIEW' } } },
      });
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));

      await setup();

      expect(component.design()).toEqual({ id: TREAD_DESIGN_ID, brand: 'Acme', matchState: 'REVIEW' });
    });

    it('degrades to null (design fields unavailable) on a direct navigation with no state', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));

      await setup();

      expect(component.design()).toBeNull();
    });
  });

  describe('candidates load', () => {
    it('loads every candidate for this design id on construction', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));

      await setup();

      expect(treadDesignServiceStub.listCandidates).toHaveBeenCalledWith(TREAD_DESIGN_ID);
    });

    it('transitions to empty when there are no candidates', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));

      await setup();

      expect(component.state()).toBe('empty');
    });

    it('transitions to ready with the mapped candidates', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(
        of([{ productId: 'prod-1', score: 0.91, tier: 'AUTO' }]),
      );

      await setup();

      expect(component.state()).toBe('ready');
      expect(component.candidates()).toEqual([{ productId: 'prod-1', score: 0.91, tier: 'AUTO' }]);
    });

    it('sets state to error before errorKey on failure (ADR-0031)', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(throwError(() => new Error('boom')));

      await setup();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('PRODUCT.CATALOG.ENRICHMENT.REVIEW.CANDIDATES.ERROR.LOAD');
    });
  });

  describe('candidates table checkbox ids (null productId)', () => {
    beforeEach(() => {
      authServiceStub.hasAnyRole.mockReturnValue(true);
    });

    it('renders unique ids and no checkbox for candidates with a null productId', async () => {
      const candidates: readonly TreadDesignCandidate[] = [
        { productId: null, score: 0.2, tier: 'NONE' },
        { productId: null, score: 0.1, tier: 'NONE' },
        { productId: 'prod-1', score: 0.91, tier: 'AUTO' },
      ];
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of(candidates));

      await setup();

      const checkboxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(1);
      expect((checkboxes[0] as HTMLInputElement).id).toBe('candidate-prod-1');

      const ids = Array.from(fixture.nativeElement.querySelectorAll('[id^="candidate-"]')).map(
        el => (el as HTMLElement).id,
      );
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('permission gating (catalog:tread_design:resolve)', () => {
    it('canResolve is false without ROLE_ADMIN', async () => {
      authServiceStub.hasAnyRole.mockReturnValue(false);
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));

      await setup();

      expect(component.canResolve()).toBe(false);
      expect(authServiceStub.hasAnyRole).toHaveBeenCalledWith(['ROLE_ADMIN']);
    });

    it('canResolve is true with an allowed role', async () => {
      authServiceStub.hasAnyRole.mockReturnValue(true);
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));

      await setup();

      expect(component.canResolve()).toBe(true);
    });

    it('disables noteControl/deferUntilControl for a non-admin', async () => {
      authServiceStub.hasAnyRole.mockReturnValue(false);
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));

      await setup();
      fixture.detectChanges();

      expect(component.noteControl.disabled).toBe(true);
      expect(component.deferUntilControl.disabled).toBe(true);
    });

    it('enables noteControl/deferUntilControl for ROLE_ADMIN', async () => {
      authServiceStub.hasAnyRole.mockReturnValue(true);
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));

      await setup();
      fixture.detectChanges();

      expect(component.noteControl.disabled).toBe(false);
      expect(component.deferUntilControl.disabled).toBe(false);
    });

    it('attach()/reject()/defer() are no-ops without the resolve permission', async () => {
      authServiceStub.hasAnyRole.mockReturnValue(false);
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));
      await setup();
      component.toggleCandidate('prod-1', true);

      component.attach();
      component.reject();
      component.defer();

      expect(treadDesignServiceStub.resolve).not.toHaveBeenCalled();
    });
  });

  describe('attach', () => {
    beforeEach(() => {
      authServiceStub.hasAnyRole.mockReturnValue(true);
    });

    it('is disabled (canAttach false) until at least one candidate is selected', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(
        of([{ productId: 'prod-1', score: 0.91, tier: 'AUTO' }]),
      );
      await setup();

      expect(component.canAttach()).toBe(false);

      component.toggleCandidate('prod-1', true);

      expect(component.canAttach()).toBe(true);
    });

    it('calls resolve with ATTACH and the selected product ids', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(
        of([{ productId: 'prod-1', score: 0.91, tier: 'AUTO' }]),
      );
      treadDesignServiceStub.resolve.mockReturnValueOnce(of({ id: TREAD_DESIGN_ID, matchState: 'MATCHED' }));
      await setup();
      component.toggleCandidate('prod-1', true);
      component.noteControl.setValue('Confirmed by phone');

      component.attach();

      expect(treadDesignServiceStub.resolve).toHaveBeenCalledWith(TREAD_DESIGN_ID, {
        action: 'ATTACH',
        productIds: ['prod-1'],
        note: 'Confirmed by phone',
      });
    });

    it('does nothing when no candidate is selected', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));
      await setup();

      component.attach();

      expect(treadDesignServiceStub.resolve).not.toHaveBeenCalled();
    });

    it('navigates back to the worklist on success', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(
        of([{ productId: 'prod-1', score: 0.91, tier: 'AUTO' }]),
      );
      treadDesignServiceStub.resolve.mockReturnValueOnce(of({ id: TREAD_DESIGN_ID }));
      await setup();
      component.toggleCandidate('prod-1', true);

      component.attach();

      expect(routerStub.navigate).toHaveBeenCalledWith(['/app/product/catalog/enrichment/unmatched']);
      expect(component.busyAction()).toBeNull();
    });

    it('sets busyAction to ATTACH while the request is in flight', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(
        of([{ productId: 'prod-1', score: 0.91, tier: 'AUTO' }]),
      );
      // Never emits/completes — used to observe the in-flight state.
      treadDesignServiceStub.resolve.mockReturnValueOnce(NEVER);
      await setup();
      component.toggleCandidate('prod-1', true);

      component.attach();

      expect(component.busyAction()).toBe('ATTACH');
    });
  });

  describe('reject', () => {
    beforeEach(() => {
      authServiceStub.hasAnyRole.mockReturnValue(true);
    });

    it('calls resolve with REJECT and no productIds, needing no selection', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));
      treadDesignServiceStub.resolve.mockReturnValueOnce(of({ id: TREAD_DESIGN_ID, matchState: 'REJECTED' }));
      await setup();

      component.reject();

      expect(treadDesignServiceStub.resolve).toHaveBeenCalledWith(TREAD_DESIGN_ID, {
        action: 'REJECT',
        note: undefined,
      });
    });
  });

  describe('defer', () => {
    beforeEach(() => {
      authServiceStub.hasAnyRole.mockReturnValue(true);
    });

    it('calls resolve with DEFER and the picked date converted to a local-midnight instant (ADR-0038)', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));
      treadDesignServiceStub.resolve.mockReturnValueOnce(of({ id: TREAD_DESIGN_ID, matchState: 'DEFERRED' }));
      await setup();
      component.deferUntilControl.setValue('2026-09-20');

      component.defer();

      expect(treadDesignServiceStub.resolve).toHaveBeenCalledWith(TREAD_DESIGN_ID, {
        action: 'DEFER',
        note: undefined,
        deferUntil: new Date(2026, 8, 20).toISOString(),
      });
    });

    it('omits deferUntil when no date was picked', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));
      treadDesignServiceStub.resolve.mockReturnValueOnce(of({ id: TREAD_DESIGN_ID, matchState: 'DEFERRED' }));
      await setup();

      component.defer();

      expect(treadDesignServiceStub.resolve).toHaveBeenCalledWith(TREAD_DESIGN_ID, {
        action: 'DEFER',
        note: undefined,
        deferUntil: undefined,
      });
    });
  });

  describe('resolve error handling', () => {
    beforeEach(() => {
      authServiceStub.hasAnyRole.mockReturnValue(true);
    });

    it('sets the conflict-specific inline errorKey on a 409 and clears busyAction', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));
      treadDesignServiceStub.resolve.mockReturnValueOnce(throwError(() => ({ status: 409 })));
      await setup();

      component.reject();

      expect(component.resolveErrorKey()).toBe('PRODUCT.CATALOG.ENRICHMENT.REVIEW.RESOLVE.ERROR.CONFLICT');
      expect(component.busyAction()).toBeNull();
      expect(routerStub.navigate).not.toHaveBeenCalled();
    });

    it('sets a not-found errorKey on a 404', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));
      treadDesignServiceStub.resolve.mockReturnValueOnce(throwError(() => ({ status: 404 })));
      await setup();

      component.reject();

      expect(component.resolveErrorKey()).toBe('PRODUCT.CATALOG.ENRICHMENT.REVIEW.RESOLVE.ERROR.NOT_FOUND');
    });

    it('sets an invalid-action errorKey on a 400', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));
      treadDesignServiceStub.resolve.mockReturnValueOnce(throwError(() => ({ status: 400 })));
      await setup();

      component.reject();

      expect(component.resolveErrorKey()).toBe('PRODUCT.CATALOG.ENRICHMENT.REVIEW.RESOLVE.ERROR.INVALID');
    });

    it('falls back to a generic submit errorKey on any other failure', async () => {
      treadDesignServiceStub.listCandidates.mockReturnValueOnce(of([]));
      treadDesignServiceStub.resolve.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      await setup();

      component.reject();

      expect(component.resolveErrorKey()).toBe('PRODUCT.CATALOG.ENRICHMENT.REVIEW.RESOLVE.ERROR.SUBMIT');
    });
  });
});
