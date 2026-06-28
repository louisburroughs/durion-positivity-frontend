import { PLATFORM_ID } from '@angular/core';
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

function provide(platform: string, fonts: unknown): IconFontService {
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

describe('IconFontService', () => {
  it('stays not-ready on the server platform', () => {
    const svc = provide('server', fontStub({ check: true, load: Promise.resolve() }));
    expect(svc.ready()).toBe(false);
  });

  it('stays not-ready when the Font Loading API is unavailable', () => {
    const svc = provide('browser', undefined);
    expect(svc.ready()).toBe(false);
  });

  it('becomes ready immediately when the font is already cached', () => {
    const svc = provide('browser', fontStub({ check: true, load: Promise.resolve() }));
    expect(svc.ready()).toBe(true);
  });

  it('becomes ready after the font loads', async () => {
    let resolved = false;
    const load = Promise.resolve().then(() => { resolved = true; });
    // check() returns false until the load promise has settled
    const fonts = { check: () => resolved, load: () => load, ready: Promise.resolve() };
    const svc = provide('browser', fonts);
    expect(svc.ready()).toBe(false);
    await load;
    expect(svc.ready()).toBe(true);
  });

  it('stays not-ready when the font fails to load (CSP/offline)', async () => {
    const load = Promise.reject(new Error('blocked'));
    const svc = provide('browser', fontStub({ check: false, load }));
    await load.catch(() => undefined);
    expect(svc.ready()).toBe(false);
  });
});
