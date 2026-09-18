import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { ChatBlobService } from './chat-blob.service';

describe('ChatBlobService', () => {
  let service: ChatBlobService;
  const getBlob = vi.fn();

  beforeEach(() => {
    getBlob.mockReset();
    getBlob.mockReturnValue(of(new Blob(['payload'])));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiBaseService, useValue: { getBlob } }],
    });
    service = TestBed.inject(ChatBlobService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('treats a relative URL as one our API must authenticate', () => {
    expect(service.needsAuthentication('/mcp-server/v1/mcp/blobs/1')).toBe(true);
    expect(service.needsAuthentication('blobs/1')).toBe(true);
    expect(service.needsAuthentication('https://cdn.example/x.png')).toBe(false);
    expect(service.needsAuthentication('mailto:ops@durion.example')).toBe(false);
    expect(service.needsAuthentication('')).toBe(false);
  });

  it('hands back an absolute URL untouched, without a request', async () => {
    const url = await firstValueFrom(service.resolve('https://cdn.example/x.png'));
    expect(url).toBe('https://cdn.example/x.png');
    expect(getBlob).not.toHaveBeenCalled();
  });

  it('fetches a relative URL through the authenticated client', async () => {
    const url = await firstValueFrom(service.resolve('/mcp-server/v1/mcp/blobs/1'));

    expect(getBlob).toHaveBeenCalledWith('/mcp-server/v1/mcp/blobs/1', { baseUrlOverride: '' });
    expect(url).toMatch(/^blob:/);
  });

  it('fetches each source once, however often it is rendered', async () => {
    await firstValueFrom(service.resolve('/blobs/1'));
    await firstValueFrom(service.resolve('/blobs/1'));

    expect(getBlob).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure, so a token refresh can rescue the next attempt', async () => {
    getBlob.mockReturnValueOnce(throwError(() => new Error('401')));

    await expect(firstValueFrom(service.resolve('/blobs/1'))).rejects.toThrow();

    const url = await firstValueFrom(service.resolve('/blobs/1'));
    expect(url).toMatch(/^blob:/);
    expect(getBlob).toHaveBeenCalledTimes(2);
  });

  it('revokes every object URL it handed out when it is destroyed', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await firstValueFrom(service.resolve('/blobs/1'));

    TestBed.resetTestingModule();

    expect(revoke).toHaveBeenCalledTimes(1);
  });
});
