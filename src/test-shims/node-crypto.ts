const browserCrypto = globalThis.crypto as Crypto | undefined;

export const randomFillSync = (buffer: Uint8Array): Uint8Array => {
  if (browserCrypto?.getRandomValues) {
    browserCrypto.getRandomValues(buffer as Uint8Array<ArrayBuffer>);
    return buffer;
  }

  throw new Error('crypto.getRandomValues is not available in this environment');
};

export const randomUUID = (): string => {
  if (browserCrypto?.randomUUID) {
    return browserCrypto.randomUUID();
  }

  throw new Error('crypto.randomUUID is not available in this environment');
};

export const createHash = (algorithm: string) => {
  const normalizedAlgorithm = algorithm.toLowerCase();
  let subtleAlgorithm: string | null = null;

  if (normalizedAlgorithm === 'sha1') {
    subtleAlgorithm = 'SHA-1';
  } else if (normalizedAlgorithm === 'sha256') {
    subtleAlgorithm = 'SHA-256';
  } else if (normalizedAlgorithm === 'sha384') {
    subtleAlgorithm = 'SHA-384';
  } else if (normalizedAlgorithm === 'sha512') {
    subtleAlgorithm = 'SHA-512';
  }

  if (!browserCrypto?.subtle || !subtleAlgorithm) {
    throw new Error(`createHash is not available for ${algorithm}`);
  }

  let buffer = new Uint8Array();
  const encoder = new TextEncoder();

  return {
    update(data: string | ArrayBuffer | Uint8Array) {
      let nextChunk: Uint8Array;
      if (typeof data === 'string') {
        nextChunk = encoder.encode(data);
      } else if (data instanceof Uint8Array) {
        nextChunk = data;
      } else {
        nextChunk = new Uint8Array(data);
      }

      const merged = new Uint8Array(buffer.length + nextChunk.byteLength);
      merged.set(buffer);
      merged.set(nextChunk, buffer.length);
      buffer = merged;
      return this;
    },
    async digest(encoding?: string) {
      const digest = await browserCrypto.subtle.digest(subtleAlgorithm, buffer);
      const bytes = new Uint8Array(digest);

      if (encoding === 'hex') {
        return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
      }

      return bytes;
    },
  };
};

export const webcrypto = browserCrypto;

export default {
  randomFillSync,
  randomUUID,
  webcrypto,
  createHash,
};
