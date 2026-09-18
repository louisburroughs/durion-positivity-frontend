import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { LocaleService } from '../../../../core/services/locale.service';
import { SpeechInputService, SpeechInputState } from '../../services/speech-input.service';
import { ChatComposerComponent, formatDuration } from './chat-composer.component';

/** Signal-backed stand-in for the real speech service. */
function speechStub(supported = true) {
  return {
    supported,
    state: signal<SpeechInputState>(supported ? 'idle' : 'unsupported'),
    transcript: signal(''),
    elapsedSeconds: signal(0),
    errorKey: signal<string | null>(null),
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    dismissError: vi.fn(),
  };
}

describe('ChatComposerComponent', () => {
  let fixture: ComponentFixture<ChatComposerComponent>;
  let component: ChatComposerComponent;
  let speech: ReturnType<typeof speechStub>;

  async function setup(options: { supported?: boolean } = {}): Promise<void> {
    speech = speechStub(options.supported ?? true);

    await TestBed.configureTestingModule({
      imports: [ChatComposerComponent, TranslateModule.forRoot()],
      providers: [
        { provide: SpeechInputService, useValue: speech },
        { provide: LocaleService, useValue: { currentLocale: signal('en-US') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatComposerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function textarea(): HTMLTextAreaElement {
    return host().querySelector<HTMLTextAreaElement>('#chat-composer-input')!;
  }

  function type(text: string): void {
    textarea().value = text;
    textarea().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('keeps send disabled until there is non-whitespace text', async () => {
    await setup();
    const send = host().querySelector<HTMLButtonElement>('.icon-btn--send')!;
    expect(send.disabled).toBe(true);

    type('   ');
    expect(send.disabled).toBe(true);

    type('how many mechanics');
    expect(send.disabled).toBe(false);
  });

  it('emits the trimmed message and clears the box on send', async () => {
    await setup();
    const sent: string[] = [];
    component.submitted.subscribe(text => sent.push(text));

    type('  open workorders  ');
    host().querySelector<HTMLButtonElement>('.icon-btn--send')!.click();

    expect(sent).toEqual(['open workorders']);
    expect(component.draft()).toBe('');
  });

  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    await setup();
    const sent: string[] = [];
    component.submitted.subscribe(text => sent.push(text));

    type('first');
    textarea().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(sent).toEqual(['first']);

    type('second');
    textarea().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
    );
    expect(sent).toEqual(['first']);
    expect(component.draft()).toBe('second');
  });

  it('refuses to send while a reply is in flight', async () => {
    await setup();
    const sent: string[] = [];
    component.submitted.subscribe(text => sent.push(text));

    type('a question');
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();

    expect(host().querySelector<HTMLButtonElement>('.icon-btn--send')!.disabled).toBe(true);
    component.submit();
    expect(sent).toEqual([]);
  });

  it('starts dictation in the active locale and mirrors the transcript into the draft', async () => {
    await setup();
    host().querySelector<HTMLButtonElement>('.icon-btn--mic')!.click();
    expect(speech.start).toHaveBeenCalledWith('en-US');

    speech.state.set('listening');
    speech.transcript.set('how many mechanics do i have');
    fixture.detectChanges();

    expect(component.draft()).toBe('how many mechanics do i have');
    expect(textarea().value).toBe('how many mechanics do i have');
  });

  it('leaves a typed draft alone once dictation has stopped', async () => {
    await setup();
    speech.state.set('listening');
    speech.transcript.set('dictated');
    fixture.detectChanges();

    speech.state.set('idle');
    fixture.detectChanges();
    type('typed by hand');

    speech.transcript.set('late transcript');
    fixture.detectChanges();

    expect(component.draft()).toBe('typed by hand');
  });

  it('stops dictation on a second press rather than starting another', async () => {
    await setup();
    speech.state.set('listening');
    fixture.detectChanges();

    host().querySelector<HTMLButtonElement>('.icon-btn--mic')!.click();
    expect(speech.stop).toHaveBeenCalled();
    expect(speech.start).not.toHaveBeenCalled();
  });

  it('shows the listening strip with an elapsed timer, and cancels from it', async () => {
    await setup();
    speech.state.set('listening');
    speech.elapsedSeconds.set(7);
    fixture.detectChanges();

    const strip = host().querySelector('.voice-strip');
    expect(strip).not.toBeNull();
    expect(strip?.getAttribute('role')).toBe('status');
    expect(host().querySelector('.voice-timer')?.textContent?.trim()).toBe('0:07');

    host().querySelector<HTMLButtonElement>('.voice-strip .ghost-btn')!.click();
    expect(speech.cancel).toHaveBeenCalled();
  });

  it('discards a live transcript when the message is sent', async () => {
    await setup();
    type('ready to send');
    host().querySelector<HTMLButtonElement>('.icon-btn--send')!.click();
    expect(speech.cancel).toHaveBeenCalled();
  });

  it('announces a recognition failure and dismisses it', async () => {
    await setup();
    speech.state.set('error');
    speech.errorKey.set('SHELL.CHAT.VOICE.ERROR_DENIED');
    fixture.detectChanges();

    const error = host().querySelector('.voice-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('SHELL.CHAT.VOICE.ERROR_DENIED');

    host().querySelector<HTMLButtonElement>('.voice-error .ghost-btn')!.click();
    expect(speech.dismissError).toHaveBeenCalled();
  });

  it('disables the mic where the browser cannot recognise speech, without blocking typing', async () => {
    await setup({ supported: false });

    const mic = host().querySelector<HTMLButtonElement>('.icon-btn--mic')!;
    expect(mic.disabled).toBe(true);
    expect(mic.getAttribute('aria-label')).toBe('SHELL.CHAT.VOICE.UNSUPPORTED');

    type('typed instead');
    expect(host().querySelector<HTMLButtonElement>('.icon-btn--send')!.disabled).toBe(false);
  });

  it('offers the ingest control only to a user who may ingest', async () => {
    await setup();
    expect(host().querySelector('[aria-label="SHELL.RAG.BUTTON_ARIA"]')).toBeNull();

    fixture.componentRef.setInput('canIngest', true);
    fixture.detectChanges();

    const requests: unknown[] = [];
    component.ingestRequested.subscribe(() => requests.push(true));
    host().querySelector<HTMLButtonElement>('[aria-label="SHELL.RAG.BUTTON_ARIA"]')!.click();
    expect(requests).toHaveLength(1);
  });

  it('labels the message box and links its hint for assistive technology', async () => {
    await setup();
    expect(host().querySelector('label[for="chat-composer-input"]')).not.toBeNull();
    expect(textarea().getAttribute('aria-describedby')).toBe('chat-composer-hint');
    expect(host().querySelector('#chat-composer-hint')).not.toBeNull();
  });

  it('seeds the box from a suggestion', async () => {
    await setup();
    component.setDraft('Show open workorders by bay');
    fixture.detectChanges();
    expect(textarea().value).toBe('Show open workorders by bay');
  });
});

describe('formatDuration', () => {
  it('renders elapsed seconds as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7)).toBe('0:07');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(600)).toBe('10:00');
  });
});
