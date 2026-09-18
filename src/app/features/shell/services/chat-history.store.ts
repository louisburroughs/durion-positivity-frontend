import { inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ChatBlock, ChatConversation, ChatMessage } from '../models/chat.model';
import { coerceBlocks } from '../util/chat-response.mapper';
import { encodeIdentityPart } from '../util/identity.util';

/**
 * Conversation persistence seam
 * -----------------------------
 * The MCP server has no conversation-history endpoints yet
 * (durion-positivity-backend#2073), so the shipped implementation keeps history in
 * this browser only ({@link LocalChatHistoryStore}).
 *
 * Every caller already talks to this ASYNC contract, so a remote implementation
 * needs no caller rewrite for ordering or error handling. It is not a drop-in
 * provider swap either: the chat send request (`chat-api.service.ts`) carries no
 * conversation id, so a server-side store cannot attribute a turn to a
 * conversation until backend#2073 defines that field. The contract below is the
 * seam; wiring a remote store also means extending the send contract.
 *
 * Storage is namespaced by the token's tenant AND subject, so neither switching
 * accounts nor switching tenants in one browser can surface conversations that
 * belong to the other — and those conversations quote customer and invoice data
 * (ADR-0062: the tenant comes from the token's `tid` claim, nowhere else).
 *
 * Failures are reported, never laundered: a read that could not be understood
 * ERRORS rather than answering "no history", and a write that did not land ERRORS
 * rather than reporting success — whether the browser refused it
 * ({@link ChatHistoryUnavailableError}) or the conversation it targets is not in
 * storage to write into ({@link ChatHistoryWriteRefusedError}) — so the state
 * layer can tell the user (ADR-0064 §1/§6, ADR-0065 §6). The single exception is
 * a store with no slot at all (the server, or a token carrying no tenant): no
 * write is attempted, none is claimed, and there is no persisted copy to lose.
 */
export interface ChatHistoryStore {
  /**
   * Translation key describing where this store keeps history, rendered in the
   * history rail. Part of the contract because the claim is
   * implementation-specific: "kept in this browser" is false the moment a
   * server-backed store is provided.
   */
  readonly retentionNoteKey: string;

  /** Conversations, newest first. */
  listConversations(): Observable<readonly ChatConversation[]>;
  loadMessages(conversationId: string): Observable<readonly ChatMessage[]>;
  /**
   * Insert or update a conversation's METADATA, leaving its stored messages
   * untouched. Deliberately separate from {@link saveMessages}: a rename or a pin
   * knows nothing about the message list, and an earlier combined signature let
   * those callers write an empty list over a background conversation's history.
   */
  saveConversation(conversation: ChatConversation): Observable<void>;
  /**
   * Replace a conversation's whole message list. ERRORS when the conversation is
   * not in the store: there is nothing to write the messages into, and answering
   * "saved" for a list that was never persisted is what let a full or disabled
   * storage look like a clean save — the warning it should have raised was
   * cleared by this very call (ADR-0064 §1, ADR-0065 §6). Callers write the
   * metadata first; {@link saveConversation} is the call that CREATES a
   * conversation, so it has no such precondition.
   */
  saveMessages(conversationId: string, messages: readonly ChatMessage[]): Observable<void>;
  deleteConversation(conversationId: string): Observable<void>;
  /** Drop every conversation for the current user. */
  clear(): Observable<void>;
}

/** Storage schema version: a bump discards anything written by an older shape. */
const STORAGE_PREFIX = 'durion-chat-history-v1';
/** Keeps the payload inside a typical 5 MB localStorage budget. */
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES_PER_CONVERSATION = 200;

interface PersistedMessage {
  readonly id: string;
  readonly role: string;
  readonly blocks: readonly unknown[];
  readonly timestamp: string;
}

interface PersistedConversation {
  readonly id: string;
  readonly title: string;
  readonly preview: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly pinned: boolean;
  readonly messages: readonly PersistedMessage[];
}

@Injectable({ providedIn: 'root' })
export class LocalChatHistoryStore implements ChatHistoryStore {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly auth = inject(AuthService);

  readonly retentionNoteKey = 'SHELL.CHAT.HISTORY.RETENTION_NOTE';

  listConversations(): Observable<readonly ChatConversation[]> {
    const outcome = this.read();
    // An unreadable store is NOT an empty history: answering `[]` tells the rail
    // this user has never had a conversation, which is a claim the read never
    // established (ADR-0064 §1/§4). The state layer maps this to HISTORY_LOAD.
    if (!outcome.ok) return throwError(() => new ChatHistoryUnavailableError('read'));

    const conversations = outcome.entries.map(entry => toConversation(entry)).sort(byPinnedThenRecent);
    return of(conversations);
  }

