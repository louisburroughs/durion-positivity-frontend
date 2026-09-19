import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { ChatApiService, ChatResponse } from './chat-api.service';
import { environment } from '../../../../environments/environment';

describe('ChatApiService', () => {
  let service: ChatApiService;

  const apiStub = {
    post: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ChatApiService,
        { provide: ApiBaseService, useValue: apiStub },
      ],
    });

    service = TestBed.inject(ChatApiService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('posts the chat message to the MCP chat endpoint and returns the backend response', () => {
    const backendResponse: ChatResponse = { response: 'How can I help?' };
    apiStub.post.mockReturnValueOnce(of(backendResponse));

    let result: ChatResponse | undefined;
    service.sendMessage({ message: 'Hello' }).subscribe(response => (result = response));

    expect(apiStub.post).toHaveBeenCalledWith(
      '/mcp-server/v1/mcp/chat',
      { message: 'Hello' },
      { baseUrlOverride: environment.apiBaseUrl.replace(/\/api\/?$/, '') },
    );
    expect(result).toEqual(backendResponse);
  });

  it('ingests a document without sending identity or authority headers', () => {
    // Identity and authority come from the bearer token alone (ADR-0011/0062).
    // A browser-set X-User/X-Authorities pair is either ignored by the gateway or
    // trusted by it — and trusting it lets any signed-in session grant itself the
    // ingest authority from the devtools console.
    apiStub.post.mockReturnValueOnce(of(undefined));

    service
      .ingestDocument({
        content: 'a bulletin',
        metadata: { source: 'upload', type: 'text', title: 'Bulletin' },
      })
      .subscribe();

    expect(apiStub.post).toHaveBeenCalledWith(
      '/mcp-server/v1/mcp/documents',
      {
        content: 'a bulletin',
        metadata: { source: 'upload', type: 'text', title: 'Bulletin' },
      },
      { baseUrlOverride: environment.apiBaseUrl.replace(/\/api\/?$/, '') },
    );

    const options = apiStub.post.mock.calls[0][2] as { headers?: Record<string, string> };
    expect(options.headers).toBeUndefined();
  });
});
