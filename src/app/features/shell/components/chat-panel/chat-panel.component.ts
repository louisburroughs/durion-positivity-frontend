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
        error: () => {
          this.chatState.addSystemMessage(this.translateService.instant('SHELL.CHAT.ERROR_BACKEND'));
          this.scrollPending = true;
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
}
