import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';

export interface ChatRequest {
  sessionId: string;
  message:   string;
}

export interface ChatResponse {
  reply:     string;
  sessionId: string;
}

/**
 * ChatApiService
 * --------------
 * Placeholder service for LLM / chat-backend integration.
 *
 * TODO: Replace the stub implementation once the backend chat endpoint is available.
 * Expected endpoint:   POST /chat/message
 * Expected contract:   ChatRequest → ChatResponse
 *
 * This service is intentionally decoupled from ChatStateService so the transport
 * layer can evolve independently (e.g., switch to WebSocket without touching state).
 */
@Injectable({ providedIn: 'root' })
export class ChatApiService {
  /**
   * sendMessage
   * TODO: Implement HTTP call to backend chat endpoint.
   * Example:
   *   return this.api.post<ChatResponse>('/chat/message', request);
   */
  sendMessage(_request: ChatRequest): Observable<ChatResponse> {
    // Stub – always returns an error so the caller can display a placeholder.
    return throwError(() => new Error('ChatApiService.sendMessage: not yet implemented'));
  }
}
