import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { ChatApiService } from '../../services/chat-api.service';
import { RagIngestDialogComponent } from './rag-ingest-dialog.component';
import enUS from '../../../../../assets/i18n/en-US.json';

const translations = {
  SHELL: {
    RAG: {
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
        NOT_PERMITTED: enUS.SHELL.RAG.ERROR.NOT_PERMITTED,
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

  /** Granted by default: the dialog is only ever opened by a permitted caller. */
  const authServiceStub = {
    permissionsKnown: vi.fn().mockReturnValue(true),
    hasAnyPermission: vi.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    authServiceStub.permissionsKnown.mockReturnValue(true);
    authServiceStub.hasAnyPermission.mockReturnValue(true);

    await TestBed.configureTestingModule({
      imports: [RagIngestDialogComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ChatApiService, useValue: chatApiStub },
        { provide: AuthService, useValue: authServiceStub },
      ],
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

  // ── The write permission, re-checked by the write itself (ADR-0040 §6a) ──
  it('refuses the submit when the permission was lost after the dialog opened', () => {
    // The gate that opened this dialog proves nothing about the token now: a
    // silent refresh can drop `mcp:document:ingest` while the document is being
    // pasted in, and the endpoint would answer 403 (ADR-0040 §6a.1).
    component.content.set('Policy document text');
    component.metaTitle.set('Q1 Refund Policy');

    authServiceStub.hasAnyPermission.mockReturnValue(false);
    component.submit();
    fixture.detectChanges();

    expect(chatApiStub.ingestDocument).not.toHaveBeenCalled();
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('SHELL.RAG.ERROR.NOT_PERMITTED');

    // The panel names the refusal rather than inviting a retry that cannot work
    // (ADR-0064 §4); the claim is asserted against the real bundle, not a
    // spec-local copy (ADR-0035 §8).
    const alert: HTMLElement = fixture.nativeElement.querySelector('.rag-status--error');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain(enUS.SHELL.RAG.ERROR.NOT_PERMITTED);
    expect(enUS.SHELL.RAG.ERROR.NOT_PERMITTED.toLowerCase()).toContain('permission');

    // Still usable: the typed document is intact and a restored permission sends
    // it without reopening the dialog.
    expect(component.content()).toBe('Policy document text');
    vi.mocked(chatApiStub.ingestDocument).mockReturnValueOnce(of(undefined));
    authServiceStub.hasAnyPermission.mockReturnValue(true);
    component.submit();

    expect(chatApiStub.ingestDocument).toHaveBeenCalledTimes(1);
    expect(component.state()).toBe('success');
    expect(component.errorKey()).toBeNull();
  });

  it('submits for a caller that holds the permission — the positive half', () => {
    // The granted half of the split (ADR-0040 §6a.5, ADR-0035 §7).
    vi.mocked(chatApiStub.ingestDocument).mockReturnValueOnce(of(undefined));
    authServiceStub.permissionsKnown.mockReturnValue(true);
    authServiceStub.hasAnyPermission.mockReturnValue(true);

    component.content.set('Policy document text');
    component.metaTitle.set('Q1 Refund Policy');
    component.submit();

    expect(chatApiStub.ingestDocument).toHaveBeenCalledTimes(1);
    expect(component.state()).toBe('success');
  });

  it('submits for a legacy token whose permissions are unknown', () => {
    // No `perm_bits` claim: permissions are UNKNOWN, not denied, and the gate
    // follows `AuthService.canAccess()` rather than locking the caller out
    // (ADR-0040 §6a.3). `hasAnyPermission` answers false for such a token, so a
    // check that ignored `permissionsKnown()` would refuse it.
    vi.mocked(chatApiStub.ingestDocument).mockReturnValueOnce(of(undefined));
    authServiceStub.permissionsKnown.mockReturnValue(false);
    authServiceStub.hasAnyPermission.mockReturnValue(false);

    component.content.set('Policy document text');
    component.metaTitle.set('Q1 Refund Policy');
    component.submit();

    expect(chatApiStub.ingestDocument).toHaveBeenCalledTimes(1);
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

  // ── Native modal (ADR-0029 §8.1) ──────────────────────────────────────────
  it('renders as a real native modal', () => {
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog')!;
    expect(dialog.matches(':modal')).toBe(true);
  });

  it('calls close() when the dialog fires cancel (Escape)', () => {
    // appModalDialog forwards the browser's own Escape handling as `cancel`; a
    // scripted keydown never reaches the UA's Escape-to-close algorithm, so the
    // directive's contract is exercised at the event it actually translates.
    const closeSpy = vi.spyOn(component, 'close');
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog')!;

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
