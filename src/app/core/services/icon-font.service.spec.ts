import { ApplicationRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IconFontService } from './icon-font.service';

/** Minimal FontFaceSet stand-in covering the members the service touches. */
function fontStub(opts: { check: boolean; load: Promise<unknown>; ready?: Promise<unknown> }) {
  return {
    check: () => opts.check,
    load: () => opts.load,
    ready: opts.ready ?? Promise.resolve(),
  };
}

function setup(platform: string, fonts: unknown): IconFontService {
  if (fonts === undefined) {
    delete (document as unknown as { fonts?: unknown }).fonts;
  } else {
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
  }
  TestBed.configureTestingModule({
    providers: [
      IconFontService,
      { provide: PLATFORM_ID, useValue: platform },
    ],
  });
  return TestBed.inject(IconFontService);
}

/** Flush `afterNextRender` callbacks (they run during the render phase). */
function render(): void {
  TestBed.inject(ApplicationRef).tick();
}

describe('IconFontService', () => {
  // Detection runs in afterNextRender, which is browser-only at runtime — on the
  // server the callback never fires, so `ready` stays false (the SSR fallback).
  // TestBed can't switch off render hooks per platform, so server safety is
  // covered by the "no flip before the first render" case below instead.

  it('stays not-ready when the Font Loading API is unavailable', () => {
    const svc = setup('browser', undefined);
    render();
    expect(svc.ready()).toBe(false);
  });

  it('does not flip ready before the first render (hydration safety)', () => {
    const svc = setup('browser', fontStub({ check: true, load: Promise.resolve() }));
    // no render() yet — initial paint must match SSR (fallback)
    expect(svc.ready()).toBe(false);
  });

  it('becomes ready after first render when the font is already cached', () => {
    const svc = setup('browser', fontStub({ check: true, load: Promise.resolve() }));
    render();
    expect(svc.ready()).toBe(true);
  });

  it('becomes ready after the font finishes loading', async () => {
    let resolved = false;
    const load = Promise.resolve().then(() => { resolved = true; });
    const fonts = { check: () => resolved, load: () => load, ready: Promise.resolve() };
    const svc = setup('browser', fonts);
    render();
    expect(svc.ready()).toBe(false);
    await load;
    expect(svc.ready()).toBe(true);
  });

  it('stays not-ready when the font fails to load (CSP/offline)', async () => {
    const load = Promise.reject(new Error('blocked'));
    const svc = setup('browser', fontStub({ check: false, load }));
    render();
    await load.catch(() => undefined);
    expect(svc.ready()).toBe(false);
  });
});
