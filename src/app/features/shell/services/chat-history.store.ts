import { inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ChatBlock, ChatConversation, ChatMessage } from '../models/chat.model';
import { coerceBlocks } from '../util/chat-response.mapper';

/**
 * Conversation persistence seam
 * -----------------------------
 * The MCP server has no conversation-history endpoints yet (backend #2073), so the
 * shipped implementation keeps history in this browser only
 * ({@link LocalChatHistoryStore}). Everything above this file already talks to the
 * async {@link ChatHistoryStore} contract, so server-side history means providing a
 * remote implementation for {@link CHAT_HISTORY_STORE} — one provider line, no
 * caller changes.
 *
 * Storage is namespaced by the token's tenant AND subject, so neither switching
 * accounts nor switching tenants in one browser can surface conversations that
 * belong to the other — and those conversations quote customer and invoice data
 * (ADR-0062: the tenant comes from the token's `tid` claim, nowhere else).
 */
export interface ChatHistoryStore {
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
  /** Replace a conversation's whole message list. */
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

  listConversations(): Observable<readonly ChatConversation[]> {
    const conversations = this.read()
      .map(entry => toConversation(entry))
      .sort(byPinnedThenRecent);
    return of(conversations);
  }

  loadMessages(conversationId: string): Observable<readonly ChatMessage[]> {
    const entry = this.read().find(candidate => candidate.id === conversationId);
    if (!entry) return of([]);
    // Each entry is validated before conversion: `read()` only checks that
    // `messages` is an array, so a null or malformed member would otherwise throw
    // here and break the promise that corrupt storage reads as empty history.
    return of(entry.messages.filter(isPersistedMessage).map(toMessage).filter(isMessage));
  }

  saveConversation(conversation: ChatConversation): Observable<void> {
    const stored = this.read();
    const existing = stored.find(entry => entry.id === conversation.id);

    this.upsert(stored, {
      id: conversation.id,
      title: conversation.title,
      preview: conversation.preview,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      pinned: conversation.pinned,
      // Carry the stored messages forward: metadata writes never touch them.
      messages: existing?.messages ?? [],
    });
    return of(undefined);
  }

  saveMessages(conversationId: string, messages: readonly ChatMessage[]): Observable<void> {
    const stored = this.read();
    const existing = stored.find(entry => entry.id === conversationId);
    if (!existing) return of(undefined);

    this.upsert(stored, {
      ...existing,
      messages: messages.slice(-MAX_MESSAGES_PER_CONVERSATION).map(message => ({
        id: message.id,
        role: message.role,
        blocks: message.blocks as readonly unknown[],
        timestamp: message.timestamp.toISOString(),
      })),
    });
    return of(undefined);
  }

  /** Move an entry to the front of the stored list and write it back. */
  private upsert(stored: readonly PersistedConversation[], entry: PersistedConversation): void {
    const rest = stored.filter(candidate => candidate.id !== entry.id);
    this.write(trimToBudget(entry, rest));
  }

  deleteConversation(conversationId: string): Observable<void> {
    this.write(this.read().filter(entry => entry.id !== conversationId));
    return of(undefined);
  }

  clear(): Observable<void> {
    this.remove();
    return of(undefined);
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
    return `${STORAGE_PREFIX}:${tenant}:${subject}`;
  }

  private read(): PersistedConversation[] {
    if (!isPlatformBrowser(this.platformId)) return [];
    const key = this.key();
    if (!key) return [];
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isPersistedConversation) : [];
    } catch {
      // Corrupt or unreadable storage is treated as empty history, never fatal.
      return [];
    }
  }

  private write(entries: readonly PersistedConversation[]): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const key = this.key();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(entries));
    } catch {
      // Over quota or storage disabled: history simply does not persist.
    }
  }

  private remove(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const key = this.key();
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing actionable — the in-memory state is already cleared by the caller.
    }
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
