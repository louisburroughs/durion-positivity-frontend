import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

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
  private readonly authService = inject(AuthService);
  private readonly _messages = signal<ChatMessage[]>([]);

  // Tracks the sub of the user who owns the current in-memory messages.
  // Plain (non-signal) field — changes to this do not re-trigger the effect.
  private trackedUserId: string | null = null;

  readonly messages = this._messages.asReadonly();
  readonly isEmpty  = computed(() => this._messages().length === 0);

  constructor() {
    effect(() => {
      const newUserId = this.authService.currentUserClaims()?.sub ?? null;
      if (newUserId !== null && this.trackedUserId !== null && newUserId !== this.trackedUserId) {
        this._messages.set([]);
      }
      this.trackedUserId = newUserId;
    });
  }

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