  loadMessages(conversationId: string): Observable<readonly ChatMessage[]> {
    const outcome = this.read();
    if (!outcome.ok) return throwError(() => new ChatHistoryUnavailableError('read'));

    const entry = outcome.entries.find(candidate => candidate.id === conversationId);
    if (!entry) return of([]);
    // Each entry is validated before conversion: `read()` only checks that
    // `messages` is an array, so a null or malformed member would otherwise throw
    // here — a malformed MEMBER is filtered out, not treated as an outage.
    return of(entry.messages.filter(isPersistedMessage).map(toMessage).filter(isMessage));
  }

  saveConversation(conversation: ChatConversation): Observable<void> {
    const outcome = this.read();
    if (!outcome.ok) return throwError(() => new ChatHistoryUnavailableError('write'));
    const existing = outcome.entries.find(entry => entry.id === conversation.id);

    return this.toResult(
      this.upsert(outcome.entries, {
        id: conversation.id,
        title: conversation.title,
        preview: conversation.preview,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        pinned: conversation.pinned,
        // Carry the stored messages forward: metadata writes never touch them.
        messages: existing?.messages ?? [],
      }),
    );
  }

  saveMessages(conversationId: string, messages: readonly ChatMessage[]): Observable<void> {
    const outcome = this.read();
    if (!outcome.ok) return throwError(() => new ChatHistoryUnavailableError('write'));

    const existing = outcome.entries.find(entry => entry.id === conversationId);
    if (!existing) {
      // There is no entry to write these messages into, so this write did NOT
      // land. Answering `of(undefined)` reported a save that never happened, and
      // the state layer's write queue then CLEARED the warning the preceding
      // failed `saveConversation` had just raised — the first turn of a new
      // conversation against a full localStorage looked saved and was gone on the
      // next reload (ADR-0064 §1, ADR-0065 §6).

      // No slot at all: nothing was attempted, so nothing is claimed either.
      if (!this.hasStorageSlot()) return of(undefined);
      return throwError(() => new ChatHistoryWriteRefusedError(conversationId));
    }

    return this.toResult(
      this.upsert(outcome.entries, {
        ...existing,
        messages: messages.slice(-MAX_MESSAGES_PER_CONVERSATION).map(message => ({
          id: message.id,
          role: message.role,
          blocks: message.blocks as readonly unknown[],
          timestamp: message.timestamp.toISOString(),
        })),
      }),
    );
  }

  /** Move an entry to the front of the stored list and write it back. */
  private upsert(stored: readonly PersistedConversation[], entry: PersistedConversation): boolean {
    const rest = stored.filter(candidate => candidate.id !== entry.id);
    return this.write(trimToBudget(entry, rest));
  }

  deleteConversation(conversationId: string): Observable<void> {
    const outcome = this.read();
    if (!outcome.ok) return throwError(() => new ChatHistoryUnavailableError('write'));
    return this.toResult(this.write(outcome.entries.filter(entry => entry.id !== conversationId)));
  }

  clear(): Observable<void> {
    return this.toResult(this.remove());
  }

  /**
   * A write that did not land errors; only a write the browser accepted — or one
   * there was no slot to attempt, see {@link hasStorageSlot} — resolves. Swallowing
   * a refusal kept the in-memory history looking persisted until the next reload
   * dropped it, with nothing on screen to say so (ADR-0065 §6).
   */
  private toResult(persisted: boolean): Observable<void> {
    return persisted ? of(undefined) : throwError(() => new ChatHistoryUnavailableError('write'));
  }

  /**
   * Whether this store has somewhere to write at all: a browser, and a
   * tenant-scoped key. Without one no write is attempted, so there is no refusal
   * to report and no persisted copy the user could lose — a warning here would
   * claim a loss that never happened (ADR-0064 §4).
   */
  private hasStorageSlot(): boolean {
    return isPlatformBrowser(this.platformId) && this.key() !== null;
  }

  /**
   * Storage key for the current tenant + subject. The same person signed into two
   * tenants gets two slots: one `sub` can outlive a tenant switch, and reading the
   * previous tenant's conversations would be a cross-tenant data leak.
   */
  private key(): string | null {
    const claims = this.auth.currentUserClaims();
    const tenant = claims?.tid?.trim();
    const subject = claims?.sub?.trim();
    // No authenticated tenant, no history. A shared `no-tenant` slot would put
    // one subject's transcripts from two tenant contexts in the same bucket —
    // the very leak the key exists to prevent (ADR-0062: `tid`, nothing else).
    if (!tenant || tenant.length === 0 || !subject || subject.length === 0) return null;
    // Both halves are percent-encoded: they are opaque token values, and an
    // unescaped delimiter lets `tid=a:b`/`sub=c` and `tid=a`/`sub=b:c` resolve to
    // one slot — a cross-tenant collision in the key that prevents exactly that.
    return `${STORAGE_PREFIX}:${encodeIdentityPart(tenant)}:${encodeIdentityPart(subject)}`;
  }

