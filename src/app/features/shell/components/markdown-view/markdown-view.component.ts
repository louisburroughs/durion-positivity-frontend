import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MdBlock, parseMarkdown } from '../../util/markdown.util';

/**
 * MarkdownViewComponent
 * ---------------------
 * Renders an assistant answer's markdown by walking a token tree with ordinary
 * Angular templates. No HTML string is ever built and `innerHTML` is never used,
 * so there is nothing to sanitise and no injection surface — an assistant answer
 * is untrusted input like any other server payload.
 *
 * Headings render at h3–h6: the dialog title is the h2 above them.
 */
@Component({
  selector: 'app-markdown-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  templateUrl: './markdown-view.component.html',
  styleUrl: './markdown-view.component.css',
})
export class MarkdownViewComponent {
  readonly markdown = input.required<string>();

  readonly blocks = computed<readonly MdBlock[]>(() => parseMarkdown(this.markdown()));
}
