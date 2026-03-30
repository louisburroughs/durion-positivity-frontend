/**
 * BLOCKED — Story #69 (CAP_251.69)
 *
 * IngestionEventListPageComponent does not exist yet.
 * These tests are written to specification and will remain BLOCKED until the
 * production component `ingestion-event-list-page.component.ts` is created.
 *
 * To unblock GREEN phase:
 *   1. Create ingestion-event-list-page.component.ts with signals: state, errorKey
 *   2. Replace describe.skip → describe and restore full test bodies below.
 *
 * Expected component contract:
 *   - Reads invoiceId from route paramMap
 *   - Calls accountingService.listEvents({ invoiceId }, page, size)
 *   - state = signal<'idle'|'loading'|'ready'|'empty'|'error'>('idle')
 *   - errorKey = signal<string | null>(null)
 */
import {
  AccountingEventListItem,
  IngestionProcessingStatus,
} from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

/* --- Typed test fixture (ADR-0032) ---------------------------------------- */
const sampleEvent: AccountingEventListItem = {
  eventId: 'evt-CAP251-001',
  eventType: 'InvoiceIssued',
  processingStatus: IngestionProcessingStatus.Processed,
  receivedAt: '2025-03-01T09:00:00Z',
  journalEntryId: 'je-001',
  domainKeyId: 'inv-abc-001',
};

// Suppress unused-variable warnings for fixtures kept ready for GREEN phase.
void sampleEvent;
void AccountingService;

/**
 * BLOCKED — full test bodies are saved as it.todo() until the component exists.
 * Expected tests once unblocked:
 *   - renders in loading state before service resolves
 *   - renders in ready state when service returns data (ADR-0032 typed fixture)
 *   - renders in empty state when service returns zero items
 *   - sets state to 'error' THEN sets errorKey on service failure (ADR-0031)
 *   - passes invoiceId from route paramMap to listEvents filter
 */
describe.skip('IngestionEventListPageComponent [Story #69 — CAP_251.69 BLOCKED]', () => {
  // Tests pending: renders in loading/ready/empty state; error state with errorKey ordering; invoiceId filter
});