  /**
   * Read the stored list, distinguishing "nothing stored" from "could not be
   * read". A malformed ENTRY is filtered out (per-field validation, ADR-0065 §6);
   * storage that cannot be parsed or reached at all is `ok: false`.
   */
  private read(): ReadOutcome {
    if (!isPlatformBrowser(this.platformId)) return { entries: [], ok: true };
    const key = this.key();
    if (!key) return { entries: [], ok: true };
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { entries: [], ok: true };
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { entries: [], ok: false };
      return { entries: parsed.filter(isPersistedConversation), ok: true };
    } catch {
      // Corrupt or unreadable storage never throws out of here — but it is
      // reported as a failed read rather than as an empty history.
      return { entries: [], ok: false };
    }
  }

  /** True when the entries are persisted; false when the browser refused. */
  private write(entries: readonly PersistedConversation[]): boolean {
    if (!isPlatformBrowser(this.platformId)) return true;
    const key = this.key();
    if (!key) return true;
    try {
      localStorage.setItem(key, JSON.stringify(entries));
      return true;
    } catch {
      // Over quota or storage disabled: the caller is told, so the UI can be.
      return false;
    }
  }

  private remove(): boolean {
    if (!isPlatformBrowser(this.platformId)) return true;
    const key = this.key();
    if (!key) return true;
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
}

/** Outcome of a storage read: entries plus whether the read itself succeeded. */
interface ReadOutcome {
  readonly entries: PersistedConversation[];
  readonly ok: boolean;
}

/** Browser storage could not be read or written. Carries no user-facing prose. */
export class ChatHistoryUnavailableError extends Error {
  constructor(readonly operation: 'read' | 'write') {
    super(`chat history storage ${operation} failed`);
    this.name = 'ChatHistoryUnavailableError';
  }
}

/**
 * A write the store REFUSED: storage itself is readable and writable, but the
 * conversation this write targets is not in it, so nothing was persisted. Kept
 * distinct from {@link ChatHistoryUnavailableError} because the cause differs —
 * and reported for the same reason: no caller may read a refusal as a save.
 */
export class ChatHistoryWriteRefusedError extends Error {
  constructor(readonly conversationId: string) {
    // Developer-facing only; the user sees the state layer's PERSIST key.
    // i18n-ignore-next-line: Error message for the console, never rendered
    super(`chat history write refused: conversation ${conversationId} is not stored`);
    this.name = 'ChatHistoryWriteRefusedError';
  }
}

/**
 * The store the chat state reads and writes. Provide a server-backed
 * implementation here once the history endpoints exist.
 */
export const CHAT_HISTORY_STORE = new InjectionToken<ChatHistoryStore>('CHAT_HISTORY_STORE', {
  providedIn: 'root',
  factory: () => inject(LocalChatHistoryStore),
});

/**
 * Keep the entry just written, then as many others as the budget allows, pinned
 * first. The written entry is held out of the trim: an earlier version dropped it
 * when the budget was already full of pinned conversations, so the chat the user
 * was in silently stopped persisting.
 */
function trimToBudget(
  kept: PersistedConversation,
  others: readonly PersistedConversation[],
): PersistedConversation[] {
  const pinned = others.filter(entry => entry.pinned);
  const rest = others.filter(entry => !entry.pinned);
  return [kept, ...pinned, ...rest].slice(0, MAX_CONVERSATIONS);
}

function toConversation(entry: PersistedConversation): ChatConversation {
  return {
    id: entry.id,
    title: entry.title,
    preview: entry.preview,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt),
    pinned: entry.pinned,
  };
}

function toMessage(entry: PersistedMessage): ChatMessage | null {
  const role = entry.role === 'user' ? 'user' : entry.role === 'assistant' ? 'assistant' : null;
  if (!role) return null;

  const blocks: readonly ChatBlock[] = Array.isArray(entry.blocks) ? coerceBlocks(entry.blocks) : [];
  const timestamp = new Date(entry.timestamp);

  return {
    id: entry.id,
    role,
    blocks,
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    pending: false,
  };
}

function isMessage(message: ChatMessage | null): message is ChatMessage {
  return message !== null;
}

function isPersistedMessage(value: unknown): value is PersistedMessage {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PersistedMessage>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.role === 'string' &&
    isDateString(entry.timestamp) &&
    Array.isArray(entry.blocks)
  );
}

function isPersistedConversation(value: unknown): value is PersistedConversation {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PersistedConversation>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.preview === 'string' &&
    typeof entry.pinned === 'boolean' &&
    // Parseable, not merely present: an unparseable date became an Invalid Date
    // that survived the read and then threw in `toISOString()` on the next pin.
    isDateString(entry.createdAt) &&
    isDateString(entry.updatedAt) &&
    Array.isArray(entry.messages)
  );
}

function isDateString(value: unknown): boolean {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

/** Pinned conversations lead; the rest fall back to most-recently-updated. */
function byPinnedThenRecent(left: ChatConversation, right: ChatConversation): number {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
  return right.updatedAt.getTime() - left.updatedAt.getTime();
}
