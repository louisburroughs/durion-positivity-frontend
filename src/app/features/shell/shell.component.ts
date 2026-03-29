import { Component, signal, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent }       from './components/header/header.component';
import { FooterComponent }       from './components/footer/footer.component';
import { NavComponent }          from './components/nav/nav.component';
import { ChatPanelComponent }    from './components/chat-panel/chat-panel.component';
import { ContentPanelComponent } from './components/content-panel/content-panel.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    FooterComponent,
    NavComponent,
    ChatPanelComponent,
    ContentPanelComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class ShellComponent {
  /** Controls sidebar collapsed state; collapses automatically on narrow viewports. */
  readonly navCollapsed = signal(false);
  @ViewChild('mainContent') private mainContent?: ElementRef<HTMLElement>;

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

  skipToMainContent(event: Event): void {
    event.preventDefault();
    this.mainContent?.nativeElement.focus();
  }
}
