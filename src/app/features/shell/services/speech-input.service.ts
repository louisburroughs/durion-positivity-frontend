import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * SpeechInputService
 * ------------------
 * Voice dictation for the chat composer, on the browser's own recognition engine
 * (`SpeechRecognition` / `webkitSpeechRecognition`). Recognised words land in
 * {@link transcript}; the composer mirrors them into its textarea so a dictated
 * question can be corrected before it is sent.
 *
 * Where the browser has no recognition engine the service reports `unsupported`
 * and the composer disables its mic with an explanation — it does NOT record
 * audio, because there is no server transcription endpoint to send it to yet
 * (`environment.features.chatSpeechTranscription`, tracked as a backend issue).
 */
export type SpeechInputState = 'unsupported' | 'idle' | 'starting' | 'listening' | 'error';

/** The slice of the Web Speech API this service uses; it is not in lib.dom. */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechCapableWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

/** Recognition error code → translation key. */
const ERROR_KEYS: Readonly<Record<string, string>> = {
  'not-allowed': 'SHELL.CHAT.VOICE.ERROR_DENIED',
  'service-not-allowed': 'SHELL.CHAT.VOICE.ERROR_DENIED',
  'audio-capture': 'SHELL.CHAT.VOICE.ERROR_NO_DEVICE',
  'no-speech': 'SHELL.CHAT.VOICE.ERROR_NO_SPEECH',
  network: 'SHELL.CHAT.VOICE.ERROR_NETWORK',
};
const GENERIC_ERROR_KEY = 'SHELL.CHAT.VOICE.ERROR_GENERIC';

@Injectable({ providedIn: 'root' })
export class SpeechInputService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _state = signal<SpeechInputState>('idle');
  private readonly _transcript = signal('');
  private readonly _elapsedSeconds = signal(0);
  private readonly _errorKey = signal<string | null>(null);

  readonly state = this._state.asReadonly();
  readonly transcript = this._transcript.asReadonly();
  readonly elapsedSeconds = this._elapsedSeconds.asReadonly();
  readonly errorKey = this._errorKey.asReadonly();

  /** True when this browser can recognise speech locally. */
  readonly supported: boolean;

  private recognition: SpeechRecognitionLike | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private finalText = '';

  constructor() {
    this.supported = this.resolveConstructor() !== null;
    if (!this.supported) {
      this._state.set('unsupported');
    }
    this.destroyRef.onDestroy(() => this.cancel());
  }

  /** Begin listening. `languageTag` is a BCP-47 tag such as `en-US`. */
  start(languageTag: string): void {
    if (!this.supported || this._state() === 'listening' || this._state() === 'starting') return;

    const Recognition = this.resolveConstructor();
    if (!Recognition) return;

    this.finalText = '';
    this._transcript.set('');
    this._errorKey.set(null);
    this._elapsedSeconds.set(0);
    this._state.set('starting');

    const recognition = new Recognition();
    recognition.lang = languageTag;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this._state.set('listening');
      this.startTimer();
    };
    recognition.onresult = event => this.onResult(event);
    recognition.onerror = event => this.onError(event.error);
    recognition.onend = () => {
      this.stopTimer();
      if (this._state() !== 'error') {
        this._state.set('idle');
      }
      this.recognition = null;
    };

    this.recognition = recognition;

    try {
      recognition.start();
    } catch {
      // Already started, or blocked by the browser before the error event fires.
      this.onError('aborted');
    }
  }

  /** Stop listening and keep what was recognised. */
  stop(): void {
    this.stopTimer();
    this.recognition?.stop();
    if (this._state() === 'listening' || this._state() === 'starting') {
      this._state.set('idle');
    }
  }

  /** Stop listening and throw the transcript away. */
  cancel(): void {
    this.stopTimer();
    this.recognition?.abort();
    this.recognition = null;
    this.finalText = '';
    this._transcript.set('');
    this._elapsedSeconds.set(0);
    if (this._state() !== 'unsupported') {
      this._state.set('idle');
    }
  }

  /** Drop a recognition error once the user has seen it. */
  dismissError(): void {
    if (this._state() === 'error') {
      this._state.set('idle');
    }
    this._errorKey.set(null);
  }

  private onResult(event: SpeechRecognitionEventLike): void {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0]?.transcript ?? '';
      if (result.isFinal) {
        this.finalText = `${this.finalText}${text}`;
      } else {
        interim += text;
      }
    }
    this._transcript.set(`${this.finalText}${interim}`.trimStart());
  }

  private onError(code: string | undefined): void {
    this.stopTimer();
    this.recognition = null;
    // A silent stretch is not a failure worth a red banner: keep what was heard.
    if (code === 'aborted') {
      this._state.set('idle');
      return;
    }
    this._state.set('error');
    this._errorKey.set(ERROR_KEYS[code ?? ''] ?? GENERIC_ERROR_KEY);
  }

  private startTimer(): void {
    this.stopTimer();
    if (!isPlatformBrowser(this.platformId)) return;
    this.timer = setInterval(() => this._elapsedSeconds.update(seconds => seconds + 1), 1000);
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private resolveConstructor(): SpeechRecognitionConstructor | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const scope = window as unknown as SpeechCapableWindow;
    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
  }
}
