import { inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ChatBlock, ChatConversation, ChatMessage } from '../models/chat.model';
import { coerceBlocks } from '../util/chat-response.mapper';

/**
 * Conversation persistence seam
 * -----------------------------
 * The MCP server has no conversation-history endpoints yet (backend #2073), so the shipped
 * implementation keeps history in this browser only ({@link LocalChatHistoryStore}).
 * Everything above this file already talks to the async {@link ChatHistoryStore}
 * contract, so turning on server-side history is a provider swap plus flipping
 * `environment.features.chatHistoryApi` — no caller changes.
 *
 * Storage is namespaced by the signed-in subject, so switching accounts in one
 * browser never surfaces another user's conversations.
 */
export interface ChatHistoryStore {
  /** Conversations, newest first. */
  listConversations(): Observable<readonly ChatConversation[]>;
  loadMessages(conversationId: string): Observable<readonly ChatMessage[]>;
  /** Insert or replace a conversation together with its whole message list. */
  saveConversation(conversation: ChatConversation, messages: readonly ChatMessage[]): Observable<void>;
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
    return of(entry ? entry.messages.map(toMessage).filter(isMessage) : []);
  }

  saveConversation(conversation: ChatConversation, messages: readonly ChatMessage[]): Observable<void> {
    const entries = this.read().filter(entry => entry.id !== conversation.id);
    entries.unshift({
      id: conversation.id,
      title: conversation.title,
      preview: conversation.preview,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      pinned: conversation.pinned,
      messages: messages.slice(-MAX_MESSAGES_PER_CONVERSATION).map(message => ({
        id: message.id,
        role: message.role,
        blocks: message.blocks as readonly unknown[],
        timestamp: message.timestamp.toISOString(),
      })),
    });

    this.write(trimToBudget(entries));
    return of(undefined);
  }

  deleteConversation(conversationId: string): Observable<void> {
    this.write(this.read().filter(entry => entry.id !== conversationId));
    return of(undefined);
  }

  clear(): Observable<void> {
    this.remove();
    return of(undefined);
  }

  /** Storage key for the signed-in subject; anonymous sessions get their own slot. */
  private key(): string {
    const subject = this.auth.currentUserClaims()?.sub?.trim();
    return `${STORAGE_PREFIX}:${subject && subject.length > 0 ? subject : 'anonymous'}`;
  }

  private read(): PersistedConversation[] {
    if (!isPlatformBrowser(this.platformId)) return [];
    try {
      const raw = localStorage.getItem(this.key());
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
    try {
      localStorage.setItem(this.key(), JSON.stringify(entries));
    } catch {
      // Over quota or storage disabled: history simply does not persist.
    }
  }

  private remove(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.removeItem(this.key());
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

function trimToBudget(entries: readonly PersistedConversation[]): PersistedConversation[] {
  const pinned = entries.filter(entry => entry.pinned);
  const rest = entries.filter(entry => !entry.pinned);
  return [...pinned, ...rest].slice(0, MAX_CONVERSATIONS);
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

function isPersistedConversation(value: unknown): value is PersistedConversation {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PersistedConversation>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.createdAt === 'string' &&
    typeof entry.updatedAt === 'string' &&
    Array.isArray(entry.messages)
  );
}

/** Pinned conversations lead; the rest fall back to most-recently-updated. */
function byPinnedThenRecent(left: ChatConversation, right: ChatConversation): number {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
  return right.updatedAt.getTime() - left.updatedAt.getTime();
}
