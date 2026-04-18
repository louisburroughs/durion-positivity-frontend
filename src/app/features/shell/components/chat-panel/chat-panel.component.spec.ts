import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ChatApiService, ChatResponse } from '../../services/chat-api.service';
import { ChatStateService } from '../../services/chat-state.service';
import { ChatPanelComponent } from './chat-panel.component';

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

describe('ChatPanelComponent', () => {
  let fixture: ComponentFixture<ChatPanelComponent>;
  let component: ChatPanelComponent;
  let chatState: ChatStateService;

  const chatApiStub: Pick<ChatApiService, 'sendMessage'> = {
    sendMessage: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: ChatApiService, useValue: chatApiStub }],
    }).compileComponents();

    const translateService = TestBed.inject(TranslateService);
    translateService.setTranslation('en-US', chatTranslations);
    translateService.use('en-US');

    chatState = TestBed.inject(ChatStateService);
    chatState.clear();

    fixture = TestBed.createComponent(ChatPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    chatState.clear();
    vi.clearAllMocks();
  });

  it('adds the backend response as a system message when send succeeds', () => {
    const response: ChatResponse = { response: 'How can I help?' };
    vi.mocked(chatApiStub.sendMessage).mockReturnValueOnce(of(response));

    component.inputValue.set('Hello');
    component.sendMessage();

    const messages = chatState.messages();

    expect(chatApiStub.sendMessage).toHaveBeenCalledWith({ message: 'Hello' });
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('Hello');
    expect(messages[0].sender).toBe('user');
    expect(messages[1].content).toBe('How can I help?');
    expect(messages[1].sender).toBe('system');
    expect(component.sending()).toBe(false);
  });

  it('adds fallback and troubleshooting messages when the backend returns an HTTP error', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const httpError = new HttpErrorResponse({
      status: 502,
      statusText: 'Bad Gateway',
      url: 'https://durionpos.org/mcp-server/v1/mcp/chat',
      headers: new HttpHeaders({ 'X-Correlation-Id': 'corr-123' }),
      error: { code: 'UPSTREAM_FAILURE' },
    });

    vi.mocked(chatApiStub.sendMessage).mockReturnValueOnce(throwError(() => httpError));

    component.inputValue.set('Hello');
    component.sendMessage();

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
        statusText: 'Bad Gateway',
        url: 'https://durionpos.org/mcp-server/v1/mcp/chat',
        correlationId: 'corr-123',
        backendCode: 'UPSTREAM_FAILURE',
        errorBody: { code: 'UPSTREAM_FAILURE' },
      }),
    );
    expect(component.sending()).toBe(false);
  });
});
