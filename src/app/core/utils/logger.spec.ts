import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('warn forwards the message and extra args to console.warn', () => {
    logger.warn('[thing] degraded', { detail: 1 });

    expect(warnSpy).toHaveBeenCalledWith('[thing] degraded', { detail: 1 });
  });

  it('error forwards the message and extra args to console.error', () => {
    const err = new Error('boom');
    logger.error('[thing] failed', err);

    expect(errorSpy).toHaveBeenCalledWith('[thing] failed', err);
  });
});
