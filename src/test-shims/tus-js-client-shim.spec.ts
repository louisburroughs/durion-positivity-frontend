import { describe, expect, it, beforeEach } from 'vitest';
import { Upload, tusTestState } from 'tus-js-client';

describe('tus-js-client test shim', () => {
  beforeEach(() => {
    tusTestState.reset();
  });

  it('exposes an Upload constructor for test environments', () => {
    const upload = new Upload(new File(['payload'], 'demo.txt', { type: 'text/plain' }), {
      endpoint: 'https://example.test/files',
    });

    expect(upload).toBeDefined();
    expect(typeof upload.start).toBe('function');
    expect(typeof upload.abort).toBe('function');
    expect(typeof upload.findPreviousUploads).toBe('function');
    expect(typeof upload.resumeFromPreviousUpload).toBe('function');
  });

  // The `tus-js-client` alias is easy to lose: the builder ignores
  // vitest.config.ts unless `runnerConfig` points at it, and the real package's
  // Upload has the same method names, so the assertions above pass either way.
  // Importing `tusTestState` only resolves against the shim, and recording
  // proves the alias is actually in force.
  it('records constructed uploads so specs can assert on them', () => {
    const file = new File(['payload'], 'demo.txt', { type: 'text/plain' });
    new Upload(file, { endpoint: 'https://example.test/files' });

    expect(tusTestState.instances).toHaveLength(1);
    expect(tusTestState.instances[0].file).toBe(file);
    expect(tusTestState.instances[0].options.endpoint).toBe('https://example.test/files');
  });

  it('routes instance methods through the swappable hooks', async () => {
    const previous = [{ uploadUrl: 'https://example.test/files/abc' }];
    const started: string[] = [];
    tusTestState.start = () => started.push('start');
    tusTestState.findPreviousUploads = async () => previous;

    const upload = new Upload(new File(['payload'], 'demo.txt'), {});
    upload.start();

    expect(started).toEqual(['start']);
    await expect(upload.findPreviousUploads()).resolves.toBe(previous);
  });

  it('reset() clears recorded instances and restores default hooks', async () => {
    tusTestState.start = () => {
      throw new Error('should have been reset');
    };
    new Upload(new File(['payload'], 'demo.txt'), {});

    tusTestState.reset();

    expect(tusTestState.instances).toHaveLength(0);
    expect(() => tusTestState.start()).not.toThrow();
    await expect(tusTestState.findPreviousUploads()).resolves.toEqual([]);
  });
});
