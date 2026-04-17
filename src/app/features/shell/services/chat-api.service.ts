import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  response: string;
}

/**
 * ChatApiService
 * --------------
 * Thin transport wrapper for the MCP chat endpoint exposed through the API gateway.
 * The shell chat UI stays decoupled from HTTP details and only depends on this
 * service contract.
 */
@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private static readonly CHAT_PATH = '/mcp-server/v1/mcp/chat';

  private readonly api = inject(ApiBaseService);

  sendMessage(request: ChatRequest): Observable<ChatResponse> {
    return this.api.post<ChatResponse>(ChatApiService.CHAT_PATH, request);
  }
}
