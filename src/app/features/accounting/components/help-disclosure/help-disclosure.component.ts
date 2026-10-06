import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';

/**
 * The accounting workspace's help pattern (SPEC-accounting-workspace §5.6):
 * a **What's this?** (or question-specific) disclosure on a card or a tricky
 * control.
 *
 * A native `<details>/<summary>`, so it opens by keyboard and screen reader
 * with no script, styled as a link with the help icon. Two or three sentences
 * (`textKey`) and an example (`exampleKey`), all i18n keys.
 *
 * `contextKey` names what the help is about. It is appended to the summary for
 * assistive technology only, after the visible text, so several "What's this?"
 * disclosures on one page keep distinct accessible names while the visible
 * label still starts the name (Label in Name, ADR-0029 §8.6).
 *
 * Reused by S5, S6 and later accounting pages: give it a key under
 * `ACCOUNTING.HELP` (shared copy) or under the page's own namespace.
 */
@Component({
  selector: 'app-help-disclosure',
  standalone: true,
  imports: [TranslatePipe, MaterialSymbolPipe],
  templateUrl: './help-disclosure.component.html',
  styleUrl: './help-disclosure.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpDisclosureComponent {
  /** The visible summary; defaults to "What's this?". */
  readonly summaryKey = input('ACCOUNTING.HELP.WHATS_THIS');
  /** What the help is about, for assistive technology (e.g. the card title key). */
  readonly contextKey = input<string | null>(null);
  readonly textKey = input.required<string>();
  readonly exampleKey = input<string | null>(null);
}
