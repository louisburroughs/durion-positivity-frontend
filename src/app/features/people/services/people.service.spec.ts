import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { PeopleService } from './people.service';

// ── Story #153: RBAC Role & Scope Assignment ─────────────────────────────────
//
// RED: These tests target service methods that do NOT yet exist on PeopleService.
// Expected compile-time errors:
//   TS2339: Property 'getRoles' does not exist on type 'PeopleService'
//   TS2339: Property 'getAssignments' does not exist on type 'PeopleService'
//   TS2339: Property 'createAssignment' does not exist on type 'PeopleService'
//   TS2339: Property 'revokeAssignment' does not exist on type 'PeopleService'

describe('PeopleService — RBAC Role & Scope Assignment [Story #153]', () => {
  let service: PeopleService;

  const apiStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    deleteWithBody: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PeopleService,
        { provide: ApiBaseService, useValue: apiStub },
      ],
    });
    service = TestBed.inject(PeopleService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // ── getRoles() ──────────────────────────────────────────────────────────────

  describe('getRoles()', () => {
    it('calls GET /v1/people/{personUuid}/access/roles', () => {
      apiStub.get.mockReturnValueOnce(of([{ code: 'ROLE_ADMIN' }]));

      (service as any).getRoles('person-uuid-1').subscribe();

      expect(apiStub.get).toHaveBeenCalledWith('/v1/people/person-uuid-1/access/roles');
    });

    it('returns the roles array as an Observable', () => {
      const roles = [{ code: 'ROLE_MANAGER' }, { code: 'ROLE_VIEW' }];
      apiStub.get.mockReturnValueOnce(of(roles));

      let result: unknown;
      (service as any).getRoles('person-uuid-2').subscribe((r: unknown) => (result = r));

      expect(result).toEqual(roles);
    });

    it('interpolates personUuid into the path correctly', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      (service as any).getRoles('abc-def-123').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/v1/people/abc-def-123/access/roles');
    });
  });

  // ── getAssignments() ────────────────────────────────────────────────────────

  describe('getAssignments()', () => {
    it('calls GET /v1/people/staffing/assignments with personId param', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      (service as any).getAssignments('person-id-1').subscribe();

      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/v1/people/staffing/assignments');
      expect(params.get('personId')).toBe('person-id-1');
    });

    it('does NOT include includeHistory param when argument is omitted', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      (service as any).getAssignments('person-id-1').subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect(params.get('includeHistory')).toBeNull();
    });

    it('sets includeHistory=true in params when passed as true', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      (service as any).getAssignments('person-id-1', true).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect(params.get('includeHistory')).toBe('true');
    });

    it('sets includeHistory=false in params when passed as false', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      (service as any).getAssignments('person-id-1', false).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect(params.get('includeHistory')).toBe('false');
    });

    it('returns the assignments array as an Observable', () => {
      const assignments = [{ assignmentId: 'asn-1', roleCode: 'ROLE_ADMIN' }];
      apiStub.get.mockReturnValueOnce(of(assignments));

      let result: unknown;
      (service as any).getAssignments('person-id-42').subscribe((r: unknown) => (result = r));

      expect(result).toEqual(assignments);
    });
  });

  // ── createAssignment() ──────────────────────────────────────────────────────

  describe('createAssignment()', () => {
    const globalBody = {
      personId: 'person-id-1',
      roleCode: 'ROLE_ADMIN',
      scopeType: 'GLOBAL',
      effectiveStartAt: '2026-01-01T00:00:00Z',
    };

    it('calls POST /v1/people/staffing/assignments with body', () => {
      apiStub.post.mockReturnValueOnce(of({ assignmentId: 'asn-1' }));

      (service as any).createAssignment(globalBody).subscribe();

      expect(apiStub.post).toHaveBeenCalledWith(
        '/v1/people/staffing/assignments',
        globalBody,
        undefined,
      );
    });

    it('forwards Idempotency-Key header when key is provided', () => {
      const locationBody = {
        personId: 'person-id-2',
        roleCode: 'ROLE_MANAGER',
        scopeType: 'LOCATION',
        locationId: 'loc-1',
        effectiveStartAt: '2026-01-01T00:00:00Z',
      };
      apiStub.post.mockReturnValueOnce(of({ assignmentId: 'asn-2' }));

      (service as any).createAssignment(locationBody, 'idem-key-abc').subscribe();

      expect(apiStub.post).toHaveBeenCalledWith(
        '/v1/people/staffing/assignments',
        locationBody,
        { headers: { 'Idempotency-Key': 'idem-key-abc' } },
      );
    });

    it('passes undefined options when idempotencyKey is omitted', () => {
      apiStub.post.mockReturnValueOnce(of({}));

      (service as any).createAssignment(globalBody).subscribe();

      const [, , opts] = apiStub.post.mock.calls[0];
      expect(opts).toBeUndefined();
    });

    it('returns the created assignment as Observable', () => {
      const created = { assignmentId: 'asn-new', roleCode: 'ROLE_ADMIN' };
      apiStub.post.mockReturnValueOnce(of(created));

      let result: unknown;
      (service as any).createAssignment(globalBody).subscribe((r: unknown) => (result = r));

      expect(result).toEqual(created);
    });
  });

  // ── revokeAssignment() ──────────────────────────────────────────────────────

  describe('revokeAssignment()', () => {
    it('calls DELETE /v1/people/{personUuid}/access/assignments/{roleCode}', () => {
      apiStub.delete.mockReturnValueOnce(of(undefined));

      (service as any).revokeAssignment('person-uuid-3', 'ROLE_ADMIN').subscribe();

      expect(apiStub.delete).toHaveBeenCalledWith(
        '/v1/people/person-uuid-3/access/assignments/ROLE_ADMIN',
      );
    });

    it('interpolates both personUuid and roleCode into the path', () => {
      apiStub.delete.mockReturnValueOnce(of(undefined));

      (service as any).revokeAssignment('person-uuid-7', 'ROLE_MANAGER').subscribe();

      const [path] = apiStub.delete.mock.calls[0];
      expect(path).toBe('/v1/people/person-uuid-7/access/assignments/ROLE_MANAGER');
    });

    it('completes without error when server returns 204/null', () => {
      apiStub.delete.mockReturnValueOnce(of(null));

      let completed = false;
      (service as any).revokeAssignment('person-uuid-9', 'ROLE_VIEW').subscribe({
        complete: () => (completed = true),
      });

      expect(completed).toBe(true);
    });
  });
});
