import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiBaseService } from './api-base.service';
import { environment } from '../../../environments/environment';

describe('ApiBaseService', () => {
  let service: ApiBaseService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ApiBaseService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(ApiBaseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('prepends the configured API base URL by default', () => {
    service.get('/security-service/v1/roles').subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/security-service/v1/roles`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('respects a base URL override for gateway-root endpoints', () => {
    const gatewayBaseUrl = environment.apiBaseUrl.replace(/\/api\/?$/, '');

    service.post(
      '/mcp-server/v1/mcp/chat',
      { message: 'hello' },
      { baseUrlOverride: gatewayBaseUrl },
    ).subscribe();

    const req = httpMock.expectOne(`${gatewayBaseUrl}/mcp-server/v1/mcp/chat`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ message: 'hello' });
    req.flush({ response: 'hi' });
  });

  it('fetches a blob with the given base URL, headers and responseType (R11c, ADR-0035 §1)', () => {
    const gatewayBaseUrl = environment.apiBaseUrl.replace(/\/api\/?$/, '');
    let received: Blob | null = null;

    service
      .getBlob('/mcp-server/v1/mcp/blobs/1', {
        baseUrlOverride: gatewayBaseUrl,
        headers: { 'X-Correlation-Id': 'abc-123' },
      })
      .subscribe(blob => (received = blob));

    const req = httpMock.expectOne(`${gatewayBaseUrl}/mcp-server/v1/mcp/blobs/1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.headers.get('X-Correlation-Id')).toBe('abc-123');

    const blob = new Blob(['payload'], { type: 'application/pdf' });
    req.flush(blob);

    expect(received).toBe(blob);
  });
});
