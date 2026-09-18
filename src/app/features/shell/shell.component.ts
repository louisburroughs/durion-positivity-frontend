import { Component, signal, HostListener, ElementRef, ViewChild, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent }       from './components/header/header.component';
import { FooterComponent }       from './components/footer/footer.component';
import { NavComponent }          from './components/nav/nav.component';
import { ChatModalComponent }    from './components/chat-modal/chat-modal.component';
import { ContentPanelComponent } from './components/content-panel/content-panel.component';
import { ChatUiService }         from './services/chat-ui.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    TranslatePipe,
    HeaderComponent,
    FooterComponent,
    NavComponent,
    ChatModalComponent,
    ContentPanelComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class ShellComponent {
  readonly NAV_ID = 'shell-nav';

  private readonly chatUi = inject(ChatUiService);
  readonly chatOpen = this.chatUi.open;

  /** Controls sidebar collapsed state; collapses automatically on narrow viewports. */
  readonly navCollapsed = signal(false);
  @ViewChild('mainContent') private readonly mainContent?: ElementRef<HTMLElement>;

  /** On resize: auto-collapse nav when viewport goes below 768 px. */
  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth < 768) {
      this.navCollapsed.set(true);
    }
  }

  toggleNav(): void {
    this.navCollapsed.update(v => !v);
  }

  toggleChat(): void {
    this.chatUi.toggle();
  }

  /** Ctrl/Cmd+K opens the assistant from anywhere in the shell. */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'k' && event.key !== 'K') return;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    this.chatUi.openModal();
  }

  skipToMainContent(event: Event): void {
    event.preventDefault();
    this.mainContent?.nativeElement.focus();
  }
}
