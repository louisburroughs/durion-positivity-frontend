import {
  Component,
  inject,
  signal,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatStateService } from '../../services/chat-state.service';
import { ChatApiService } from '../../services/chat-api.service';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.css',
})
export class ChatPanelComponent implements AfterViewChecked {
  private readonly chatState = inject(ChatStateService);
  private readonly chatApi   = inject(ChatApiService);

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

    // TODO: Connect to ChatApiService.sendMessage() once backend is available.
    // For now, immediately show a placeholder system reply.
    const sessionId = 'local-session';
    this.chatApi.sendMessage({ sessionId, message: text }).subscribe({
      next: resp => {
        this.chatState.addSystemMessage(resp.reply);
        this.sending.set(false);
        this.scrollPending = true;
      },
      error: () => {
        this.chatState.addSystemMessage(
          '⚠️ Chat backend is not yet connected. Your message was received locally.',
        );
        this.sending.set(false);
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
