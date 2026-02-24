import { Injectable, signal, computed } from '@angular/core';

export interface ChatMessage {
  id:        string;
  content:   string;
  sender:    'user' | 'system';
  timestamp: Date;
}

/**
 * ChatStateService
 * ----------------
 * In-memory store for chat messages.
 * Uses Angular signals so components reactively update without subscriptions.
 *
 * This service intentionally has NO knowledge of HTTP/LLM — that concern
 * belongs to ChatApiService which this service may call in the future.
 */
@Injectable({ providedIn: 'root' })
export class ChatStateService {
  private readonly _messages = signal<ChatMessage[]>([]);

  readonly messages = this._messages.asReadonly();
  readonly isEmpty  = computed(() => this._messages().length === 0);

  addUserMessage(content: string): ChatMessage {
    const msg: ChatMessage = {
      id:        crypto.randomUUID(),
      content:   content.trim(),
      sender:    'user',
      timestamp: new Date(),
    };
    this._messages.update(msgs => [...msgs, msg]);
    return msg;
  }

  addSystemMessage(content: string): ChatMessage {
    const msg: ChatMessage = {
      id:        crypto.randomUUID(),
      content:   content.trim(),
      sender:    'system',
      timestamp: new Date(),
    };
    this._messages.update(msgs => [...msgs, msg]);
    return msg;
  }

  clear(): void {
    this._messages.set([]);
  }
}
