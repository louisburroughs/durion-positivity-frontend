import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ChatApiService } from '../../services/chat-api.service';
import { RagIngestDialogComponent } from './rag-ingest-dialog.component';

const translations = {
  SHELL: {
    RAG: {
      BUTTON_ARIA: 'Load document into knowledge base',
      BUTTON_TITLE: 'Load document (Admin)',
      DIALOG_ARIA: 'RAG document ingestion dialog',
      TITLE: 'Load Document into Knowledge Base',
      CLOSE_ARIA: 'Close dialog',
      SUCCESS: 'Document successfully loaded into the knowledge base.',
      ADD_ANOTHER: 'Load Another',
      DONE: 'Done',
      SUBMIT: 'Load Document',
      SUBMITTING: 'Loading…',
      CANCEL: 'Cancel',
      FIELD: { CONTENT: 'Document content', TITLE: 'Title', SOURCE: 'Source', TYPE: 'Type' },
      PLACEHOLDER: { CONTENT: '…content', TITLE: '…title', SOURCE: '…source', TYPE: '…type' },
      ERROR: {
        CONTENT_REQUIRED: 'Document content is required.',
        TITLE_REQUIRED: 'Title is required.',
        SUBMIT: 'Failed to load the document. Please try again.',
      },
    },
  },
};

describe('RagIngestDialogComponent', () => {
  let fixture: ComponentFixture<RagIngestDialogComponent>;
  let component: RagIngestDialogComponent;

  const chatApiStub: Pick<ChatApiService, 'sendMessage' | 'ingestDocument'> = {
    sendMessage: vi.fn(),
    ingestDocument: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RagIngestDialogComponent, TranslateModule.forRoot()],
      providers: [{ provide: ChatApiService, useValue: chatApiStub }],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', translations);
    translate.use('en-US');

    fixture = TestBed.createComponent(RagIngestDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial state ──────────────────────────────────────────────────────
  it('renders the dialog with a title', () => {
    const title: HTMLElement = fixture.nativeElement.querySelector('#rag-dialog-title');
    expect(title?.textContent?.trim()).toBe('Load Document into Knowledge Base');
  });

  it('starts in idle state with empty fields', () => {
    expect(component.state()).toBe('idle');
    expect(component.content()).toBe('');
    expect(component.metaTitle()).toBe('');
    expect(component.metaSource()).toBe('manual');
    expect(component.metaType()).toBe('policy');
  });

  // ── Validation ─────────────────────────────────────────────────────────
  it('shows content-required error when content is blank on submit', () => {
    component.submit();
    fixture.detectChanges();

    expect(component.contentError()).toBe('SHELL.RAG.ERROR.CONTENT_REQUIRED');
    expect(chatApiStub.ingestDocument).not.toHaveBeenCalled();
  });

  it('shows title-required error when title is blank on submit', () => {
    component.content.set('Some content');
    component.submit();
    fixture.detectChanges();

    expect(component.titleError()).toBe('SHELL.RAG.ERROR.TITLE_REQUIRED');
    expect(chatApiStub.ingestDocument).not.toHaveBeenCalled();
  });

  it('shows both validation errors when both fields are blank', () => {
    component.submit();
    fixture.detectChanges();

    expect(component.contentError()).toBe('SHELL.RAG.ERROR.CONTENT_REQUIRED');
    expect(component.titleError()).toBe('SHELL.RAG.ERROR.TITLE_REQUIRED');
  });

  // ── Successful submission ───────────────────────────────────────────────
  it('calls ingestDocument and transitions to success state on valid submit', () => {
    vi.mocked(chatApiStub.ingestDocument).mockReturnValueOnce(of(undefined));

    component.content.set('Policy document text');
    component.metaTitle.set('Q1 Refund Policy');
    component.metaSource.set('manual');
    component.metaType.set('policy');
    component.submit();

    expect(chatApiStub.ingestDocument).toHaveBeenCalledWith({
      content: 'Policy document text',
      metadata: { source: 'manual', type: 'policy', title: 'Q1 Refund Policy' },
    });
    expect(component.state()).toBe('success');
  });

  it('trims whitespace from content and title before submission', () => {
    vi.mocked(chatApiStub.ingestDocument).mockReturnValueOnce(of(undefined));

    component.content.set('  trimmed content  ');
    component.metaTitle.set('  trimmed title  ');
    component.submit();

    expect(chatApiStub.ingestDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'trimmed content',
        metadata: expect.objectContaining({ title: 'trimmed title' }),
      }),
    );
  });

  // ── Error state ─────────────────────────────────────────────────────────
  it('transitions to error state when ingestDocument fails', () => {
    vi.mocked(chatApiStub.ingestDocument).mockReturnValueOnce(throwError(() => new Error('500')));

    component.content.set('Content');
    component.metaTitle.set('Title');
    component.submit();

    expect(component.state()).toBe('error');
  });

  // ── Reset ───────────────────────────────────────────────────────────────
  it('reset() clears all fields and returns to idle', () => {
    vi.mocked(chatApiStub.ingestDocument).mockReturnValueOnce(of(undefined));
    component.content.set('Text');
    component.metaTitle.set('Title');
    component.submit();

    component.reset();

    expect(component.state()).toBe('idle');
    expect(component.content()).toBe('');
    expect(component.metaTitle()).toBe('');
    expect(component.contentError()).toBeNull();
    expect(component.titleError()).toBeNull();
  });

  // ── Close ───────────────────────────────────────────────────────────────
  it('emits closed event when close() is called', () => {
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);
    component.close();

    expect(closedSpy).toHaveBeenCalledTimes(1);
  });

  it('emits closed and resets when the close button is clicked', () => {
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);

    component.content.set('Some text');
    fixture.detectChanges();

    const closeBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.rag-dialog__close');
    closeBtn.click();

    expect(closedSpy).toHaveBeenCalledTimes(1);
    expect(component.content()).toBe('');
  });

  // ── Keyboard ────────────────────────────────────────────────────────────
  it('calls close() when Escape is pressed', () => {
    const closeSpy = vi.spyOn(component, 'close');
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('does not call close() for non-Escape keys', () => {
    const closeSpy = vi.spyOn(component, 'close');
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(closeSpy).not.toHaveBeenCalled();
  });
});
