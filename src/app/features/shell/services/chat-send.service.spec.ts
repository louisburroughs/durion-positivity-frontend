import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { JwtClaims } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';
import { ChatApiService, ChatResponse } from './chat-api.service';
import { ChatStateService } from './chat-state.service';
import { ChatSendService } from './chat-send.service';

const chatTranslations = {
  SHELL: {
    CHAT: {
      ERROR_BACKEND: 'Chat service is not available. Your message was received locally.',
      ERROR_TROUBLESHOOTING:
        'Troubleshooting: {{ details }} Check your browser Network tab and the gateway logs for /mcp-server/v1/mcp/chat.',
      ERROR_TROUBLESHOOTING_GENERIC:
        'Troubleshooting: Check your browser Network tab and the gateway logs for /mcp-server/v1/mcp/chat.',
      ERROR_DETAIL_STATUS: 'HTTP {{ status }}.',
      ERROR_DETAIL_CODE: 'Backend code {{ code }}.',
      ERROR_DETAIL_CORRELATION_ID: 'Correlation ID {{ correlationId }}.',
    },
  },
};

describe('ChatSendService', () => {
  let service: ChatSendService;
  let chatState: ChatStateService;

  const chatApiStub: Pick<ChatApiService, 'sendMessage'> = {
    sendMessage: vi.fn(),
  };

  const authServiceStub: Pick<AuthService, 'currentUserClaims'> = {
    currentUserClaims: signal<JwtClaims | null>(null),
  };

  beforeEach(() => {
    vi.mocked(chatApiStub.sendMessage).mockReset();

    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: ChatApiService, useValue: chatApiStub },
        { provide: AuthService, useValue: authServiceStub },
      ],
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', chatTranslations);
    translate.use('en-US');

    service = TestBed.inject(ChatSendService);
    chatState = TestBed.inject(ChatStateService);
    chatState.clear();
  });

  afterEach(() => {
    chatState.clear();
    vi.clearAllMocks();
  });

  it('records the user message, sends it, and stores the reply as a system message', () => {
    const response: ChatResponse = { response: 'How can I help?' };
    vi.mocked(chatApiStub.sendMessage).mockReturnValueOnce(of(response));

    const onSettled = vi.fn();
    service.send('Hello', { onSettled });

    const messages = chatState.messages();
    expect(chatApiStub.sendMessage).toHaveBeenCalledWith({ message: 'Hello' });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ content: 'Hello', sender: 'user' });
    expect(messages[1]).toMatchObject({ content: 'How can I help?', sender: 'system' });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('logs the failure and surfaces fallback + troubleshooting detail on an HTTP error', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const httpError = new HttpErrorResponse({
      status: 502,
      statusText: 'Bad Gateway',
      url: 'https://durionpos.org/mcp-server/v1/mcp/chat',
      headers: new HttpHeaders({ 'X-Correlation-Id': 'corr-123' }),
      error: { code: 'UPSTREAM_FAILURE' },
    });
    vi.mocked(chatApiStub.sendMessage).mockReturnValueOnce(throwError(() => httpError));

    const onSettled = vi.fn();
    service.send('Hello', { onSettled });

    // The user's own message must still be recorded even when the send fails.
    expect(chatState.messages().some(m => m.sender === 'user' && m.content === 'Hello')).toBe(true);

    const systemMessages = chatState
      .messages()
      .filter(message => message.sender === 'system')
      .map(message => message.content);

    expect(systemMessages).toEqual([
      'Chat service is not available. Your message was received locally.',
      'Troubleshooting: HTTP 502. Backend code UPSTREAM_FAILURE. Correlation ID corr-123. Check your browser Network tab and the gateway logs for /mcp-server/v1/mcp/chat.',
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Chat backend request failed',
      expect.objectContaining({
        status: 502,
        url: 'https://durionpos.org/mcp-server/v1/mcp/chat',
        correlationId: 'corr-123',
        backendCode: 'UPSTREAM_FAILURE',
        errorBody: { code: 'UPSTREAM_FAILURE' },
      }),
    );
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('logs a generic troubleshooting message for a non-HTTP error', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(chatApiStub.sendMessage).mockReturnValueOnce(throwError(() => new Error('boom')));

    service.send('Hello');

    const systemMessages = chatState
      .messages()
      .filter(message => message.sender === 'system')
      .map(message => message.content);

    expect(systemMessages).toEqual([
      'Chat service is not available. Your message was received locally.',
      'Troubleshooting: Check your browser Network tab and the gateway logs for /mcp-server/v1/mcp/chat.',
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Chat backend request failed', { error: expect.any(Error) });
  });

  it('runs onSettled even when no callbacks object is passed', () => {
    vi.mocked(chatApiStub.sendMessage).mockReturnValueOnce(of<ChatResponse>({ response: 'ok' }));
    expect(() => service.send('Hello')).not.toThrow();
    expect(chatState.messages().some(m => m.sender === 'system' && m.content === 'ok')).toBe(true);
  });
});
