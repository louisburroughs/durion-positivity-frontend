import { describe, expect, it } from 'vitest';
import { Upload } from 'tus-js-client';

describe('tus-js-client test shim', () => {
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
});
