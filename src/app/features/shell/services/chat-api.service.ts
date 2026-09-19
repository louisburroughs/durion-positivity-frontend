import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  /** Markdown answer. Parsed into typed blocks client-side by `chat-response.mapper.ts`. */
  response: string;
  /**
   * Typed blocks, when the server produces them. Absent today — the mapper falls
   * back to deriving structure from `response` until the MCP server sends this
   * (backend #2072).
   */
  blocks?: readonly unknown[];
}

export interface RagDocumentMetadata {
  source: string;
  type: string;
  title: string;
}

export interface RagIngestRequest {
  content: string;
  metadata: RagDocumentMetadata;
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
  private static readonly RAG_DOCUMENTS_PATH = '/mcp-server/v1/mcp/documents';
  private static readonly GATEWAY_BASE_URL = environment.apiBaseUrl.replace(/\/api\/?$/, '');

  private readonly api = inject(ApiBaseService);

  sendMessage(request: ChatRequest): Observable<ChatResponse> {
    return this.api.post<ChatResponse>(ChatApiService.CHAT_PATH, request, {
      baseUrlOverride: ChatApiService.GATEWAY_BASE_URL,
    });
  }

  /**
   * Ingest a document into the assistant's retrieval corpus.
   *
   * No identity or authority headers: who the caller is and what they may do come
   * from the bearer token alone (ADR-0011, ADR-0062). A browser-supplied
   * `X-User`/`X-Authorities` pair is either overwritten by the gateway — dead
   * code that reads as if the client granted itself the authority — or trusted by
   * it, which is a privilege escalation anyone with the devtools can perform.
   */
  ingestDocument(request: RagIngestRequest): Observable<void> {
    return this.api.post<void>(ChatApiService.RAG_DOCUMENTS_PATH, request, {
      baseUrlOverride: ChatApiService.GATEWAY_BASE_URL,
    });
  }
}

