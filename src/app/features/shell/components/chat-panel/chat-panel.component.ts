import { Component, computed, inject, output, signal, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ChatStateService } from '../../services/chat-state.service';
import { ChatSendService } from '../../services/chat-send.service';
import { AuthService } from '../../../../core/services/auth.service';
import { RagIngestDialogComponent } from '../rag-ingest-dialog/rag-ingest-dialog.component';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, TranslatePipe, RagIngestDialogComponent, MaterialSymbolPipe],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.css',
})
export class ChatPanelComponent implements AfterViewChecked {
  private readonly chatState = inject(ChatStateService);
  private readonly chatSend = inject(ChatSendService);
  private readonly authService = inject(AuthService);

  /** Emitted when the user collapses the panel via its close button. */
  readonly collapse = output<void>();

  readonly isAdmin = computed(() => this.authService.hasAnyRole(['ROLE_ADMIN']));
  readonly showRagDialog = signal(false);

  @ViewChild('messageList') private readonly messageListEl!: ElementRef<HTMLElement>;

  readonly messages   = this.chatState.messages;
  readonly isEmpty    = this.chatState.isEmpty;
  readonly inputValue = signal('');
  readonly sending    = signal(false);

  private scrollPending = false;

  sendMessage(): void {
    const text = this.inputValue().trim();
    if (!text || this.sending()) return;

    this.inputValue.set('');
    this.sending.set(true);
    this.scrollPending = true;

    this.chatSend.send(text, {
      onSettled: () => {
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
