import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { JwtClaims } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';
import { ChatErrorBlock, ChatMarkdownBlock, ChatTableBlock } from '../models/chat.model';
import { ChatApiService, ChatResponse } from './chat-api.service';
import { ChatStateService } from './chat-state.service';
import { ChatSendService } from './chat-send.service';

describe('ChatSendService', () => {
  let service: ChatSendService;
  let chatState: ChatStateService;

  const chatApiStub: Pick<ChatApiService, 'sendMessage'> = {
    sendMessage: vi.fn(),
  };

  const authServiceStub: Pick<AuthService, 'currentUserClaims'> = {
    currentUserClaims: signal<JwtClaims | null>({
      sub: 'admin.alpha',
      tid: 'tenant-one',
      exp: 9999999999,
    }),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(chatApiStub.sendMessage).mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [
        { provide: ChatApiService, useValue: chatApiStub },
        { provide: AuthService, useValue: authServiceStub },
      ],
    });

    service = TestBed.inject(ChatSendService);
    chatState = TestBed.inject(ChatStateService);
    chatState.startNewConversation();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function errorBlockOfLastTurn(): ChatErrorBlock {
    const messages = chatState.messages();
    return messages[messages.length - 1].blocks[0] as ChatErrorBlock;
  }

  it('records the user turn and the rendered answer', () => {
    vi.mocked(chatApiStub.sendMessage).mockReturnValue(
      of<ChatResponse>({ response: 'You have **26 mechanics**.' }),
    );

    service.send('How many mechanics do I have?');

    expect(chatApiStub.sendMessage).toHaveBeenCalledWith({ message: 'How many mechanics do I have?' });
    const messages = chatState.messages();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].pending).toBe(false);
    expect((messages[1].blocks[0] as ChatMarkdownBlock).markdown).toContain('26 mechanics');
  });

  it('derives a table block from a markdown table in the answer', () => {
    vi.mocked(chatApiStub.sendMessage).mockReturnValue(
      of<ChatResponse>({ response: '| Status | Count |\n| --- | ---: |\n| ACTIVE | 26 |' }),
    );

    service.send('breakdown');

    const blocks = chatState.messages()[1].blocks;
    expect(blocks[0].kind).toBe('table');
    expect((blocks[0] as ChatTableBlock).rows).toEqual([['ACTIVE', '26']]);
  });

  it('opens a pending assistant turn while the request is in flight', () => {
    // A never-settling observable stand-in: subscribe is never called back.
    vi.mocked(chatApiStub.sendMessage).mockReturnValue({
      pipe: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
    } as never);

    service.send('slow question');

    const messages = chatState.messages();
    expect(messages[1].pending).toBe(true);
    expect(chatState.awaitingReply()).toBe(true);
  });

  it('turns an HTTP failure into a retryable error block carrying translation keys', () => {
    vi.mocked(chatApiStub.sendMessage).mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 503,
            error: { code: 'MCP_UNAVAILABLE' },
            headers: new HttpHeaders({ 'X-Correlation-Id': 'abc-123' }),
          }),
      ),
    );

    service.send('hello');

    const block = errorBlockOfLastTurn();
    expect(block.kind).toBe('error');
    expect(block.messageKey).toBe('SHELL.CHAT.ERROR.BACKEND');
    expect(block.detailKey).toBe('SHELL.CHAT.ERROR.DETAIL_STATUS_CODE');
    expect(block.detailParams).toEqual({ status: 503, code: 'MCP_UNAVAILABLE' });
    expect(block.correlationId).toBe('abc-123');
    expect(block.retryable).toBe(true);
  });

  it('does not offer a retry for a client error that will fail the same way', () => {
    vi.mocked(chatApiStub.sendMessage).mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, headers: new HttpHeaders() })),
    );

    service.send('hello');

    const block = errorBlockOfLastTurn();
    expect(block.detailKey).toBe('SHELL.CHAT.ERROR.DETAIL_STATUS');
    expect(block.retryable).toBe(false);
  });

  it('falls back to a generic detail for a non-HTTP failure', () => {
    vi.mocked(chatApiStub.sendMessage).mockReturnValue(throwError(() => new Error('boom')));

    service.send('hello');

    expect(errorBlockOfLastTurn().detailKey).toBe('SHELL.CHAT.ERROR.DETAIL_GENERIC');
  });

  it('reports an answer with nothing renderable in it instead of a blank turn', () => {
    vi.mocked(chatApiStub.sendMessage).mockReturnValue(of<ChatResponse>({ response: '   ' }));

    service.send('hello');

    expect(errorBlockOfLastTurn().messageKey).toBe('SHELL.CHAT.ERROR.NO_USABLE_CONTENT');
  });

  it('retries the last user turn without duplicating it', () => {
    vi.mocked(chatApiStub.sendMessage).mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, headers: new HttpHeaders() })),
    );
    service.send('how many mechanics');

    const failedId = chatState.messages()[1].id;
    vi.mocked(chatApiStub.sendMessage).mockReturnValue(of<ChatResponse>({ response: '26.' }));

    service.retry(failedId);

    const messages = chatState.messages();
    expect(messages.filter(message => message.role === 'user')).toHaveLength(1);
    expect(messages[messages.length - 1].blocks[0].kind).toBe('markdown');
    expect(chatApiStub.sendMessage).toHaveBeenLastCalledWith({ message: 'how many mechanics' });
  });

  it('lands a reply in its own conversation when the user has moved on', () => {
    let settle: ((response: ChatResponse) => void) | null = null;
    vi.mocked(chatApiStub.sendMessage).mockReturnValue({
      pipe: () => ({
        subscribe: (observer: { next: (value: ChatResponse) => void }) => {
          settle = observer.next;
          return { unsubscribe: () => undefined };
        },
      }),
    } as never);

    service.send('first question');
    const firstId = chatState.activeConversationId()!;

    chatState.startNewConversation();
    chatState.appendUserMessage('a different question');

    settle!({ response: 'the late answer' });

    expect(chatState.messages()).toHaveLength(1);
    chatState.selectConversation(firstId);
    const landed = chatState.messages()[chatState.messages().length - 1];
    expect(landed.role).toBe('assistant');
    expect(landed.pending).toBe(false);
  });

  it('calls onSettled on both success and failure', () => {
    const onSettled = vi.fn();

    vi.mocked(chatApiStub.sendMessage).mockReturnValue(of<ChatResponse>({ response: 'ok' }));
    service.send('one', { onSettled });

    vi.mocked(chatApiStub.sendMessage).mockReturnValue(throwError(() => new Error('boom')));
    service.send('two', { onSettled });

    expect(onSettled).toHaveBeenCalledTimes(2);
  });
});
