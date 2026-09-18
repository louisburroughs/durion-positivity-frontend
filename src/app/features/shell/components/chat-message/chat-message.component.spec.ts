import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { ChatBlock, ChatMessage } from '../../models/chat.model';
import { ChatMessageComponent } from './chat-message.component';

function message(role: 'user' | 'assistant', blocks: readonly ChatBlock[], pending = false): ChatMessage {
  return { id: 'm1', role, blocks, timestamp: new Date('2026-09-18T09:56:00Z'), pending };
}

describe('ChatMessageComponent', () => {
  let fixture: ComponentFixture<ChatMessageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatMessageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatMessageComponent);
  });

  function render(value: ChatMessage): HTMLElement {
    fixture.componentRef.setInput('message', value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders a user turn as a bubble', () => {
    const host = render(message('user', [{ kind: 'text', text: 'How many mechanics?' }]));
    expect(host.querySelector('.bubble')?.textContent).toContain('How many mechanics?');
    expect(host.querySelector('.turn--assistant')).toBeNull();
  });

  it('renders markdown emphasis as real elements', () => {
    const host = render(
      message('assistant', [{ kind: 'markdown', markdown: 'You have **26 mechanics**.' }]),
    );
    expect(host.querySelector('strong')?.textContent).toBe('26 mechanics');
  });

  it('renders markdown HTML as text, never as markup', () => {
    const host = render(
      message('assistant', [
        { kind: 'markdown', markdown: '<img src=x onerror="alert(1)"> and <b>bold</b>' },
      ]),
    );

    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('b')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('drops an unsafe link target while keeping its label', () => {
    const host = render(
      message('assistant', [
        { kind: 'markdown', markdown: '[click me](javascript:alert(1))' },
      ]),
    );

    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toContain('click me');
  });

  it('routes an in-app markdown link through the router, not a page reload', () => {
    // A bare href would reload the app and destroy the open dialog (ADR-0037).
    const host = render(
      message('assistant', [{ kind: 'markdown', markdown: '[the roster](/app/people)' }]),
    );
    const anchor = host.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('/app/people');
    expect(anchor?.getAttribute('target')).toBeNull();
    // RouterLink renders the resolved href itself, so the directive is the proof.
    expect(fixture.debugElement.query(By.directive(RouterLink))).not.toBeNull();
  });

  it('renders an image from markdown', () => {
    const host = render(
      message('assistant', [
        { kind: 'markdown', markdown: '![tyre wear](https://cdn.example/wear.png)' },
      ]),
    );
    const image = host.querySelector('img.md-image');
    expect(image?.getAttribute('src')).toBe('https://cdn.example/wear.png');
    expect(image?.getAttribute('alt')).toBe('tyre wear');
  });

  it('neutralises a formula in a CSV cell', async () => {
    // Quoting alone does not stop Excel evaluating `=HYPERLINK(...)` on open.
    let written: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
      written = obj as Blob;
      return 'blob:stub';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const block = {
      kind: 'table' as const,
      title: 'Payloads',
      columns: [{ label: 'Formula', align: 'start' as const }],
      rows: [
        ['=HYPERLINK("http://evil","Click")'],
        // Leading whitespace is skipped before a formula is evaluated, so a
        // newline in front of `=` does not make the cell inert.
        ['\n=HYPERLINK("http://evil","Click")'],
        ['\t=cmd|calc'],
        ['ACTIVE'],
      ],
    };
    render(message('assistant', [block]));
    fixture.componentInstance.downloadCsv(block);

    expect(written).not.toBeNull();
    const csv = await (written as unknown as Blob).text();
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).toContain(`"'\n=HYPERLINK`);
    expect(csv).toContain(`"'\t=cmd`);
    // An ordinary cell is left alone.
    expect(csv).toContain('"ACTIVE"');
  });

  it('renders a table with a header row and right-aligned numeric cells', () => {
    const host = render(
      message('assistant', [
        {
          kind: 'table',
          title: 'Mechanics by status',
          columns: [
            { label: 'Status', align: 'start' },
            { label: 'Count', align: 'end' },
          ],
          rows: [['ACTIVE', '26']],
        },
      ]),
    );

    expect(host.querySelectorAll('thead th')).toHaveLength(2);
    expect(host.querySelector('tbody td')?.textContent?.trim()).toBe('ACTIVE');
    expect(host.querySelectorAll('tbody td')[1].classList.contains('numeric')).toBe(true);
    expect(host.querySelector('.block-title')?.textContent).toContain('Mechanics by status');
  });

  it('renders code in a pre block with its language', () => {
    const host = render(
      message('assistant', [{ kind: 'code', language: 'sql', code: 'SELECT 1;' }]),
    );
    expect(host.querySelector('pre code')?.textContent).toBe('SELECT 1;');
    expect(host.querySelector('.code-language')?.textContent?.trim()).toBe('sql');
  });

  it('sizes chart bars against the largest value', () => {
    const host = render(
      message('assistant', [
        {
          kind: 'chart',
          title: null,
          series: [
            { label: 'Bay 1', value: 8 },
            { label: 'Bay 2', value: 16 },
          ],
        },
      ]),
    );

    const fills = host.querySelectorAll<HTMLElement>('.chart-fill');
    expect(fills[0].style.width).toBe('50%');
    expect(fills[1].style.width).toBe('100%');
  });

  it('renders an image with its text alternative', () => {
    const host = render(
      message('assistant', [
        { kind: 'image', url: '/blob/1', alt: 'tyre wear', caption: 'WO-10432' },
      ]),
    );
    const image = host.querySelector('img');
    expect(image?.getAttribute('alt')).toBe('tyre wear');
    expect(host.querySelector('figcaption')?.textContent).toContain('WO-10432');
  });

  it('renders a file block with a download link', () => {
    const host = render(
      message('assistant', [
        { kind: 'file', name: 'bulletin.pdf', sizeBytes: 840_000, mimeType: 'application/pdf', url: '/blob/2' },
      ]),
    );
    expect(host.querySelector('.file-name')?.textContent).toContain('bulletin.pdf');
    expect(host.querySelector('a[download]')?.getAttribute('href')).toBe('/blob/2');
  });

  it('announces an error block and offers a retry that emits the message id', () => {
    const emitted: string[] = [];
    fixture.componentInstance.retry.subscribe(id => emitted.push(id));

    const host = render(
      message('assistant', [
        {
          kind: 'error',
          messageKey: 'SHELL.CHAT.ERROR.BACKEND',
          detailKey: 'SHELL.CHAT.ERROR.DETAIL_STATUS',
          detailParams: { status: 503 },
          correlationId: 'abc-123',
          retryable: true,
        },
      ]),
    );

    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('.text-btn')?.click();
    expect(emitted).toEqual(['m1']);
  });

  it('hides the retry when the failure will not succeed on a second attempt', () => {
    const host = render(
      message('assistant', [
        {
          kind: 'error',
          messageKey: 'SHELL.CHAT.ERROR.BACKEND',
          detailKey: null,
          detailParams: null,
          correlationId: null,
          retryable: false,
        },
      ]),
    );
    expect(host.querySelector('.text-btn')).toBeNull();
  });

  it('shows the typing indicator while a turn is pending, and says so in text', () => {
    const host = render(message('assistant', [], true));
    expect(host.querySelectorAll('.typing-dot')).toHaveLength(3);
    expect(host.querySelector('.turn-actions')).toBeNull();

    // Real text, not an aria-label: the surrounding role="log" needs something to
    // announce, and the dots themselves are hidden from assistive technology.
    expect(host.querySelector('.typing .sr-only')?.textContent).toContain('SHELL.CHAT.TYPING_ARIA');
    expect(host.querySelectorAll('.typing-dot[aria-hidden="true"]')).toHaveLength(3);
  });

  it('renders a chart whose series repeat a label', () => {
    // `track datum.label` made Angular throw on duplicate keys, and the whole
    // message failed to render — the model is free to repeat a label.
    const host = render(
      message('assistant', [
        {
          kind: 'chart',
          title: 'Jobs by bay',
          series: [
            { label: 'Bay 1', value: 4 },
            { label: 'Bay 1', value: 7 },
            { label: 'Bay 2', value: 2 },
          ],
        },
      ]),
    );

    expect(host.querySelectorAll('.chart-row')).toHaveLength(3);
    expect([...host.querySelectorAll('.chart-label')].map(node => node.textContent?.trim())).toEqual([
      'Bay 1',
      'Bay 1',
      'Bay 2',
    ]);
  });

  it('offers no copy control for an error-only turn', () => {
    // blocksToPlainText deliberately yields nothing for an error block, so the
    // button was offering to copy an empty string and giving no feedback.
    const host = render(
      message('assistant', [
        { kind: 'error', messageKey: 'SHELL.CHAT.ERROR.BACKEND', detailKey: null,
          detailParams: null, correlationId: null, retryable: true },
      ]),
    );

    expect(host.querySelector('.turn-actions')).not.toBeNull();
    expect(host.querySelector('.block-btn')).toBeNull();
    expect(host.querySelector('.text-btn')).not.toBeNull();
  });

  it('names the user in their own turns, for a screen reader', () => {
    // The assistant's turns carry a visible sender label; without the matching
    // one here the log gives no way to tell whose message you are on.
    const host = render(message('user', [{ kind: 'text', text: 'How many mechanics?' }]));
    expect(host.querySelector('.sr-only')?.textContent?.trim()).toBe('SHELL.CHAT.SENDER_USER');
  });
});
