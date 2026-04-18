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
});
