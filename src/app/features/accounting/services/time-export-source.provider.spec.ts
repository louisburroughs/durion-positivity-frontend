import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { provideAccountingTimeExportSource } from './time-export-source.provider';
import { AccountingService } from './accounting.service';
import { TIME_EXPORT_SOURCE } from '../../../shared/time-export/time-export-source.tokens';

describe('provideAccountingTimeExportSource', () => {
  const stubAccounting = {
    requestExport: vi.fn(),
    getExportStatus: vi.fn(),
    getExportHistory: vi.fn(),
    downloadExport: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideAccountingTimeExportSource(),
        { provide: AccountingService, useValue: stubAccounting },
      ],
    });
  });

  it('lazily resolves AccountingService and forwards requestExport', async () => {
    stubAccounting.requestExport.mockReturnValue(of({ exportId: 'exp-1', status: 'QUEUED' }));
    const source = TestBed.inject(TIME_EXPORT_SOURCE);

    const result = await firstValueFrom(
      source.requestExport(
        { startDate: '2024-01-01', endDate: '2024-01-31', locationIds: ['loc-1'], format: 'CSV' },
        'key-1',
      ),
    );

    expect(result).toEqual({ exportId: 'exp-1', status: 'QUEUED' });
    expect(stubAccounting.requestExport).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2024-01-01' }),
      'key-1',
    );
  });

  it('forwards getExportStatus', async () => {
    stubAccounting.getExportStatus.mockReturnValue(of({ exportId: 'exp-1', status: 'READY' }));
    const source = TestBed.inject(TIME_EXPORT_SOURCE);

    const result = await firstValueFrom(source.getExportStatus('exp-1'));

    expect(result).toEqual({ exportId: 'exp-1', status: 'READY' });
    expect(stubAccounting.getExportStatus).toHaveBeenCalledWith('exp-1');
  });

  it('forwards getExportHistory', async () => {
    stubAccounting.getExportHistory.mockReturnValue(of([{ exportId: 'exp-1' }]));
    const source = TestBed.inject(TIME_EXPORT_SOURCE);

    const result = await firstValueFrom(source.getExportHistory({ pageIndex: 0, pageSize: 20 }));

    expect(result).toEqual([{ exportId: 'exp-1' }]);
    expect(stubAccounting.getExportHistory).toHaveBeenCalledWith({ pageIndex: 0, pageSize: 20 });
  });

  it('forwards downloadExport once AccountingService resolves', async () => {
    const source = TestBed.inject(TIME_EXPORT_SOURCE);

    await firstValueFrom(source.downloadExport('exp-1'));

    expect(stubAccounting.downloadExport).toHaveBeenCalledWith('exp-1');
  });

  it('surfaces a downloadExport failure through the observable error channel, not an unhandled rejection', async () => {
    const source = TestBed.inject(TIME_EXPORT_SOURCE);
    const failure = new Error('download failed');
    stubAccounting.downloadExport.mockImplementation(() => {
      throw failure;
    });

    await expect(firstValueFrom(source.downloadExport('exp-1'))).rejects.toBe(failure);
  });

  it('caches the lazily-loaded AccountingService across calls', async () => {
    stubAccounting.requestExport.mockReturnValue(of({ exportId: 'exp-1', status: 'QUEUED' }));
    stubAccounting.getExportHistory.mockReturnValue(of([]));
    const source = TestBed.inject(TIME_EXPORT_SOURCE);

    await firstValueFrom(
      source.requestExport({ startDate: '2024-01-01', endDate: '2024-01-31', locationIds: ['loc-1'], format: 'CSV' }),
    );
    await firstValueFrom(source.getExportHistory());

    // Only one AccountingService instance should ever be resolved via inject().
    expect(stubAccounting.requestExport).toHaveBeenCalledTimes(1);
    expect(stubAccounting.getExportHistory).toHaveBeenCalledTimes(1);
  });
});
