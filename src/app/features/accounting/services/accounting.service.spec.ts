import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { AccountingService } from './accounting.service';
import { IngestionProcessingStatus } from '../models/accounting.models';

describe('AccountingService', () => {
  let service: AccountingService;

  const apiBaseServiceStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AccountingService,
        { provide: ApiBaseService, useValue: apiBaseServiceStub },
      ],
    });
    service = TestBed.inject(AccountingService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listEvents()', () => {
    it('should map both items and content to AccountingEventListItem[]', () => {
      const rawDetail = {
        eventId: 'e-001',
        eventType: 'InvoiceIssued',
        processingStatus: IngestionProcessingStatus.Processed,
        receivedAt: '2024-01-01T00:00:00Z',
      };

      apiBaseServiceStub.get.mockReturnValueOnce(
        of({ items: [rawDetail], content: [rawDetail], totalCount: 1 }),
      );

      let result: any;
      service.listEvents({}, 0, 20).subscribe(r => {
        result = r;
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].eventId).toBe('e-001');
      expect(result.items[0].eventType).toBe('InvoiceIssued');
      expect(result.items[0].processingStatus).toBe(IngestionProcessingStatus.Processed);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].eventId).toBe('e-001');
      expect(result.content[0].eventType).toBe('InvoiceIssued');
      expect(result.content[0].processingStatus).toBe(IngestionProcessingStatus.Processed);
    });
  });
});
