import {
  computed,
  DestroyRef,
  Directive,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChatBlobService } from '../services/chat-blob.service';

/**
 * AuthedImageDirective
 * --------------------
 * Binds `src` on an `<img>` to a URL the browser can actually fetch.
 *
 * Binding `[src]` straight to an answer's URL means the browser requests it
 * without the bearer token — `authInterceptor` only sees `HttpClient` traffic —
 * so a same-origin API blob renders broken. This resolves the URL through
 * {@link ChatBlobService} first, and on failure leaves `src` unset so the alt
 * text stands in rather than a broken-image icon.
 */
@Directive({
  selector: 'img[appAuthedSrc]',
  standalone: true,
  host: {
    '[attr.src]': 'resolved()',
    '[class.is-unavailable]': 'failed()',
  },
})
export class AuthedImageDirective {
  private readonly blobs = inject(ChatBlobService);
  private readonly destroyRef = inject(DestroyRef);

  readonly appAuthedSrc = input.required<string>();

  private readonly objectUrl = signal<string | null>(null);
  readonly failed = signal(false);

  /** `null` keeps the attribute off the element entirely. */
  readonly resolved = computed(() => this.objectUrl());

  constructor() {
    effect(onCleanup => {
      const source = this.appAuthedSrc();
      this.objectUrl.set(null);
      this.failed.set(false);
      if (!source) return;

      const subscription = this.blobs
        .resolve(source)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: url => this.objectUrl.set(url),
          error: () => this.failed.set(true),
        });
      onCleanup(() => subscription.unsubscribe());
    });
  }
}
