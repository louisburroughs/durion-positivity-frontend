/**
 * SupplierPricatService contract tests.
 *
 * ADR-0035: every public method asserts verb + URL.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import { SupplierPricatService } from './supplier-pricat.service';
import {
  PricatFreshness,
  PricatRun,
  PricatRunTriggerResponse,
  PricatUnmatchedPage,
} from '../models/supplier-pricat.models';

const BASE = environment.apiBaseUrl;
const PROFILE_ID = 'profile-1';

const runFixture: PricatRun = {
  runId: 'run-1',
  vendorProfileId: PROFILE_ID,
  bindingId: 'bind-1',
  startedAt: '2026-08-12T03:00:00Z',
  finishedAt: '2026-08-12T03:04:00Z',
  windowFrom: '2026-08-11T03:00:00Z',
  windowTo: '2026-08-12T03:00:00Z',
  outcome: 'SUCCESS',
  linesFetched: 1200,
  linesStored: 1180,
  linesUnmatched: 15,
  linesDuplicate: 5,
  checkpointState: 'ck-9',
  checkpointAt: '2026-08-12T03:04:00Z',
};

const freshnessFixture: PricatFreshness = {
  vendorProfileId: PROFILE_ID,
  latestEffectiveDate: '2026-08-10',
  lastFetchedAt: '2026-08-12T03:04:00Z',
  stalenessThresholdMinutes: 1440,
  unmatchedLineCount: 15,
};

const triggerFixture: PricatRunTriggerResponse = {
  runId: 'run-2',
  accepted: true,
  pollAfterMs: 3000,
};

const unmatchedPageFixture: PricatUnmatchedPage = {
  items: [
    {
      unmatchedLineId: 'ul-1',
      vendorProfileId: PROFILE_ID,
      ean: '3528700123456',
      gtin: null,
      manufacturerPartNumber: 'MX-2255',
      description: 'Pilot Sport 4 225/55R17',
      reason: 'NO_EAN_MATCH',
      firstSeenAt: '2026-08-01T03:04:00Z',
      lastSeenAt: '2026-08-12T03:04:00Z',
      occurrences: 12,
    },
  ],
  totalCount: 1,
  nextPageToken: null,
};

describe('SupplierPricatService', () => {
  let service: SupplierPricatService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SupplierPricatService, ApiBaseService],
    });
    service = TestBed.inject(SupplierPricatService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listRuns() — GET .../pricat/runs', () => {
    service.listRuns(PROFILE_ID).subscribe();
    const req = http.expectOne(
      `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/pricat/runs`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush([runFixture]);
  });

  it('listRuns() — forwards bindingId when supplied', () => {
    service.listRuns(PROFILE_ID, 'bind-1').subscribe();
    const req = http.expectOne(
      r => r.url === `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/pricat/runs`,
    );
    expect(req.request.params.get('bindingId')).toBe('bind-1');
    req.flush([runFixture]);
  });

  it('triggerRun() — POST .../pricat/runs with the binding id and accepts 202', () => {
    let accepted = false;
    service.triggerRun(PROFILE_ID, 'bind-1').subscribe(res => {
      accepted = res.accepted;
    });
    const req = http.expectOne(
      `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/pricat/runs`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ bindingId: 'bind-1' });
    req.flush(triggerFixture, { status: 202, statusText: 'Accepted' });
    expect(accepted).toBe(true);
  });

  it('getFreshness() — GET .../pricat/freshness', () => {
    service.getFreshness(PROFILE_ID).subscribe();
    const req = http.expectOne(
      `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/pricat/freshness`,
    );
    expect(req.request.method).toBe('GET');
    req.flush(freshnessFixture);
  });

  it('listUnmatchedLines() — GET .../pricat/unmatched-lines', () => {
    service.listUnmatchedLines(PROFILE_ID).subscribe();
    const req = http.expectOne(
      `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/pricat/unmatched-lines`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(unmatchedPageFixture);
  });

  it('listUnmatchedLines() — forwards reason, search, date-only bounds and page token', () => {
    service
      .listUnmatchedLines(
        PROFILE_ID,
        { reason: 'NO_EAN_MATCH', search: 'MX-2255', dateFrom: '2026-08-01', dateTo: '2026-08-12' },
        'tok-2',
      )
      .subscribe();
    const req = http.expectOne(
      r =>
        r.url === `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/pricat/unmatched-lines`,
    );
    expect(req.request.params.get('reason')).toBe('NO_EAN_MATCH');
    expect(req.request.params.get('search')).toBe('MX-2255');
    expect(req.request.params.get('dateFrom')).toBe('2026-08-01');
    expect(req.request.params.get('dateTo')).toBe('2026-08-12');
    expect(req.request.params.get('pageToken')).toBe('tok-2');
    req.flush(unmatchedPageFixture);
  });

  it('exposes no dismissal endpoint — unmatched lines clear only when the backend matches them', () => {
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    expect(methodNames.some(name => /dismiss|resolve|ignore|delete/i.test(name))).toBe(false);
  });
});
