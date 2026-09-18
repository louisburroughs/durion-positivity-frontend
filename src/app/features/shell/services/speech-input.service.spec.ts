import { TestBed } from '@angular/core/testing';
import { SpeechInputService } from './speech-input.service';

/** Minimal stand-in for the browser's SpeechRecognition, driven by the test. */
class FakeRecognition {
  static last: FakeRecognition | null = null;

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  started = false;
  aborted = false;
  stopped = false;

  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  constructor() {
    FakeRecognition.last = this;
  }

  start(): void {
    this.started = true;
    this.onstart?.();
  }

  stop(): void {
    this.stopped = true;
    this.onend?.();
  }

  abort(): void {
    this.aborted = true;
  }

  /** Feed a recognition result, final or interim. */
  emit(transcript: string, isFinal: boolean): void {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript }], { isFinal })],
    });
  }
}

type SpeechWindow = Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };

describe('SpeechInputService', () => {
  const speechWindow = window as SpeechWindow;
  let originalStandard: unknown;
  let originalWebkit: unknown;

  beforeEach(() => {
    originalStandard = speechWindow.SpeechRecognition;
    originalWebkit = speechWindow.webkitSpeechRecognition;
    FakeRecognition.last = null;
  });

  afterEach(() => {
    speechWindow.SpeechRecognition = originalStandard;
    speechWindow.webkitSpeechRecognition = originalWebkit;
    TestBed.resetTestingModule();
  });

  function serviceWithRecognition(): SpeechInputService {
    speechWindow.SpeechRecognition = FakeRecognition;
    TestBed.configureTestingModule({});
    return TestBed.inject(SpeechInputService);
  }

  it('reports unsupported when the browser has no recognition engine', () => {
    delete speechWindow.SpeechRecognition;
    delete speechWindow.webkitSpeechRecognition;
    TestBed.configureTestingModule({});

    const service = TestBed.inject(SpeechInputService);
    expect(service.supported).toBe(false);
    expect(service.state()).toBe('unsupported');

    service.start('en-US');
    expect(FakeRecognition.last).toBeNull();
    expect(service.state()).toBe('unsupported');
  });

  it('falls back to the webkit-prefixed constructor', () => {
    delete speechWindow.SpeechRecognition;
    speechWindow.webkitSpeechRecognition = FakeRecognition;
    TestBed.configureTestingModule({});

    expect(TestBed.inject(SpeechInputService).supported).toBe(true);
  });

  it('listens with the requested language and accumulates final text', () => {
    const service = serviceWithRecognition();
    service.start('fr-CA');

    const recognition = FakeRecognition.last!;
    expect(recognition.lang).toBe('fr-CA');
    expect(recognition.interimResults).toBe(true);
    expect(service.state()).toBe('listening');

    recognition.emit('how many ', true);
    recognition.emit('mechanics', false);
    expect(service.transcript()).toBe('how many mechanics');
  });

  it('keeps the transcript on stop and drops it on cancel', () => {
    const service = serviceWithRecognition();
    service.start('en-US');
    FakeRecognition.last!.emit('open workorders', true);

    service.stop();
    expect(service.state()).toBe('idle');
    expect(service.transcript()).toBe('open workorders');

    service.start('en-US');
    FakeRecognition.last!.emit('discard me', true);
    service.cancel();

    expect(service.transcript()).toBe('');
    expect(FakeRecognition.last!.aborted).toBe(true);
  });

  it('maps a denied microphone to its own message key', () => {
    const service = serviceWithRecognition();
    service.start('en-US');
    FakeRecognition.last!.onerror?.({ error: 'not-allowed' });

    expect(service.state()).toBe('error');
    expect(service.errorKey()).toBe('SHELL.CHAT.VOICE.ERROR_DENIED');

    service.dismissError();
    expect(service.state()).toBe('idle');
    expect(service.errorKey()).toBeNull();
  });

  it('maps an unknown error code to the generic message key', () => {
    const service = serviceWithRecognition();
    service.start('en-US');
    FakeRecognition.last!.onerror?.({ error: 'something-new' });

    expect(service.errorKey()).toBe('SHELL.CHAT.VOICE.ERROR_GENERIC');
  });

  it('treats an abort as an ordinary stop rather than a failure', () => {
    const service = serviceWithRecognition();
    service.start('en-US');
    FakeRecognition.last!.onerror?.({ error: 'aborted' });

    expect(service.state()).toBe('idle');
    expect(service.errorKey()).toBeNull();
  });

  it('ignores a second start while already listening', () => {
    const service = serviceWithRecognition();
    service.start('en-US');
    const first = FakeRecognition.last;

    service.start('en-US');
    expect(FakeRecognition.last).toBe(first);
  });
});
