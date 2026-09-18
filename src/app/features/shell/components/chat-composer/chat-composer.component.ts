import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LocaleService } from '../../../../core/services/locale.service';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';
import { SpeechInputService } from '../../services/speech-input.service';

/** Grow the textarea up to six lines, then let it scroll. */
const MAX_TEXTAREA_ROWS = 6;
const LINE_HEIGHT_PX = 21;
const TEXTAREA_PADDING_PX = 16;

/**
 * ChatComposerComponent
 * ---------------------
 * The message box: text, voice and (for admins) document ingestion.
 *
 * Dictation writes into the SAME textarea the keyboard does, so a recognised
 * question can be corrected before it is sent — the mic is an input method, not a
 * separate send path.
 */
@Component({
  selector: 'app-chat-composer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MaterialSymbolPipe],
  templateUrl: './chat-composer.component.html',
  styleUrl: './chat-composer.component.css',
})
export class ChatComposerComponent {
  private readonly speech = inject(SpeechInputService);
  private readonly localeService = inject(LocaleService);

  /** True while a reply is in flight: the box stays readable but cannot send. */
  readonly busy = input(false);
  /** Admin-only: show the control that loads a document into the knowledge base. */
  readonly canIngest = input(false);

  readonly submitted = output<string>();
  readonly ingestRequested = output<void>();

  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('input');

  readonly draft = signal('');

  readonly voiceSupported = this.speech.supported;
  readonly voiceState = this.speech.state;
  readonly voiceErrorKey = this.speech.errorKey;
  readonly listening = computed(
    () => this.voiceState() === 'listening' || this.voiceState() === 'starting',
  );
  readonly elapsed = computed(() => formatDuration(this.speech.elapsedSeconds()));
  readonly canSend = computed(() => this.draft().trim().length > 0 && !this.busy());

  /** What was already in the box when dictation started; recognised words append to it. */
  private dictationPrefix = '';

  constructor() {
    // Mirror recognised speech into the draft so it stays editable before sending.
    // It APPENDS to whatever was already typed: overwriting it would silently throw
    // away the user's own words the moment they pressed the mic.
    effect(() => {
      if (!this.listening()) return;
      const transcript = this.speech.transcript();
      if (transcript.length === 0) return;
      this.draft.set(this.dictationPrefix ? `${this.dictationPrefix} ${transcript}` : transcript);
      this.resize();
    });
  }

  submit(): void {
    const text = this.draft().trim();
    if (text.length === 0 || this.busy()) return;

    this.speech.cancel();
    this.dictationPrefix = '';
    this.draft.set('');
    this.resize();
    this.submitted.emit(text);
  }

  onInput(value: string): void {
    this.draft.set(value);
    this.resize();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  toggleVoice(): void {
    if (this.listening()) {
      this.speech.stop();
      this.focus();
      return;
    }
    this.speech.dismissError();
    this.dictationPrefix = this.draft().trimEnd();
    this.speech.start(this.localeService.currentLocale());
  }

  cancelVoice(): void {
    this.speech.cancel();
    // Put back exactly what was typed before the mic was pressed.
    this.draft.set(this.dictationPrefix);
    this.dictationPrefix = '';
    this.resize();
    this.focus();
  }

  dismissVoiceError(): void {
    this.speech.dismissError();
  }

  focus(): void {
    this.textarea()?.nativeElement.focus();
  }

  private resize(): void {
    const element = this.textarea()?.nativeElement;
    if (!element) return;
    element.style.height = 'auto';
    const max = MAX_TEXTAREA_ROWS * LINE_HEIGHT_PX + TEXTAREA_PADDING_PX;
    element.style.height = `${Math.min(element.scrollHeight, max)}px`;
  }
}

/** `m:ss` elapsed recording time. */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
