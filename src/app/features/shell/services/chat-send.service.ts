import { inject, Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { logger } from '../../../core/utils/logger';
import { ChatErrorBlock } from '../models/chat.model';
import { mapAnswerPayload } from '../utils/chat-response.mapper';
import { ChatStateService, ChatTurnTarget } from './chat-state.service';
import { ChatApiService } from './chat-api.service';

/** Optional lifecycle hooks for a chat send. */
export interface ChatSendCallbacks {
  /** Invoked once the request settles (success OR error) — e.g. to scroll the thread. */
  onSettled?: () => void;
}

/**
 * ChatSendService
 * ---------------
 * The one chat-send flow, shared by the assistant modal and every launcher that
 * seeds it. Records the user turn, opens a pending assistant turn, and replaces
 * that turn with rendered blocks — or with an error block carrying translation
 * KEYS, so a failure reads in whatever locale the user is in when they look at it.
 *
 * Root scoped on purpose: the request is NOT tied to any component's `DestroyRef`,
 * so a reply still lands in the conversation even if the component that started it
 * is destroyed mid-request (the modal closing, a quick action navigating away).
 */
@Injectable({ providedIn: 'root' })
export class ChatSendService {
  private static readonly CORRELATION_ID_HEADER = 'X-Correlation-Id';

  private readonly chatState = inject(ChatStateService);
  private readonly chatApi = inject(ChatApiService);

  /**
   * Send a chat message through the canonical flow.
   *
   * @param text      already-trimmed, non-empty message text
   * @param callbacks optional lifecycle hooks (see {@link ChatSendCallbacks})
   */
  send(text: string, callbacks?: ChatSendCallbacks): void {
    this.chatState.appendUserMessage(text);
    const target = this.chatState.beginAssistantTurn();
    if (!target) return;
    this.dispatch(text, target, callbacks);
  }

  /**
   * Re-ask the question that produced a failed turn, replacing that turn in place.
   * Deliberately NOT the newest question in the thread: a retry on an older
   * failure must re-send its own prompt, and its answer must stay where it was.
   */
  retry(failedMessageId: string, callbacks?: ChatSendCallbacks): void {
    const text = this.chatState.userTextBefore(failedMessageId);
    if (!text) return;

    const target = this.chatState.restartAssistantTurn(failedMessageId);
    if (!target) return;

    this.dispatch(text, target, callbacks);
  }

  private dispatch(text: string, target: ChatTurnTarget, callbacks?: ChatSendCallbacks): void {
    this.chatApi
      .sendMessage({ message: text })
      .pipe(finalize(() => callbacks?.onSettled?.()))
      .subscribe({
        next: response => {
          const blocks = mapAnswerPayload(response);
          this.chatState.completeAssistantTurn(
            target,
            blocks.length > 0 ? blocks : [emptyAnswerBlock()],
          );
        },
        error: (error: unknown) => {
          this.logChatFailure(error);
          this.chatState.completeAssistantTurn(target, [this.toErrorBlock(error)]);
        },
      });
  }

  private toErrorBlock(error: unknown): ChatErrorBlock {
    if (!(error instanceof HttpErrorResponse)) {
      return {
        kind: 'error',
        messageKey: 'SHELL.CHAT.ERROR.BACKEND',
        detailKey: 'SHELL.CHAT.ERROR.DETAIL_GENERIC',
        detailParams: null,
        correlationId: null,
        retryable: true,
      };
    }

    const backendCode = extractBackendCode(error.error);
    return {
      kind: 'error',
      messageKey: 'SHELL.CHAT.ERROR.BACKEND',
      detailKey: backendCode ? 'SHELL.CHAT.ERROR.DETAIL_STATUS_CODE' : 'SHELL.CHAT.ERROR.DETAIL_STATUS',
      detailParams: backendCode ? { status: error.status, code: backendCode } : { status: error.status },
      correlationId: error.headers.get(ChatSendService.CORRELATION_ID_HEADER),
      // A 4xx that is not a timeout will fail again the same way; 0/5xx is worth a retry.
      retryable: error.status === 0 || error.status >= 500 || error.status === 408 || error.status === 429,
    };
  }

  private logChatFailure(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      logger.error('Chat backend request failed', {
        status: error.status,
        url: error.url,
        correlationId: error.headers.get(ChatSendService.CORRELATION_ID_HEADER),
        backendCode: extractBackendCode(error.error),
        errorBody: error.error,
      });
      return;
    }

    logger.error('Chat backend request failed', { error });
  }
}

/**
 * The answer produced nothing renderable. Reachable from several causes — an
 * empty `response`, a body that is not an object at all, a `blocks` array whose
 * every entry was malformed — so the copy names what the app can observe (there
 * is nothing to show) rather than asserting a cause the mapper never established
 * (ADR-0064 §4).
 */
function emptyAnswerBlock(): ChatErrorBlock {
  return {
    kind: 'error',
    messageKey: 'SHELL.CHAT.ERROR.NO_USABLE_CONTENT',
    detailKey: null,
    detailParams: null,
    correlationId: null,
    retryable: true,
  };
}

function extractBackendCode(errorBody: unknown): string | null {
  if (!errorBody || typeof errorBody !== 'object') return null;
  const code = (errorBody as { code?: unknown }).code;
  return typeof code === 'string' && code.trim().length > 0 ? code.trim() : null;
}
