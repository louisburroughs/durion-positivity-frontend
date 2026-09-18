import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MdBlock, parseMarkdown } from '../../util/markdown.util';

/**
 * MarkdownViewComponent
 * ---------------------
 * Renders an assistant answer's markdown by walking a token tree with ordinary
 * Angular templates. No HTML string is ever built and `innerHTML` is never used,
 * so there is nothing to sanitise and no injection surface — an assistant answer
 * is untrusted input like any other server payload.
 *
 * Headings render at h3–h6: the dialog title is the h2 above them. An in-app link
 * target goes through `routerLink`, never a bare `href` (ADR-0037): a bare one
 * reloads the application and takes the open dialog and its conversation with it.
 */
@Component({
  selector: 'app-markdown-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './markdown-view.component.html',
  styleUrl: './markdown-view.component.css',
})
export class MarkdownViewComponent {
  readonly markdown = input.required<string>();

  readonly blocks = computed<readonly MdBlock[]>(() => parseMarkdown(this.markdown()));

  /** A same-page target stays a plain anchor; `routerLink` would navigate away. */
  isFragment(href: string): boolean {
    return href.startsWith('#');
  }
}
