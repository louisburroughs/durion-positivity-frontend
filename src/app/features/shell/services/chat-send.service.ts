import { inject, Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { ChatStateService } from './chat-state.service';
import { ChatApiService } from './chat-api.service';

/** Optional lifecycle hooks for a chat send. */
export interface ChatSendCallbacks {
  /** Invoked once the request settles (success OR error) — e.g. to clear a
   *  component `sending` flag and trigger a scroll. */
  onSettled?: () => void;
}

/**
 * ChatSendService
 * ---------------
 * Single, canonical chat-send flow shared by the shell {@link ChatPanelComponent}
 * and the dashboard assistant strip. Records the user message, dispatches to the
 * backend, and writes the reply — or a logged troubleshooting message on failure —
 * to the root {@link ChatStateService}.
 *
 * Root scoped on purpose: the request is NOT tied to any component's `DestroyRef`,
 * so the reply still lands in the always-visible shell chat panel even if the
 * originating component is destroyed mid-request (e.g. a dashboard quick-action
 * navigates away). Both call sites therefore behave identically — including
 * console logging and the correlation-id/backend-code troubleshooting message.
 */
@Injectable({ providedIn: 'root' })
export class ChatSendService {
  private static readonly CORRELATION_ID_HEADER = 'X-Correlation-Id';

  private readonly chatState = inject(ChatStateService);
  private readonly chatApi = inject(ChatApiService);
  private readonly translateService = inject(TranslateService);

  /**
   * Send a chat message through the canonical flow.
   *
   * @param text      already-trimmed, non-empty message text
   * @param callbacks optional lifecycle hooks (see {@link ChatSendCallbacks})
   */
  send(text: string, callbacks?: ChatSendCallbacks): void {
    this.chatState.addUserMessage(text);

    this.chatApi
      .sendMessage({ message: text })
      .pipe(finalize(() => callbacks?.onSettled?.()))
      .subscribe({
        next: resp => this.chatState.addSystemMessage(resp.response),
        error: error => this.handleSendFailure(error),
      });
  }

  private handleSendFailure(error: unknown): void {
    this.logChatFailure(error);
    this.chatState.addSystemMessage(this.translateService.instant('SHELL.CHAT.ERROR_BACKEND'));

    const troubleshootingMessage = this.buildTroubleshootingMessage(error);
    if (troubleshootingMessage) {
      this.chatState.addSystemMessage(troubleshootingMessage);
    }
  }

  private buildTroubleshootingMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return this.translateService.instant('SHELL.CHAT.ERROR_TROUBLESHOOTING_GENERIC');
    }

    const details = [
      this.translateService.instant('SHELL.CHAT.ERROR_DETAIL_STATUS', { status: error.status }),
      this.buildBackendCodeDetail(error),
      this.buildCorrelationIdDetail(error),
    ].filter((detail): detail is string => typeof detail === 'string' && detail.trim().length > 0);

    if (details.length === 0) {
      return this.translateService.instant('SHELL.CHAT.ERROR_TROUBLESHOOTING_GENERIC');
    }

    return this.translateService.instant('SHELL.CHAT.ERROR_TROUBLESHOOTING', {
      details: details.join(' '),
    });
  }

  private buildBackendCodeDetail(error: HttpErrorResponse): string | null {
    const backendCode = this.extractBackendCode(error.error);
    if (!backendCode) {
      return null;
    }

    return this.translateService.instant('SHELL.CHAT.ERROR_DETAIL_CODE', { code: backendCode });
  }

  private buildCorrelationIdDetail(error: HttpErrorResponse): string | null {
    const correlationId = error.headers.get(ChatSendService.CORRELATION_ID_HEADER);
    if (!correlationId) {
      return null;
    }

    return this.translateService.instant('SHELL.CHAT.ERROR_DETAIL_CORRELATION_ID', {
      correlationId,
    });
  }

  private extractBackendCode(errorBody: unknown): string | null {
    if (!errorBody || typeof errorBody !== 'object') {
      return null;
    }

    const code = (errorBody as { code?: unknown }).code;
    return typeof code === 'string' && code.trim().length > 0 ? code.trim() : null;
  }

  private logChatFailure(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      console.error('Chat backend request failed', {
        status: error.status,
        url: error.url,
        correlationId: error.headers.get(ChatSendService.CORRELATION_ID_HEADER),
        backendCode: this.extractBackendCode(error.error),
        errorBody: error.error,
      });
      return;
    }

    console.error('Chat backend request failed', { error });
  }
}
