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
});
