import {
  Component,
  DestroyRef,
  inject,
  signal,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChatStateService } from '../../services/chat-state.service';
import { ChatApiService } from '../../services/chat-api.service';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, TranslatePipe],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.css',
})
export class ChatPanelComponent implements AfterViewChecked {
  private static readonly CORRELATION_ID_HEADER = 'X-Correlation-Id';

  private readonly destroyRef = inject(DestroyRef);
  private readonly chatState = inject(ChatStateService);
  private readonly chatApi = inject(ChatApiService);
  private readonly translateService = inject(TranslateService);

  @ViewChild('messageList') private readonly messageListEl!: ElementRef<HTMLElement>;

  readonly messages   = this.chatState.messages;
  readonly isEmpty    = this.chatState.isEmpty;
  readonly inputValue = signal('');
  readonly sending    = signal(false);

  private scrollPending = false;

  sendMessage(): void {
    const text = this.inputValue().trim();
    if (!text || this.sending()) return;

    this.chatState.addUserMessage(text);
    this.inputValue.set('');
    this.sending.set(true);
    this.scrollPending = true;

    this.chatApi
      .sendMessage({ message: text })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.sending.set(false)),
      )
      .subscribe({
        next: resp => {
          this.chatState.addSystemMessage(resp.response);
          this.scrollPending = true;
        },
        error: error => {
          this.handleSendFailure(error);
        },
      });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  ngAfterViewChecked(): void {
    if (this.scrollPending && this.messageListEl) {
      const el = this.messageListEl.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.scrollPending = false;
    }
  }

  private handleSendFailure(error: unknown): void {
    this.logChatFailure(error);
    this.chatState.addSystemMessage(this.translateService.instant('SHELL.CHAT.ERROR_BACKEND'));

    const troubleshootingMessage = this.buildTroubleshootingMessage(error);
    if (troubleshootingMessage) {
      this.chatState.addSystemMessage(troubleshootingMessage);
    }

    this.scrollPending = true;
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
    const correlationId = error.headers.get(ChatPanelComponent.CORRELATION_ID_HEADER);
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
        statusText: error.statusText,
        url: error.url,
        correlationId: error.headers.get(ChatPanelComponent.CORRELATION_ID_HEADER),
        backendCode: this.extractBackendCode(error.error),
        errorBody: error.error,
      });
      return;
    }

    console.error('Chat backend request failed', { error });
  }
}
